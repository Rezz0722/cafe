#!/bin/bash
# بالا آوردن کو کافه روی سرور — از کدِ رسیده تا PM2.
#
# قابل اجرای دوباره است: هر مرحله اگر از قبل انجام شده رد می‌شود.
# لاگ کامل در /root/kucafe-xfer/bringup.log
set -euo pipefail
APP=/var/www/kucafe
XFER=/root/kucafe-xfer
step() { echo ""; echo "═══ $* ═══"; }

cd "$XFER"

step "۱. بررسی سلامتِ آرشیوها"
gzip -t code.tgz || { echo "✗ code.tgz ناقص است"; exit 1; }
gzip -t data.sql.gz || { echo "✗ data.sql.gz ناقص است"; exit 1; }
echo "✓ هر دو آرشیو سالم"

step "۲. استخراج کد"
mkdir -p "$APP"
# .env.local را نگه می‌داریم — رمزها داخلش است و در آرشیو نیست.
cp "$APP/.env.local" "$XFER/.env.local.keep" 2>/dev/null || true
tar -xzf code.tgz -C "$APP"
cp "$XFER/.env.local.keep" "$APP/.env.local" 2>/dev/null || true
chmod 600 "$APP/.env.local"
cd "$APP"
echo "✓ $(find . -path ./node_modules -prune -o -type f -print | wc -l) فایل"
node -e "const p=require('./package.json');console.log('  پکیج:',p.name,p.version)"

step "۳. نصب وابستگی‌ها (devDependencies هم لازم است)"
npm ci --no-audit --no-fund 2>&1 | tail -4

step "۴. شمای دیتابیس"
# drizzle-kit migrate جدول‌ها را می‌سازد؛ db:extras ایندکس FULLTEXT را که
# drizzle تولید نمی‌کند اضافه می‌کند.
npx drizzle-kit migrate 2>&1 | tail -6
npm run db:extras 2>&1 | tail -4 || echo "  (db:extras: ممکن است ایندکس‌ها از قبل باشند)"

step "۵. بارگذاری داده"
ROWS_BEFORE=$(mysql -N -u kucafe -p"$(grep DATABASE_URL "$APP/.env.local" | sed 's#.*//kucafe:##; s#@.*##')" kucafe -e "SELECT COUNT(*) FROM place" 2>/dev/null || echo 0)
if [ "${ROWS_BEFORE:-0}" -gt 0 ]; then
  echo "  از قبل $ROWS_BEFORE مکان هست — بارگذاری رد شد (برای بارگذاری دوباره خودتان اجرا کنید)"
else
  DBPW=$(grep DATABASE_URL "$APP/.env.local" | sed 's#.*//kucafe:##; s#@.*##')
  gunzip -c "$XFER/data.sql.gz" | mysql -u kucafe -p"$DBPW" kucafe
  echo "✓ داده بارگذاری شد"
fi

step "۶. تأیید داده"
DBPW=$(grep DATABASE_URL "$APP/.env.local" | sed 's#.*//kucafe:##; s#@.*##')
mysql -N -u kucafe -p"$DBPW" kucafe -e "
SELECT CONCAT('  مکان: ', COUNT(*)) FROM place;
SELECT CONCAT('  منتشرشده: ', COUNT(*)) FROM place WHERE status='published';
SELECT CONCAT('  آیتم منو: ', COUNT(*)) FROM menu_item;
SELECT CONCAT('  محله: ', COUNT(*)) FROM district;
SELECT CONCAT('  رسانه: ', COUNT(*)) FROM media;
SELECT CONCAT('  کاربر: ', COUNT(*)) FROM app_user;
SELECT CONCAT('  NOW()==UTC؟ ', IF(NOW()=UTC_TIMESTAMP(),'بله','خیر — ولی اپ خودش نشست را UTC می‌کند'));
" 2>/dev/null

step "۷. نقشه و worker"
npm run map:worker 2>&1 | tail -2
npm run map:publish 2>&1 | tail -4

step "۸. build"
# BUILD_PARALLEL=1 چون این سرور ۴ هسته و ۷.۸ گیگ رم دارد؛ محدودیتِ تک‌هسته‌ای
# برای ماشین توسعه‌ی ۴ گیگی بود.
BUILD_PARALLEL=1 npm run build 2>&1 | tail -12

step "۹. PM2"
mkdir -p "$APP/logs"
pm2 delete kucafe 2>/dev/null || true
pm2 start ecosystem.config.js --env production
pm2 save
sleep 6
pm2 list | tail -5

step "۱۰. تست محلیِ اپ"
for i in $(seq 1 30); do
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 http://127.0.0.1:3000/robots.txt 2>/dev/null || echo 000)
  [ "$code" = "200" ] && break
  sleep 2
done
echo "  /robots.txt → $code"
echo "  /           → $(curl -s -o /dev/null -w '%{http_code}' --max-time 25 http://127.0.0.1:3000/ 2>/dev/null)"
echo "  /search     → $(curl -s -o /dev/null -w '%{http_code}' --max-time 25 http://127.0.0.1:3000/search 2>/dev/null)"
echo "  /mashhad    → $(curl -s -o /dev/null -w '%{http_code}' --max-time 25 http://127.0.0.1:3000/mashhad 2>/dev/null)"

echo ""
echo "BRINGUP_DONE"
