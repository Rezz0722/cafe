#!/bin/bash
# ادامه‌ی بالا آوردن: از شمای ساخته‌شده تا PM2.
#
# شما را drizzle-kit ساخته بود (۳۷ جدول، ستون‌ها با محلی یکسان) ولی قبل از
# ثبت ژورنال و قبل از ایندکس‌های FULLTEXT افتاد. اینجا از همان‌جا ادامه
# می‌دهیم. قابل اجرای دوباره است.
set -uo pipefail
APP=/var/www/kucafe
XFER=/root/kucafe-xfer
cd "$APP"
step() { echo ""; echo "═══ $* ═══"; }

DBPW=$(grep '^DATABASE_URL' .env.local | sed 's#.*//kucafe:##; s#@.*##')
M="mysql -u kucafe -p$DBPW kucafe"

step "۱. ایندکس‌های FULLTEXT"
# drizzle-kit این‌ها را تولید نمی‌کند و بدونشان جست‌وجوی نام کافه کار نمی‌کند.
while IFS= read -r stmt; do
  [ -z "$stmt" ] && continue
  case "$stmt" in --*) continue;; esac
  if $M -e "$stmt" 2>/tmp/ft.err; then
    echo "  ✓ ${stmt:0:60}"
  elif grep -qi "duplicate\|exists" /tmp/ft.err; then
    echo "  ✓ از قبل بود: ${stmt:0:50}"
  else
    echo "  ✗ ${stmt:0:50}"; head -2 /tmp/ft.err
  fi
done < <(grep -E '^ALTER TABLE' drizzle/mysql-extras.sql | sed 's/;$//')

echo "  FULLTEXT روی: $($M -N -e 'SELECT GROUP_CONCAT(DISTINCT TABLE_NAME) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA="kucafe" AND INDEX_TYPE="FULLTEXT"' 2>/dev/null)"

step "۲. بارگذاری داده (۴۸٬۱۵۸ ردیف)"
HAVE=$($M -N -e 'SELECT COUNT(*) FROM place' 2>/dev/null || echo 0)
if [ "${HAVE:-0}" -gt 0 ]; then
  echo "  از قبل $HAVE مکان هست — رد شد"
else
  if gunzip -c "$XFER/data.sql.gz" | $M 2>/tmp/load.err; then
    echo "  ✓ بارگذاری شد"
  else
    echo "  ✗ خطا:"; head -6 /tmp/load.err; exit 1
  fi
fi

step "۳. تأیید داده"
$M -N -e "
SELECT CONCAT('  مکان: ', COUNT(*), ' (منتشرشده: ', SUM(status='published'), ')') FROM place;
SELECT CONCAT('  آیتم منو: ', COUNT(*)) FROM menu_item;
SELECT CONCAT('  دسته منو: ', COUNT(*)) FROM menu_section;
SELECT CONCAT('  محله: ', COUNT(*)) FROM district;
SELECT CONCAT('  رسانه: ', COUNT(*), ' (سالم: ', SUM(status='ok'), ')') FROM media;
SELECT CONCAT('  کاربر: ', COUNT(*), ' (ادمین: ', SUM(role='admin'), ')') FROM app_user;
SELECT CONCAT('  facet مکان: ', COUNT(*)) FROM place_facet;
SELECT CONCAT('  ساعت کاری: ', COUNT(*)) FROM place_hours;
SELECT CONCAT('  NOW() برابر UTC؟ ', IF(NOW()=UTC_TIMESTAMP(),'بله','خیر (اپ خودش نشست را UTC می‌کند)'));
" 2>/dev/null

step "۴. ثبت ژورنال مهاجرت"
SQLF=$(ls drizzle/0000_*.sql | head -1)
HASH=$(sha256sum "$SQLF" | awk '{print $1}')
WHEN=$(node -e "console.log(require('./drizzle/meta/_journal.json').entries[0].when)" 2>/dev/null || echo 0)
$M -e "INSERT INTO \`__drizzle_migrations\` (hash, created_at) SELECT '$HASH', $WHEN WHERE NOT EXISTS (SELECT 1 FROM \`__drizzle_migrations\` WHERE hash='$HASH');" 2>/dev/null
echo "  ژورنال: $($M -N -e 'SELECT COUNT(*) FROM __drizzle_migrations' 2>/dev/null) رکورد"

step "۵. نقشه"
npm run map:worker 2>&1 | tail -2
npm run map:publish 2>&1 | grep -E "بارِ اول|مجموع|✓|کنار گذاشته" | tail -4

step "۶. build"
BUILD_PARALLEL=1 npm run build > /tmp/build.log 2>&1
BUILD_EXIT=$?
if [ $BUILD_EXIT -ne 0 ]; then
  echo "  ✗ build شکست خورد:"
  grep -E "error|Error|Failed" /tmp/build.log | head -10
  exit 1
fi
grep -E "Compiled successfully|Generating static|Route \(app\)" /tmp/build.log | tail -3
echo "  ✓ build موفق"

step "۷. PM2"
mkdir -p logs
pm2 delete kucafe >/dev/null 2>&1 || true
pm2 start ecosystem.config.js --env production 2>&1 | tail -3
pm2 save >/dev/null 2>&1
pm2 startup systemd -u root --hp /root >/dev/null 2>&1 || true

step "۸. تست محلی"
for i in $(seq 1 40); do
  c=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 http://127.0.0.1:3000/robots.txt 2>/dev/null || echo 000)
  [ "$c" = "200" ] && break
  sleep 2
done
for p in /robots.txt / /search /mashhad /contribute; do
  printf "  %-12s %s\n" "$p" "$(curl -s -o /dev/null -w '%{http_code}' --max-time 30 "http://127.0.0.1:3000$p" 2>/dev/null)"
done
echo "  pm2: $(pm2 jlist 2>/dev/null | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const a=JSON.parse(s);const k=a.find(x=>x.name==="kucafe");console.log(k?k.pm2_env.status+" restarts="+k.pm2_env.restart_time:"نیست")}catch(e){console.log("?")}})')"

step "۹. از طریق آپاچی"
for d in kucafe.ir pakerino.ir greensmoke.ir; do
  printf "  %-18s %s\n" "$d" "$(curl -s -o /dev/null -w '%{http_code}' --max-time 30 -H "Host: $d" http://127.0.0.1/ 2>/dev/null)"
done

echo ""
echo "FINISH_DONE"
