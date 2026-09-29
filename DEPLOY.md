# استقرار «کو کافه» روی VPS

> **مسیر رسمی جدید:** انتشار production فقط از GitHub و Docker انجام می‌شود.
> [راهنمای Docker و GitHub CI/CD](docs/DOCKER_GITHUB_CICD_FA.md) مرجع اصلی
> است. مطالب PM2 این فایل صرفاً برای شناخت استقرار قدیمی و rollback دورهٔ
> مهاجرت نگه داشته شده‌اند.

سایت **کاملاً پویا** است و باید با Node اجرا شود: احراز هویت، پنل ادمین، پنل
کافه‌دار، ثبت نظر و بخش مشارکت همه Server Action دارند. خروجی استاتیک
(`output: 'export'`) برای این پروژه ممکن نیست — Next آن حالت را با Server Action
اصلاً build نمی‌کند.

## بکاپ کامل و بازیابی روی سرور تازه

بکاپ production شامل سورس همین worktree، schema و تمام داده‌های MariaDB،
مدیا، نقشه‌ها، فایل محیط و خود اسکریپت بازیابی است:

```bash
sudo KUCAFE_ENV_FILE=/path/to/.env.local npm run backup:full
```

خروجی در `/var/backups/kucafe/` با دسترسی `0600` ساخته می‌شود و کنار آن
فایل SHA-256 قرار می‌گیرد. چون آرشیو شامل `SESSION_SECRET` و رمز دیتابیس است،
باید مثل رمز عبور نگهداری شود.

روی یک Ubuntu/Debian تازه، آرشیو و checksum را منتقل و اجرا کنید:

```bash
tar -xOzf kucafe-full-*.tar.gz restore-full.sh > restore-full.sh
chmod 700 restore-full.sh
sudo ./restore-full.sh kucafe-full-*.tar.gz \
  --domain kucafe.ir --email admin@example.com
```

اسکریپت Node.js 22، MariaDB، Nginx، systemd و Certbot را آماده می‌کند، داده
و تصاویر را برمی‌گرداند، build production می‌سازد و در پایان سلامت دیتابیس
و سرویس را بررسی می‌کند. گزینه‌های کامل با `./restore-full.sh --help` دیده
می‌شوند.

معماری روی سرور:

```
مرورگر ──▶ وب‌سرور :443/:80
              ├── /map/ /media/ /fonts/ /_next/static/  → مستقیم از دیسک
              └── بقیه‌ی مسیرها                          → 127.0.0.1:3000 (Next با PM2)
                                                              └──▶ MySQL/MariaDB
```

---

## ⚠️ اول این را بخوانید: کدام وب‌سرور؟

دو پیکربندی در `deploy/` هست و **باید یکی را انتخاب کنید**:

| فایل | کِی |
| --- | --- |
| `deploy/apache-kucafe.conf` | سرور از قبل آپاچی دارد (DirectAdmin/cPanel) — **سرور فعلی همین است** |
| `deploy/nginx.conf` + `deploy/kucafe-proxy.conf` | سرور خالی است و وب‌سرورش را خودتان می‌گذارید |

سرورِ فعلیِ `45.159.115.116` یک ماشین **DirectAdmin** است: آپاچی روی ۸۰ و ۴۴۳
نشسته و چهار دامنه‌ی دیگر (`pakerino.ir`، `greensmoke.ir`، `coco.pakerino.ir`،
`agent.pakerino.ir`) به‌علاوه‌ی میل‌سرور (Exim/Dovecot) و FTP را سرو می‌کند.
دیتابیسش **MariaDB 10.6** است، نه MySQL 8.

روی چنین سروری nginx نصب نکنید — روی پورت ۸۰ با آپاچی تصادف می‌کند و آن چهار
سایت می‌خوابند. بخش ۶ را ببینید.

---

## ۱. پیش‌نیاز روی سرور

```bash
node -v          # ۲۰ یا بالاتر
mysql --version  # MySQL ۸+ یا MariaDB ۱۰.۶+ (هر دو تست شده)
sudo npm i -g pm2
```

MySQL باید `utf8mb4` باشد. دیتابیس و کاربر:

```sql
CREATE DATABASE kucafe CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'kucafe'@'localhost' IDENTIFIED BY 'یک-رمز-قوی';
GRANT ALL PRIVILEGES ON kucafe.* TO 'kucafe'@'localhost';
FLUSH PRIVILEGES;
```

