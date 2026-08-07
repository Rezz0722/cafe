# بریفینگ ادامه‌ی کار — «کو کافه» روی سرور

این فایل برای Claude‌ای است که **روی خودِ سرور** اجرا می‌شود. سایت از قبل بالا
و کامل است؛ سه کارِ باقی‌مانده دارد.

---

## ۱. وضعیت فعلی

سایت **کاملاً پویا** روی Next.js 15 + MariaDB، با PM2 و آپاچی به‌عنوان
reverse proxy. همه‌چیز کار می‌کند و تأیید شده:

| | |
| --- | --- |
| مسیر پروژه | `/var/www/kucafe` |
| اپ | PM2، نام `kucafe`، روی `127.0.0.1:3000`، حالت `fork`، ۱ instance |
| دیتابیس | MariaDB 10.6، دیتابیس `kucafe`، کاربر `kucafe` (رمز در `.env.local`) |
| وب‌سرور | آپاچی 2.4.65 — `/etc/httpd/conf/extra/kucafe.conf` |
| داده | ۳۳۱ کافه · ۱۹٬۳۸۶ آیتم منو · ۲۹ محله · ۴۸٬۱۵۸ ردیف |
| تصاویر | ۲۷٬۹۴۸ فایل WebP در `public/media` (~۱ گیگ) |
| نقشه | GeoJSON استاتیک در `public/map` — ۶۸۰KB بارِ اول |
| تست | ۲۲/۲۲ صفحه سالم · `deploy:verify` سبز |

**بررسی سلامت (اول این را بزن):**

```bash
cd /var/www/kucafe
pm2 list
npm run deploy:verify
node scripts/pages-smoke.mjs http://127.0.0.1:3000
```

---

## ۲. ⚠️ چهار چیز که اگر ندانی خرابی می‌سازی

### الف) این سرور چهار سایت زنده‌ی دیگر دارد

`pakerino.ir` · `greensmoke.ir` · `coco.pakerino.ir` · `agent.pakerino.ir`
به‌علاوه‌ی میل‌سرور (Exim/Dovecot) و FTP. یک ماشین **DirectAdmin** است.

**هرگز nginx نصب نکن** — با آپاچی روی پورت ۸۰ تصادف می‌کند و آن چهار سایت
می‌خوابند. (`deploy/nginx.conf` در مخزن هست ولی برای سرورِ خالی است، نه این.)

**هرگز کانفیگ آپاچی را دستی reload نکن.** از این استفاده کن:

```bash
bash /root/kucafe-xfer/vhost-apply.sh
```

وضعیت چهار سایت را قبل می‌گیرد، تغییر می‌دهد، مقایسه می‌کند، و **اگر سایتی از
۲۰۰ خارج شد خودش برمی‌گرداند**. یک بار با `<VirtualHost *:80>` هر چهار سایت
۵۰۳ شدند؛ این گارد برای همان است.

### ب) آدرس vhost باید IP صریح باشد

همه‌ی vhostهای این سرور `<VirtualHost 45.159.115.116:80>` هستند. آپاچی
`*:80` و `IP:80` را دو سبدِ جدا می‌شمارد؛ vhostِ wildcard پیش‌فرضِ **همه‌ی**
درخواست‌ها می‌شود.

### ج) تست را با IP واقعی بزن، نه `127.0.0.1`

درخواست به `127.0.0.1` قبل از تطبیق `ServerName` به vhost پیش‌فرض می‌افتد و
صفحه‌ی «webserver is functioning normally» دایرکت‌ادمین را می‌بینی و فکر
می‌کنی پروکسی خراب است:

```bash
curl --resolve kucafe.ir:80:45.159.115.116 http://kucafe.ir/search
```

### د) `sharp` روی این CPU کار نمی‌کند — و این رفع شده، دنبالش نرو

CPU یک `QEMU Virtual CPU 2.5+` است بدون SSE4.2/POPCNT/SSSE3 — یعنی x86-64
پایه، قبل از x86-64-v2. باینری‌های آماده‌ی sharp فیزیکاً اجرا نمی‌شوند و ساخت
از منبع هم ممکن نیست (sharp نیاز به libvips ≥ 8.18.3 دارد، اوبونتو ۲۲.۰۴ فقط
۸.۱۲.۱).

`src/core/media/derive.ts` دو موتور دارد و در زمان اجرا انتخاب می‌کند؛ روی این
سرور **ImageMagick** استفاده می‌شود و درست کار می‌کند. اگر خطای sharp دیدی،
نادیده بگیر — تلاش برای «رفع» آن وقت تلف کردن است.

---

## ۳. کارهای باقی‌مانده

### کار ۱ — کلید SMS.ir (کاربر کلید را دارد)

الان `AUTH_DEV_MODE=true` است: کد ورود در `pm2 logs kucafe` چاپ می‌شود و
**پیامکی نمی‌رود**. بعد از گرفتن کلید از کاربر:

