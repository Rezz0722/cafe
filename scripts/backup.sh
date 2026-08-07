#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════
#  backup.sh — گرفتن یک بکاپِ قابل‌انتقال از «کو کافه» روی همین سرور
#
#      ./scripts/backup.sh            # فقط دیتابیس (سبک، چند مگابایت)
#      ./scripts/backup.sh --media    # دیتابیس + همه‌ی تصاویر (~۱ گیگ)
#      ./scripts/backup.sh --media --env   # + کپیِ .env.local (شاملِ راز)
#
#  خروجی یک فایل است:  kucafe-backup-<تاریخ-ساعت>.tar.gz
#
#  بردنش روی سرور دیگر و بالا آوردن:
#      scp kucafe-backup-*.tar.gz  root@سرورِ-جدید:/path/to/kucafe/
#      cd /path/to/kucafe && ./deploy.sh
#  (deploy.sh خودش بکاپ کنارش را می‌بیند و دیتا/مدیا را از آن بازیابی می‌کند.)
#
#  چرا این‌طوری و نه mysqldump:
#    دامپ از scripts/db-dump.mjs می‌آید که ستون‌های JSON را درست بیرون می‌دهد
#    (mysqldump روی MariaDB این‌ها را خراب می‌کند — قبلاً همین‌جا خوردیم).
# ═══════════════════════════════════════════════════════════════════════
set -euo pipefail
cd "$(dirname "$0")/.."   # ریشه‌ی پروژه

WITH_MEDIA=0; WITH_ENV=0
for a in "$@"; do
  case "$a" in
    --media) WITH_MEDIA=1 ;;
    --env)   WITH_ENV=1 ;;
    *) echo "آرگومان ناشناخته: $a"; exit 1 ;;
  esac
done

[ -f .env.local ] || { echo "✗ .env.local نیست — از ریشه‌ی پروژه اجرا کن."; exit 1; }

STAMP="$(date +%Y%m%d-%H%M%S)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

echo "▸ دامپ دیتابیس…"
node scripts/db-dump.mjs "$WORK/kucafe-data.sql" >/dev/null
[ -f "$WORK/kucafe-data.sql.gz" ] || { echo "✗ دامپ ساخته نشد."; exit 1; }
echo "  $(du -h "$WORK/kucafe-data.sql.gz" | cut -f1)"

if [ "$WITH_MEDIA" = "1" ] && [ -d public/media ]; then
  echo "▸ بسته‌بندی تصاویر (طول می‌کشد)…"
  tar -czf "$WORK/media.tar.gz" public/media
  echo "  $(du -h "$WORK/media.tar.gz" | cut -f1)"
fi

if [ "$WITH_ENV" = "1" ]; then
  echo "▸ افزودن .env.local (⚠️ شاملِ رمز و SESSION_SECRET)"
  cp .env.local "$WORK/env.local.bak"
fi

OUT="kucafe-backup-${STAMP}.tar.gz"
tar -czf "$OUT" -C "$WORK" .
echo
echo "✓ بکاپ آماده شد: $OUT  ($(du -h "$OUT" | cut -f1))"
echo "  محتوا:"; tar -tzf "$OUT" | sed 's/^/    /'
echo
echo "بردن و بالا آوردن روی سرور دیگر:"
echo "  scp $OUT root@HOST:/path/to/kucafe/  &&  ssh root@HOST 'cd /path/to/kucafe && ./deploy.sh'"