منطقه‌ی زمانی سرورِ دیتابیس **لازم نیست** UTC باشد: اپ روی هر اتصالِ استخر
خودش `SET time_zone='+00:00'` می‌زند (`src/db/connection.ts`). پس روی سروری
مثل همین که `Asia/Tehran` است هم درست کار می‌کند و لازم نیست `my.cnf` را —
که روی بقیه‌ی سایت‌های آن ماشین هم اثر دارد — دست بزنید.

`npm run db:verify` همین را می‌سنجد: اینکه *نشستِ اپ* UTC می‌خواند، نه تنظیم
سراسری.

## ۲. کد و تنظیمات

```bash
sudo mkdir -p /var/www/kucafe && sudo chown $USER:$USER /var/www/kucafe
git clone <repo> /var/www/kucafe && cd /var/www/kucafe

npm ci          # devDependencies هم لازم است: next build به typescript و
                # db:migrate به drizzle-kit نیاز دارد. --omit=dev نزنید.

cp .env.example .env.local && nano .env.local
```

در `.env.local`:

```ini
NEXT_PUBLIC_SITE_URL=https://kucafe.ir
DATABASE_URL=mysql://kucafe:رمز@127.0.0.1:3306/kucafe
SESSION_SECRET=            # node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
AUTH_DEV_MODE=false        # ⚠️ اجباری. با true هیچ پیامکی نمی‌رود و کد در لاگ چاپ می‌شود.
SMSIR_API_KEY=
SMSIR_TEMPLATE_ID=
ADMIN_PHONES=09xxxxxxxxx
```

## ۳. دیتابیس

```bash
npm run db:migrate     # drizzle-kit migrate + db:extras + db:mariadb-fix
npm run db:verify      # ۱۲ بررسی ساختاری
```

`db:migrate` را استفاده کنید نه `db:push`. تفاوت:

| دستور | کار | کجا |
| --- | --- | --- |
| `db:generate` | از تغییر `schema.ts` فایل SQL می‌سازد (در git) | محلی |
| `db:migrate` | مهاجرت‌های موجود را اعمال می‌کند — تکرارپذیر و امن | **سرور** |
| `db:push` | شما را مستقیم اعمال می‌کند؛ می‌تواند ستون DROP کند | فقط محلی |

`db:migrate` سه کار می‌کند و همه‌شان لازم‌اند:

| مرحله | چرا |
| --- | --- |
| `drizzle-kit migrate` | جدول‌ها را می‌سازد |
| `db:extras` | ایندکس `FULLTEXT` که drizzle تولید نمی‌کند — بدونش جست‌وجوی نام کافه کار نمی‌کند |
| `db:mariadb-fix` | تایم‌استمپ‌های nullable روی MariaDB (بخش «آنچه فرق داشت» را ببینید). روی MySQL بی‌اثر است |

### داده

```bash
npm run import:cafes      # ۳۳۱ کافه و ۱۹٬۳۸۶ آیتم منو
npm run build:facets      # رول‌آپ دسته‌ها
npm run attributes:seed
npm run media:download    # ۲۷٬۸۱۸ تصویر WebP (~۱ گیگ) — طول می‌کشد
npm run user:create       # اولین ادمین
```

## ۴. نقشه

```bash
npm run map:extract       # از PBF → src/data/map/*.geojson (سنگین، یک‌بار)
npm run map:publish       # → public/map/*.geojson که مرورگر مصرف می‌کند
npm run map:smoke
```

`map:publish` خودکار در `prebuild` هم اجرا می‌شود. `src/data/map/` در git است
ولی `public/map/` نه (خروجیِ تولیدشده)، پس روی سرور تازه این مرحله اجباری است —
بدون آن `/api/map/style` با ۵۰۳ جواب می‌دهد و نقشه خالی می‌ماند.

## ۵. build و PM2

```bash
npm run build
mkdir -p logs
pm2 start ecosystem.config.cjs --env production
pm2 save && pm2 startup      # بالا آمدن خودکار بعد از ری‌بوت
pm2 logs kucafe
```

`ecosystem.config.cjs` عمداً `fork` با **یک** instance است. دلیلش آنجا مفصل
نوشته شده: اپ چند کشِ درون‌فرآیندی دارد که با نوشتن ادمین باطل می‌شوند، و در
حالت `cluster` آن باطل‌سازی فقط به یک worker می‌رسد — یعنی ادمین قیمت را عوض
می‌کند و بسته به اینکه به کدام worker بیفتد، مقدار قدیم یا جدید می‌بیند.

## ۶. وب‌سرور

### الف) آپاچی — سرورِ فعلی (DirectAdmin)