```bash
cd /var/www/kucafe
nano .env.local
```

این چهار خط را پر کن:

```ini
AUTH_DEV_MODE=false          # ⚠️ اجباری، وگرنه هیچ پیامکی نمی‌رود
SMSIR_API_KEY=<کلید کاربر>
SMSIR_TEMPLATE_ID=<شناسه‌ی قالب OTP از پنل sms.ir>
ADMIN_PHONES=<شماره‌ی کاربر>  # با اولین ورود، نقش admin می‌گیرد
```

`SMSIR_TEMPLATE_ID` توصیه‌شده است (خط OTP فیلتر نمی‌شود). اگر کاربر قالب
ندارد، `SMSIR_LINE_NUMBER` را جایش بگذار. `.env.example` هر دو را توضیح داده.

بعد:

```bash
chmod 600 .env.local
pm2 reload kucafe
sleep 8
npm run auth:smoke                    # باید سبز باشد
pm2 logs kucafe --lines 30 --nostream # اگر کاربر تست ورود کرد، اینجا ببین
```

⚠️ **مصرف اعتبار پیامک پول واقعی است.** با `AUTH_DEV_MODE=false` هر تست ورود
یک پیامک می‌فرستد. برای تست تکراری از `scripts/session-token.ts` استفاده کن نه
از ورود واقعی.

### کار ۲ — TLS، فقط بعد از اینکه DNS وصل شد

کاربر باید رکورد A برای `kucafe.ir` و `www.kucafe.ir` روی `45.159.115.116`
بگذارد. **اول تأیید کن که DNS رسیده**:

```bash
dig +short kucafe.ir @8.8.8.8
curl -sI http://kucafe.ir/ | head -1      # بدون --resolve
```

اگر IP درست برگشت:

```bash
apt-get install -y certbot                # نصب نیست
certbot certonly --webroot -w /var/www/kucafe/public \
  -d kucafe.ir -d www.kucafe.ir --agree-tos -m <ایمیل کاربر> -n
```

بعد بلوک ۴۴۳ را به `/etc/httpd/conf/extra/kucafe.conf` اضافه کن: **عیناً کپیِ
بلوک ۸۰** با این تفاوت‌ها:

```apache
<VirtualHost 45.159.115.116:443>
    # … همان محتوای بلوک ۸۰ …
    SSLEngine on
    SSLCertificateFile    /etc/letsencrypt/live/kucafe.ir/fullchain.pem
    SSLCertificateKeyFile /etc/letsencrypt/live/kucafe.ir/privkey.pem
    RequestHeader set X-Forwarded-Proto "https"   # ⚠️ به https عوض شود
    RequestHeader set X-Forwarded-Port "443"
</VirtualHost>
```

⚠️ `X-Forwarded-Proto` **باید** `https` شود، وگرنه Next کوکی نشست را `Secure`
نمی‌دهد و ریدایرکت‌ها روی http ساخته می‌شوند — کاربر بعد از ورود پرت می‌شود.

بعد ریدایرکت ۸۰→۴۴۳ را در بلوک ۸۰ اضافه کن (**بعد از** اینکه ۴۴۳ کار کرد، نه
قبلش):

```apache
RewriteEngine On
RewriteCond %{HTTPS} off
RewriteRule ^ https://%{HTTP_HOST}%{REQUEST_URI} [L,R=301]
```

و در `.env.local`: `NEXT_PUBLIC_SITE_URL=https://kucafe.ir` (از قبل همین است).

اعمال با `bash /root/kucafe-xfer/vhost-apply.sh` — نه `systemctl reload` دستی.

تمدید خودکار: `systemctl status certbot.timer`

### کار ۳ — مخزن git عقب است

**`/var/www/kucafe` یک git repo نیست** (از tarball استخراج شده). کد روی سرور
به‌روزترین نسخه است ولی GitHub (`Rezz0722/cafe`) پنج کامیت عقب است و تغییرات
این استقرار در آن نیست.

تغییراتی که باید کامیت شوند (روی ماشین توسعه‌ی کاربر، نه سرور):

| فایل | چرا |
| --- | --- |
| `src/db/connection.ts` | `SET time_zone='+00:00'` روی هر اتصال |
| `src/core/media/derive.ts` | موتور دوم ImageMagick |
| `drizzle.config.ts` | حذف fallbackِ خطرناک به اعتبارنامه‌ی محلی |
| `scripts/db-verify.mjs` | بررسی منطقه‌ی زمانی که همیشه قرمز بود |
| `drizzle/mariadb-timestamps.sql` | رفع باگ ساخت کاربر روی MariaDB |
| `scripts/db-dump.mjs` | دامپ سازگار با MariaDB |
| `ecosystem.config.cjs` | باید `.cjs` باشد نه `.js` |
| `deploy/*`, `DEPLOY.md`, `HANDOFF.md` | مستندات و کانفیگ استقرار |

