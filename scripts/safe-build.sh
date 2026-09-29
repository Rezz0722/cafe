#!/usr/bin/env bash

# بیلد مرحله‌ای Next.js
#
# `next build` در شروع، محتوای distDir را پاک می‌کند. اگر `next start` از همان
# `.next` در حال سرویس باشد، تا پایان ساخت همهٔ CSS/JSهای صفحه 400/404 می‌شوند.
# این اسکریپت نسخهٔ تازه را کنار نسخهٔ زنده می‌سازد و فقط پس از موفقیت کامل،
# با یک rename کوتاه جایگزین می‌کند. assetهای fingerprintشدهٔ نسخهٔ قبل هم
# حفظ می‌شوند تا تب‌هایی که قبل از انتشار باز بوده‌اند از کار نیفتند.

set -euo pipefail

project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$project_dir"

staging_dir=".next-staging"
live_dir=".next"
previous_dir=".next-previous"
deployment_id="${NEXT_DEPLOYMENT_ID:-kucafe-$(date -u +%Y%m%d%H%M%S)-$$}"

rm -rf -- "$staging_dir"
NEXT_DEPLOYMENT_ID="$deployment_id" NEXT_DIST_DIR="$staging_dir" npm run build:next

# next.config این مقدار را هنگام start از نسخهٔ واقعاً فعال می‌خواند. فایل
# داخل staging نوشته می‌شود تا build ناموفق شناسهٔ نسخهٔ در حال سرویس را
# تغییر ندهد.
printf '%s\n' "$deployment_id" > "$staging_dir/DEPLOYMENT_ID"

# فایل‌های قدیمی نام fingerprint دارند و با نسخهٔ جدید تداخل نمی‌کنند. نگه
# داشتنشان مانع خرابی مرورگری می‌شود که HTML نسخهٔ قبلی را هنوز باز دارد.
if [[ -d "$live_dir/static" ]]; then
  mkdir -p "$staging_dir/static"
  cp -a -n "$live_dir/static/." "$staging_dir/static/"
fi

rollback() {
  if [[ ! -e "$live_dir" && -d "$previous_dir" ]]; then
    mv "$previous_dir" "$live_dir"
  fi
}
trap rollback ERR

rm -rf -- "$previous_dir"
if [[ -d "$live_dir" ]]; then
  mv "$live_dir" "$previous_dir"
fi
mv "$staging_dir" "$live_dir"
trap - ERR

echo "✓ بیلد $deployment_id آماده شد؛ سرویس را reload کنید. نسخهٔ قبل در $previous_dir باقی ماند."
