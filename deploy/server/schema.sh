#!/bin/bash
# اعمال شمای دیتابیس با کلاینت mysql، نه drizzle-kit.
#
# ═══ چرا ═══
#
# `drizzle-kit migrate` روی این سرور با EXIT=1 و **بدون هیچ پیامی** می‌افتاد؛
# فقط اسپینر چاپ می‌کرد. بدون پیام خطا، عیب‌یابی‌اش حدس‌زنی است.
#
# خودِ SQL همان است که drizzle تولید کرده و قبلاً تأیید شد که دقیقاً شمای
# فعلی را می‌سازد (۳۷ جدول، صفر اختلاف ستون). اعمالش با کلاینت mysql هر خطا
# را با شماره‌ی خط و متن دقیق نشان می‌دهد.
#
# در پایان، رکورد مهاجرت در `__drizzle_migrations` ثبت می‌شود تا اگر روزی
# `db:migrate` کار کرد، این مهاجرت را دوباره اعمال نکند.
set -uo pipefail
APP=/var/www/kucafe
cd "$APP"

DBPW=$(grep '^DATABASE_URL' .env.local | sed 's#.*//kucafe:##; s#@.*##')
M="mysql -u kucafe -p$DBPW kucafe"

echo "── جدول‌های فعلی: $($M -N -e 'SELECT COUNT(*) FROM information_schema.tables WHERE table_schema="kucafe"' 2>/dev/null) ──"

SQL=$(ls drizzle/0000_*.sql | head -1)
echo "── اعمال $SQL ──"

# `--> statement-breakpoint` نشانگر خودِ drizzle است. در MySQL کامنت با
# `-- ` (خط تیره خط تیره فاصله) شروع می‌شود؛ `-->` کامنت نیست و خطای سینتکس
# می‌دهد. پس این خطوط حذف می‌شوند — جداکننده‌ی واقعیِ دستورها همان `;` است.
grep -v 'statement-breakpoint' "$SQL" > /tmp/schema.sql
echo "  خطوط: $(wc -l < /tmp/schema.sql)  |  CREATE TABLE: $(grep -c 'CREATE TABLE' /tmp/schema.sql)"

if $M < /tmp/schema.sql 2> /tmp/schema.err; then
  echo "  ✓ شما اعمال شد"
else
  echo "  ✗ خطا:"
  head -5 /tmp/schema.err
  exit 1
fi

echo "── ایندکس‌های FULLTEXT (db:extras) ──"
if $M < drizzle/mysql-extras.sql 2> /tmp/extras.err; then
  echo "  ✓ اضافه شد"
else
  # اگر از قبل باشند، خطای «Duplicate key name» می‌دهد که مسئله نیست.
  if grep -qi "duplicate" /tmp/extras.err; then
    echo "  ✓ از قبل وجود داشتند"
  else
    echo "  ✗ خطا:"; head -3 /tmp/extras.err; exit 1
  fi
fi

echo "── ثبت مهاجرت در ژورنال drizzle ──"
HASH=$(sha256sum "$SQL" | awk '{print $1}')
WHEN=$(node -e "const j=require('./drizzle/meta/_journal.json');console.log(j.entries[0].when)" 2>/dev/null || echo 0)
$M -e "
CREATE TABLE IF NOT EXISTS \`__drizzle_migrations\` (
  id SERIAL PRIMARY KEY,
  hash text NOT NULL,
  created_at bigint
);
INSERT INTO \`__drizzle_migrations\` (hash, created_at)
SELECT '$HASH', $WHEN
WHERE NOT EXISTS (SELECT 1 FROM \`__drizzle_migrations\` WHERE hash='$HASH');
" 2>/dev/null && echo "  ✓ ثبت شد (when=$WHEN)"

echo "── تأیید ──"
$M -N -e "
SELECT CONCAT('  جدول: ', COUNT(*)) FROM information_schema.tables
  WHERE table_schema='kucafe' AND table_name<>'__drizzle_migrations';
SELECT CONCAT('  FULLTEXT روی: ', GROUP_CONCAT(DISTINCT TABLE_NAME)) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA='kucafe' AND INDEX_TYPE='FULLTEXT';
" 2>/dev/null
echo "SCHEMA_DONE"