```bash
cp deploy/apache-kucafe.conf /etc/httpd/conf/extra/kucafe.conf
printf '\nInclude conf/extra/kucafe.conf\n' >> /etc/httpd/conf/extra/httpd-vhosts.conf
httpd -t && systemctl reload httpd
```

⚠️ **دو تله که یک‌بار خوردیم:**

**۱. آدرس vhost باید صریح باشد، نه `*:80`.** همه‌ی vhostهای این سرور
`<VirtualHost 45.159.115.116:80>` هستند. آپاچی `*:80` و `IP:80` را دو سبدِ
جدا می‌شمارد؛ vhostِ wildcard سبدِ خودش را می‌سازد و **پیش‌فرضِ همه‌ی
درخواست‌ها** می‌شود — یعنی هر چهار سایت دیگر به پروکسیِ Node می‌روند و ۵۰۳
می‌گیرند. اگر IP سرور عوض شد، این فایل هم باید عوض شود.

**۲. قبل از reload وضعیت سایت‌های دیگر را بگیرید و بعدش مقایسه کنید.**
`deploy/server/vhost-apply.sh` (روی سرور در `/root/kucafe-xfer/`) همین کار را
می‌کند و اگر سایتی از ۲۰۰ خارج شد، خودش برمی‌گرداند. با آن اعمال کنید نه دستی.

**۳. `ProxyPass … !` باید قبل از `ProxyPass /` بیاید.** آپاچی قواعد را به
ترتیب می‌سنجد و `/` همه‌چیز را می‌گیرد. استثناها (فایل‌های استاتیک و
`/_offline.html`) اگر بعدش باشند بی‌اثرند.

**۴. تست را با IP واقعی بزنید، نه `127.0.0.1`.** vhost روی
`45.159.115.116:80` گوش می‌دهد؛ درخواست به `127.0.0.1` **قبل از** تطبیق
`ServerName` به vhost پیش‌فرض می‌افتد و شما صفحه‌ی
«webserver is functioning normally» دایرکت‌ادمین را می‌بینید و فکر می‌کنید
پروکسی خراب است:

```bash
curl --resolve kucafe.ir:80:45.159.115.116 http://kucafe.ir/search
```

بعد از وصل‌شدن DNS، برای TLS:

```bash
certbot certonly --webroot -w /var/www/kucafe/public -d kucafe.ir -d www.kucafe.ir
```

