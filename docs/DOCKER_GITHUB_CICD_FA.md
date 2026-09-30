# راهنمای Docker، GitHub CI/CD و Rollback کو کافه

این سند مرجع عملیاتی انتشار جدید است. دستورهای قدیمی PM2 فقط برای rollback
دورهٔ مهاجرت باقی مانده‌اند و مسیر توسعهٔ عادی محسوب نمی‌شوند.

## ۱. چه چیزی کجا نگهداری می‌شود؟

| داده | محل | وارد image می‌شود؟ |
| --- | --- | --- |
| سورس و migration | GitHub | بله، در image نسخه‌دار |
| secretها | `/opt/kucafe/.env.local` روی سرور | خیر؛ BuildKit secret و runtime env |
| media زنده | `/var/www/kucafe/public/media` | خیر؛ bind mount خواندنی/نوشتنی |
| دیتابیس | MariaDB میزبان | خیر |
| بکاپ DB | `/var/backups/kucafe/db` | خیر؛ ۵ نسخه |
| snapshot media | `/var/backups/kucafe/media` | خیر؛ ۵ نسخهٔ hard-link شده |
| وضعیت انتشار | `/var/lib/kucafe` | خیر |

media نباید به image تبدیل شود. image برنامه باید immutable و کوچک باشد، در
حالی که media دادهٔ متغیر کاربران است. embed کردن ۲٫۵GB media هر deploy را
کند می‌کند، حذف container را به خطر از دست‌رفتن آپلود پیوند می‌زند و پنج نسخه
را بی‌دلیل پنج برابر می‌کند. snapshot افزایشی همان قابلیت rollback را با
هزینهٔ بسیار کمتر می‌دهد.

## ۲. اجرای محلی در یک پوشه

پیش‌نیاز فقط Docker Engine و Compose است:

```bash
git clone https://github.com/Rezz0722/cafe.git kucafe
cd kucafe
docker compose -f compose.local.yaml up --build
```

این Compose یک MariaDB محلی، migration و Next development server روی
`http://localhost:3000` بالا می‌آورد. داده‌ها در volumeهای Docker می‌مانند.

## ۳. قواعد GitHub

شاخهٔ نهایی `production` را بسازید و در Settings → Branches این قواعد را
اعمال کنید:

- Require a pull request before merging
- Require at least one approval
- Require status check: `CI / verify`
- Require branches to be up to date
- Block force pushes and deletion
- Include administrators

در Settings → Environments محیط `production` را بسازید، Required reviewer را
روی مالک قرار دهید و Deployment branches را فقط `production` بگذارید.

Repository عمومی است؛ به همین علت workflow مربوط به PR همیشه روی
`ubuntu-latest` اجرا می‌شود. هیچ کد PR نباید روی runner سرور اجرا شود.

## ۴. نصب runner اختصاصی

روش توصیه‌شده این است که یک fine-grained PAT کوتاه‌عمر با دسترسی‌های
`Contents: Read/Write`، `Actions: Read/Write`، `Administration: Read/Write` و
`Environments: Read/Write` را در فایل root-only قرار دهید:

```bash
cd /opt/kucafe
sudo install -m 600 /dev/null /root/.github-kucafe-token
sudo nano /root/.github-kucafe-token
sudo bash scripts/bootstrap-github-cicd.sh
```

اسکریپت branch و environment محافظت‌شده، Pull Request و runner را می‌سازد و
در پایان PAT را حذف می‌کند. مسیر دستی با registration token یک‌ساعته و
`scripts/install-github-runner.sh` نیز برای بازیابی در دسترس است.

runner عضو گروه Docker نمی‌شود. تنها sudo مجاز آن wrapper ثابتی است که SHA را
با HEAD واقعی `origin/production` تطبیق می‌دهد و هیچ فایل workspace رانر را
به‌عنوان root اجرا نمی‌کند. برچسب runner برابر `kucafe-production` است.

## ۵. اولین انتشار و انتشار‌های بعدی

روی هر feature branch:

```bash
git switch -c feature/short-name
# تغییر، تست و commit
git push -u origin feature/short-name
```

پس از سبزشدن CI، Pull Request را به `production` merge کنید. workflow انتشار:

1. SHA و نبود secret tracked را بررسی می‌کند.
2. typecheck و unit tests را دوباره روی runner اجرا می‌کند.
3. wrapper فقط HEAD شاخهٔ production را در `/opt/kucafe-release` checkout می‌کند.
4. imageهای `kucafe/app:sha-…` و `kucafe/maintenance:sha-…` ساخته می‌شوند.
5. یک dump فشرده پیش از migration ساخته می‌شود.
6. preflight دیتابیس، migration و سپس `db:verify` اجرا می‌شوند؛ فقط بعد از
   موفقیت هر سه، container روی `127.0.0.1:3100` جایگزین می‌شود. برای دیتابیس
   legacy با journal خالی، baseline فقط پس از تطبیق کامل snapshot ثبت می‌شود؛
   schema ناقص یا journal مبهم deploy را متوقف می‌کند.
7. health check اجرا می‌شود؛ در شکست، application image قبلی برمی‌گردد.
8. بیش از پنج image KuCafe پاک می‌شود؛ image پروژه‌های دیگر دست نمی‌خورد.

## ۶. media و Cron

پس از اولین انتشار موفق، Cron به‌صورت خودکار نصب می‌شود. نصب دستیِ idempotent:

```bash
sudo bash /opt/kucafe-release/scripts/install-media-cron.sh
```

Cron هر روز ساعت ۰۳:۲۰ تهران ابتدا downloader موجود پروژه را داخل maintenance
container اجرا و سپس snapshot افزایشی می‌گیرد. تست دستی:

```bash
sudo /opt/kucafe-release/scripts/media-snapshot.sh
```

بازگردانی media باید در پنجرهٔ maintenance و با توقف نوشتن انجام شود؛ محتوای
snapshot انتخابی با `rsync -a --delete` به media زنده برگردانده می‌شود.

## ۷. Rollback

اگر health check همان deploy شکست بخورد، اسکریپت خودکار application image قبلی
را بالا می‌آورد. rollback دستی اپ:

```bash
cat /var/lib/kucafe/current-image
docker image ls kucafe/app
KUCAFE_IMAGE_TAG=sha-OLD \
KUCAFE_ENV_FILE=/opt/kucafe/.env.local \
docker compose -f /opt/kucafe-release/compose.yaml up -d --no-build app
```

Migrationها additive طراحی شده‌اند. rollback خودکار schema انجام نمی‌شود؛ اگر
migration مخرب لازم شد، باید runbook اختصاصی و restore تست‌شدهٔ DB همراه همان
PR باشد. dumpهای قبل از deploy در `/var/backups/kucafe/db` هستند.

## ۸. بررسی و عیب‌یابی

```bash
docker compose -f /opt/kucafe-release/compose.yaml ps
docker compose -f /opt/kucafe-release/compose.yaml logs --tail=200 app
curl -fsS http://127.0.0.1:3100/robots.txt
curl -fsS https://kucafe.ir/robots.txt
systemctl status actions.runner.Rezz0722-cafe.*
```

هرگز روی این سرور `docker system prune -a` نزنید؛ container و image متعلق به
پروژه‌های دیگر نیز روی همین host هستند.

## ۹. Cutover اولیه از PM2

تا وقتی اولین image از GitHub و runner سالم نشده‌اند، PM2 روی ۳۰۰۰ فعال
می‌ماند و Apache تغییر نمی‌کند. پس از سلامت ۳۱۰۰:

1. از vhost فعلی نسخه پشتیبان بگیرید.
2. اسکریپت محافظت‌شده را اجرا کنید:

   ```bash
   sudo bash /opt/kucafe-release/deploy/server/cutover-to-docker.sh
   ```

3. اسکریپت upstream را به ۳۱۰۰ تغییر می‌دهد، aliasهای build قدیمی را حذف
   می‌کند و `httpd -t`، سلامت دامنه و سایت‌های همسایه را می‌سنجد؛ در شکست
   خودکار config قبلی را برمی‌گرداند.
4. فقط بعد از تأیید دامنه، PM2 را متوقف کنید.

این cutover یک‌بار انجام می‌شود. انتشار‌های بعدی فقط از GitHub Actions هستند.