اگر کاربر خواست، از سرور به git تبدیلش نکن — تغییرات را از ماشین توسعه کامیت
و push کند، بعد روی سرور `git clone` تازه بگیر یا همان‌طور بماند.

---

## ۴. سه ناسازگاری MariaDB که رفع شده — اگر دیدی، دلیلش این است

**۱. نوع `json`.** MariaDB آن را `longtext + CHECK(json_valid())` پیاده می‌کند.
برای انتقال داده از MySQL از `scripts/db-dump.mjs` استفاده کن نه `mysqldump`
(هم به‌خاطر JSON، هم چون `mysqldump` کالیشن `utf8mb4_0900_*` تولید می‌کند که
MariaDB نمی‌شناسد).

**۲. `explicit_defaults_for_timestamp` روی MariaDB خاموش است** (روی MySQL 8
روشن). با خاموش‌بودنش، تایم‌استمپ‌های nullable به
`NOT NULL DEFAULT '0000-00-00'` تبدیل می‌شوند و درایور آن را `Invalid Date`
می‌خواند. این **ساختِ هر کاربر جدید** را با
`RangeError: Invalid time value` می‌شکست.

رفع شده با `drizzle/mariadb-timestamps.sql` که به `db:migrate` وصل است. اگر
دوباره دیدی: `npm run db:mariadb-fix`

**۳. منطقه‌ی زمانی سرور `Asia/Tehran` است.** `my.cnf` را **دست نزن** — روی
میل‌سرور و چهار سایت دیگر اثر دارد. اپ خودش روی هر اتصال نشست را UTC می‌کند.

---

## ۵. دستورهای روزمره

```bash
cd /var/www/kucafe

pm2 logs kucafe --lines 50      # لاگ
pm2 reload kucafe               # ری‌لود بی‌قطعی (نه restart)
pm2 monit                       # مصرف منابع

npm run deploy:verify           # db:verify + map:smoke + query:smoke
npm run db:verify               # ۱۲ بررسی ساختاری

# دیپلوی کد تازه (اگر روزی git شد)
npm run deploy                  # db:migrate → build → pm2 reload

# بعد از تغییر داده‌ی نقشه
npm run map:publish && pm2 reload kucafe

# تصاویر ناموفق را دوباره امتحان کن (۷۹ تای فعلی همه ۴۰۴ دائمی‌اند)
npx tsx --conditions=react-server scripts/media-download.ts --retry
```

لاگ آپاچی: `/var/log/httpd/kucafe-error.log` و `kucafe-access.log`

---

## ۶. جدول عیب‌یابی

| نشانه | علت |
| --- | --- |
| سایت ۵۰۳ + صفحه‌ی «یک لحظه صبر کنید» | Node پایین است: `pm2 list` بعد `pm2 restart kucafe` |
| نقشه خالی، `/api/map/style` → ۵۰۳ | `npm run map:publish` اجرا نشده |
| لایه‌ی نقشه ۳.۴MB می‌آید نه ۶۸۰KB | `AddType application/geo+json` یا `AddOutputFilterByType` در vhost نیست |
| ساخت کاربر → `Invalid time value` | `npm run db:mariadb-fix` |
| کد OTP نمی‌رسد ولی در لاگ هست | `AUTH_DEV_MODE` روی `false` نیست |
| بعد از ورود به http پرت می‌شود | `X-Forwarded-Proto` در بلوک ۴۴۳ روی `https` نیست |
| بعد از reload، سایت‌های دیگر ۵۰۳ | vhost با `*:80` — بند ۲-ب |
| «webserver is functioning normally» | با `127.0.0.1` تست کردی — بند ۲-ج |
| تصویر ساخته نمی‌شود / خطای sharp | طبیعی است، ImageMagick کار را می‌کند — بند ۲-د |
| `npm ci` → `ENOTEMPTY` | `rm -rf node_modules && npm ci` |
| ادمین تغییر می‌دهد و دیده نمی‌شود | PM2 در `cluster` رفته؛ باید `fork` با ۱ instance بماند |

راهنمای کامل: `/var/www/kucafe/DEPLOY.md`

---

## ۷. قاعده‌ی کار

۱. **هیچ فیچری نباید حذف یا مختل شود.** پنل ادمین، پنل کافه‌دار، ورود، ثبت
   نظر و بخش مشارکت همه Server Action دارند و باید پویا بمانند.
۲. **قبل از هر تغییر در آپاچی، `vhost-apply.sh`.** چهار سایت دیگر روی این
   ماشین‌اند.
۳. **بعد از هر تغییر، تست بزن** — `deploy:verify` و `pages-smoke.mjs`.
۴. **`.env.local` را در چت یا لاگ چاپ نکن.** رمز دیتابیس و
   `SESSION_SECRET` داخلش است.