بعد بلوک ۴۴۳ را طبق توضیح انتهای `apache-kucafe.conf` اضافه کنید و در آن
`X-Forwarded-Proto` را به `https` عوض کنید. (یا دامنه را در پنل DirectAdmin
اضافه کنید و از Let's Encryptِ خودش استفاده کنید.)

### ب) nginx — فقط روی سرورِ خالی

```bash
sudo mkdir -p /etc/nginx/snippets /var/cache/nginx
sudo cp deploy/kucafe-proxy.conf /etc/nginx/snippets/
sudo cp deploy/nginx.conf /etc/nginx/sites-available/kucafe.ir
sudo sed -i 's#/var/www/kucafe#/مسیر/شما#g' /etc/nginx/sites-available/kucafe.ir
sudo ln -s /etc/nginx/sites-available/kucafe.ir /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d kucafe.ir -d www.kucafe.ir
```

وب‌سرور باید به فایل‌های پروژه دسترسی خواندن داشته باشد:

```bash
sudo chmod o+x /var/www /var/www/kucafe
```

## ۷. بررسی نهایی

```bash
npm run deploy:verify                     # db:verify + map:smoke + query:smoke
npm run pages:smoke https://kucafe.ir     # ۱۵ صفحه‌ی عمومی
```

برای صفحات پشتِ ورود، کوکی بسازید:

```bash
npx tsx --conditions=react-server scripts/session-token.ts 09xxxxxxxxx > .cookie.tmp
npm run pages:smoke https://kucafe.ir
rm .cookie.tmp        # ⚠️ توکن نشست است — نگهش ندارید
```

---

## دیپلویِ بعدی

```bash
cd /var/www/kucafe
git pull
npm ci                # فقط اگر package-lock عوض شده
npm run deploy        # db:migrate → build → pm2 reload
```

`pm2 reload` و نه `restart`: بی‌قطعی است و درخواست‌های در جریان (ثبت نظری که
همان لحظه فرستاده شده) تمام می‌شوند.

## اگر چیزی خراب شد

| نشانه | علت محتمل |
| --- | --- |
| نقشه خالی، `/api/map/style` → ۵۰۳ | `npm run map:publish` اجرا نشده |
| لایه‌های نقشه ۳.۴MB می‌آیند نه ۶۷۵KB | `gzip_types` در nginx `application/geo+json` ندارد |
| بعد از ورود به http پرت می‌شود | `X-Forwarded-Proto` در snippet پروکسی نیست |
| کد OTP نمی‌رسد ولی در لاگ هست | `AUTH_DEV_MODE` روی `false` نیست |
| «الان باز است؟» غلط | منطقه‌ی زمانی MySQL روی UTC نیست |
| ادمین تغییر می‌دهد و دیده نمی‌شود | PM2 در `cluster` با چند instance است |
| آپلود تصویر ۴۱۳ | `client_max_body_size` (nginx) یا `LimitRequestBody` (آپاچی) کم است |
| `db:migrate` → «Access denied for user 'cafegard'» | `DATABASE_URL` در `.env.local` نیست یا `.env.local` جای دیگری است — `drizzle-kit` را باید از ریشه‌ی پروژه اجرا کنید |
| `npm ci` → `ENOTEMPTY` | نصبِ قبلی نیمه‌کاره مانده: `rm -rf node_modules` بعد `npm ci` |
| بعد از reload آپاچی، سایت‌های دیگر ۵۰۳ | آدرس vhost `*:80` است نه IP صریح — بخش ۶-الف |

---

## آنچه روی این سرور خاص فرق داشت

سه محدودیت که در کد یا کانفیگ لحاظ شده‌اند و اگر روی سرور دیگری رفتید ممکن است
لازم نباشند:

**۱. CPU از `sharp` پشتیبانی نمی‌کند.** `QEMU Virtual CPU version 2.5+` بدون
SSE4.2/POPCNT/SSSE3 — یعنی x86-64 پایه، قبل از x86-64-v2. باینری‌های آماده‌ی
sharp اجرا نمی‌شوند و ساخت از منبع هم ممکن نیست (sharp ۰٫۳۵ به
`libvips >= 8.18.3` نیاز دارد، اوبونتو ۲۲.۰۴ فقط ۸٫۱۲٫۱ دارد).

`src/core/media/derive.ts` دو موتور دارد و در زمان اجرا انتخاب می‌کند: sharp
اگر بار شد، وگرنه ImageMagick از طریق CLI. روی سرور:

```bash
apt-get install -y imagemagick webp
```

**۲. MariaDB نوع `json` را `longtext + CHECK(json_valid())` پیاده می‌کند.**
برای انتقال داده از MySQL 8 از `scripts/db-dump.mjs` استفاده کنید نه
`mysqldump`: ستون‌های JSON را از `information_schema` می‌شناسد و درست
کدگذاری می‌کند. `mysqldump` علاوه بر این، `COLLATE utf8mb4_0900_*` تولید
می‌کند که MariaDB نمی‌شناسد.

```bash
node scripts/db-dump.mjs data.sql              # همه
node scripts/db-dump.mjs fix.sql audit_log     # فقط یک جدول
```

**۳. MariaDB تایم‌استمپ‌های nullable را `NOT NULL DEFAULT '0000-00-00'` می‌سازد.**
MySQL 8 پیش‌فرض `explicit_defaults_for_timestamp = ON` دارد، MariaDB 10.6 آن را
OFF. با OFF، ستون `TIMESTAMP` که DDL صریحاً `NULL` نکرده باشد `NOT NULL` با
پیش‌فرضِ صفر-تاریخ می‌شود — و درایور صفر-تاریخ را `Invalid Date` می‌خواند.

نتیجه‌اش یک باگ واقعی بود: **ساختِ هر کاربر جدید** (ثبت‌نام با پیامک و ساختِ
حساب کافه‌دار از پنل ادمین) با `RangeError: Invalid time value` می‌افتاد.
`auth:smoke` و `admin:smoke` گرفتنش.

`drizzle/mariadb-timestamps.sql` شش ستون را به همان چیزی که `schema.ts`
می‌گوید برمی‌گرداند. `db:migrate` و `db:push` خودشان اجرایش می‌کنند و روی
MySQL 8 بی‌اثر است (تست شد: قبل و بعد یکسان).

```bash
npm run db:mariadb-fix
```

**۴. منطقه‌ی زمانی سرور `Asia/Tehran` است.** عوض‌کردنش در `my.cnf` روی
میل‌سرور و چهار سایت دیگر اثر می‌گذاشت، پس اپ خودش روی هر اتصال
`SET time_zone='+00:00'` می‌زند (`src/db/connection.ts`). یعنی روی هر سروری با
هر منطقه‌ی زمانی درست کار می‌کند و لازم نیست چیزی تنظیم کنید.
