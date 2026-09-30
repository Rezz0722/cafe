#!/usr/bin/env bash
# بکاپ کامل و قابل‌انتقال کوکافه: کد فعلی + دیتابیس + مدیا + env + restore.
#
#   sudo KUCAFE_ENV_FILE=/path/to/.env.local ./scripts/backup-full.sh
#   ./scripts/backup-full.sh --output /mnt/backups --without-media
#
# آرشیو شامل رازهای محیط است؛ خروجی با دسترسی 0600 ساخته می‌شود.

set -Eeuo pipefail
umask 077

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUTPUT_DIR="${KUCAFE_BACKUP_DIR:-/var/backups/kucafe}"
ENV_FILE="${KUCAFE_ENV_FILE:-$PROJECT_DIR/.env.local}"
WITH_MEDIA=1
KEEP="${KUCAFE_BACKUP_KEEP:-7}"

usage() {
  cat <<'EOF'
استفاده: backup-full.sh [گزینه‌ها]
  --output DIR       پوشهٔ خروجی (پیش‌فرض: /var/backups/kucafe)
  --env-file FILE    فایل محیط production
  --without-media    بکاپ سبک بدون public/media
  --keep N           نگه‌داشتن N بکاپ آخر (پیش‌فرض: 7؛ صفر = حذف نکن)
EOF
}

while (($#)); do
  case "$1" in
    --output) OUTPUT_DIR="${2:?مسیر خروجی لازم است}"; shift 2 ;;
    --env-file) ENV_FILE="${2:?مسیر env لازم است}"; shift 2 ;;
    --without-media) WITH_MEDIA=0; shift ;;
    --keep) KEEP="${2:?تعداد لازم است}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "گزینهٔ ناشناخته: $1" >&2; usage >&2; exit 2 ;;
  esac
done

[[ "$OUTPUT_DIR" = /* ]] || OUTPUT_DIR="$PWD/$OUTPUT_DIR"
[[ -f "$ENV_FILE" ]] || { echo "✗ فایل env پیدا نشد: $ENV_FILE" >&2; exit 1; }
[[ "$KEEP" =~ ^[0-9]+$ ]] || { echo "✗ --keep باید عدد نامنفی باشد." >&2; exit 2; }
command -v node >/dev/null || { echo '✗ node نصب نیست.' >&2; exit 1; }
command -v tar >/dev/null || { echo '✗ tar نصب نیست.' >&2; exit 1; }
command -v gzip >/dev/null || { echo '✗ gzip نصب نیست.' >&2; exit 1; }

mkdir -p "$OUTPUT_DIR"
LOCK_FILE="$OUTPUT_DIR/.backup.lock"
exec 9>"$LOCK_FILE"
flock -n 9 || { echo '✗ یک بکاپ دیگر در حال اجراست.' >&2; exit 1; }

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
MODE="full"
((WITH_MEDIA)) || MODE="no-media"
FINAL="$OUTPUT_DIR/kucafe-$MODE-$STAMP.tar.gz"
PARTIAL="$FINAL.partial"
STAGE="$(mktemp -d "$OUTPUT_DIR/.stage-$STAMP-XXXXXX")"

cleanup() {
  rm -f -- "$PARTIAL"
  rm -rf -- "$STAGE"
}
trap cleanup EXIT INT TERM

echo '▸ دامپ کامل و transaction-safe دیتابیس (schema + data)…'
KUCAFE_ENV_FILE="$ENV_FILE" node "$PROJECT_DIR/scripts/backup-db.mjs" "$STAGE/database.sql.gz"

install -m 600 "$ENV_FILE" "$STAGE/env.production"
install -m 755 "$PROJECT_DIR/scripts/restore-full.sh" "$STAGE/restore-full.sh"
ln -s "$PROJECT_DIR" "$STAGE/app"

mkdir -p "$STAGE/runtime"
if [[ -f "$PROJECT_DIR/var/topmenu-sync/state.json" ]]; then
  mkdir -p "$STAGE/runtime/topmenu-sync"
  install -m 600 "$PROJECT_DIR/var/topmenu-sync/state.json" "$STAGE/runtime/topmenu-sync/state.json"
fi

DB_BYTES="$(stat -c %s "$STAGE/database.sql.gz")"
MEDIA_FILES=0
MEDIA_BYTES=0
if ((WITH_MEDIA)) && [[ -d "$PROJECT_DIR/public/media" ]]; then
  read -r MEDIA_FILES MEDIA_BYTES < <(
    find "$PROJECT_DIR/public/media" -type f -printf '%s\n' |
      awk '{bytes += $1; files += 1} END {print files + 0, bytes + 0}'
  )
fi

cat >"$STAGE/manifest.txt" <<EOF
format=kucafe-portable-backup-v2
created_utc=$STAMP
hostname=$(hostname -f 2>/dev/null || hostname)
project_dir=$PROJECT_DIR
node_version=$(node --version)
database_gzip_bytes=$DB_BYTES
includes_media=$WITH_MEDIA
media_files=$MEDIA_FILES
media_bytes=$MEDIA_BYTES
restore=./restore-full.sh ARCHIVE --domain kucafe.ir --email EMAIL
EOF

EXCLUDES=(
  --exclude='app/.git'
  --exclude='app/node_modules'
  --exclude='app/.next'
  --exclude='app/.next-*'
  --exclude='app/backups'
  --exclude='app/logs'
  --exclude='app/var'
  --exclude='app/.env.local'
  --exclude='app/deploy.env'
  --exclude='app/tsconfig.tsbuildinfo'
  --exclude='app/__pycache__'
  --exclude='app/*.tar.gz'
)
((WITH_MEDIA)) || EXCLUDES+=(--exclude='app/public/media')

echo "▸ بسته‌بندی $MEDIA_FILES فایل مدیا و سورس فعلی…"
tar --dereference --create --file=- "${EXCLUDES[@]}" \
  -C "$STAGE" manifest.txt database.sql.gz env.production restore-full.sh runtime app \
  2>"$STAGE/tar.stderr" | gzip -1 >"$PARTIAL"

gzip -t "$PARTIAL"
tar -tzf "$PARTIAL" >"$STAGE/archive.list"
grep -Eq '(^|/)manifest\.txt$' "$STAGE/archive.list" || {
  echo '✗ manifest داخل آرشیو پیدا نشد.' >&2
  exit 1
}
mv "$PARTIAL" "$FINAL"
chmod 600 "$FINAL"
(cd "$OUTPUT_DIR" && sha256sum "$(basename "$FINAL")") >"$FINAL.sha256"
chmod 600 "$FINAL.sha256"

if ((KEEP > 0)); then
  mapfile -t OLD < <(find "$OUTPUT_DIR" -maxdepth 1 -type f -name 'kucafe-*.tar.gz' -printf '%T@ %p\n' | sort -nr | awk -v keep="$KEEP" 'NR > keep {$1=""; sub(/^ /, ""); print}')
  for old in "${OLD[@]}"; do
    rm -f -- "$old" "$old.sha256"
  done
fi

echo "✓ بکاپ کامل ساخته شد: $FINAL"
du -h "$FINAL"
echo "✓ checksum: $FINAL.sha256"
