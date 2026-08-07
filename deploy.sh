#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════
#  deploy.sh — بالا آوردن کاملِ «کو کافه» روی یک سرور از روی همین چک‌اوت گیت
#
#  روی سرور مقصد:
#
#      git clone https://github.com/Rezz0722/cafe.git kucafe
#      cd kucafe && git checkout feat/nextjs-data-platform
#      cp deploy.env.example deploy.env   &&   nano deploy.env
#      ./deploy.sh
#
#  دوباره‌اجراپذیر (idempotent): هر بار که بزنی، آخرین کد را می‌کشد، وابستگی‌ها
#  را هم‌تراز می‌کند، مهاجرت‌ها را اعمال می‌کند، می‌سازد و PM2 را ری‌لود می‌کند.
#  دیتابیسِ پرشده و مدیای موجود را دوباره وارد نمی‌کند.
#
#  چه چیزی از کجا می‌آید:
#    • کد و داده‌ی مرجع (نقشه، منو، ۳۳۱ کافه)  →  همین مخزن گیت
#    • داده‌ی دیتابیس                            →  db/seed/kucafe-data.sql.gz
#    • تصاویر (۱ گیگ)                            →  بازسازی از منبع، یا از بکاپ
#    • رازها (رمز DB، SESSION_SECRET، کلید SMS)  →  .env.local روی همین سرور
# ═══════════════════════════════════════════════════════════════════════
set -euo pipefail
cd "$(dirname "$0")"
APP_DIR="$(pwd)"

c_g()  { printf '\033[32m%s\033[0m\n' "$*"; }   # سبز
c_y()  { printf '\033[33m%s\033[0m\n' "$*"; }   # زرد
c_r()  { printf '\033[31m%s\033[0m\n' "$*"; }   # قرمز
step() { printf '\n\033[1;36m▸ %s\033[0m\n' "$*"; }
die()  { c_r "✗ $*"; exit 1; }

# ── ۰) پیکربندی ─────────────────────────────────────────────────────────
step "۰) خواندن پیکربندی"
[ -f deploy.env ] || die "deploy.env نیست. اول: cp deploy.env.example deploy.env و پرش کن."
set -a; . ./deploy.env; set +a
: "${DB_NAME:?در deploy.env تعریف نشده}"
: "${DB_USER:?در deploy.env تعریف نشده}"
[ -n "${DB_PASS:-}" ] || die "DB_PASS در deploy.env خالی است."
DOMAIN="${DOMAIN:-kucafe.ir}"
CREATE_DB="${CREATE_DB:-0}"
DOWNLOAD_MEDIA="${DOWNLOAD_MEDIA:-1}"
c_g "  دیتابیس=$DB_NAME کاربر=$DB_USER دامنه=$DOMAIN"

# ── ۱) پیش‌نیازها ────────────────────────────────────────────────────────
step "۱) بررسی پیش‌نیازها"
need() { command -v "$1" >/dev/null 2>&1; }
need node || die "node نصب نیست. نصب کن: curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && apt install -y nodejs"
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
[ "$NODE_MAJOR" -ge 18 ] || die "Node نسخه‌ی $NODE_MAJOR؛ حداقل ۱۸ لازم است (۲۲ توصیه می‌شود)."
need npm || die "npm نیست."
MYSQL_CLI=""; for m in mariadb mysql; do need "$m" && { MYSQL_CLI="$m"; break; }; done
[ -n "$MYSQL_CLI" ] || die "کلاینت mysql/mariadb نیست. نصب: apt install -y mariadb-client"
if ! need pm2; then c_y "  pm2 نیست؛ نصب سراسری…"; npm i -g pm2 >/dev/null 2>&1 || die "نصب pm2 نشد."; fi
# موتور تصویر: sharp (اگر CPU از v2 پشتیبانی کند) یا ImageMagick
if need convert || need magick; then c_g "  موتور تصویر: ImageMagick موجود"; else
  c_y "  ImageMagick نیست. اگر CPU از x86-64-v2 پشتیبانی نکند، sharp کار نمی‌کند"
  c_y "  و ساختِ تصویر شکست می‌خورد. برای اطمینان نصب کن: apt install -y imagemagick webp"
fi
c_g "  node $(node -v) · $MYSQL_CLI · pm2 $(pm2 -v 2>/dev/null)"

# ── ۲) کشیدن آخرین کد ────────────────────────────────────────────────────
step "۲) هم‌تراز کردن با گیت"
if [ -d .git ]; then
  git config core.fileMode false
  BR="$(git rev-parse --abbrev-ref HEAD)"
  STASHED=0
  if ! git diff --quiet -- ':!deploy.env' ':!.env.local' 2>/dev/null; then
    c_y "  تغییرات محلی هست؛ قبل از pull کنار گذاشته می‌شود (git stash)."
    BEFORE_STASH="$(git rev-parse -q --verify refs/stash || true)"
    git stash push -u -m "deploy.sh auto-stash" -- ':!deploy.env' ':!.env.local' >/dev/null 2>&1
    # exit code از stash push به تنهایی معتبر نیست: اگر deploy.env/.env.local
    # نادیده‌گرفته‌شده باشند (که هستند)، git یک هشدار می‌دهد و ۱ برمی‌گرداند
    # حتی وقتی stash واقعاً ساخته شده. پس با مقایسه‌ی refs/stash چک می‌کنیم.
    AFTER_STASH="$(git rev-parse -q --verify refs/stash || true)"
    [ "$AFTER_STASH" != "$BEFORE_STASH" ] && [ -n "$AFTER_STASH" ] && STASHED=1
  fi
  if ! git pull --ff-only origin "$BR" 2>&1 | tail -3; then
    [ "$STASHED" = "1" ] && git stash pop >/dev/null 2>&1
    die "git pull ناموفق بود (fast-forward نشد). دستی merge/rebase کن و دوباره اجرا کن."
  fi
  if [ "$STASHED" = "1" ]; then
    git stash pop 2>&1 | tail -5 || c_y "  git stash pop تداخل داشت — با دست merge کن: git stash list"
  fi
  c_g "  شاخه: $BR @ $(git rev-parse --short HEAD)"
else
  c_y "  اینجا مخزن گیت نیست؛ با فایل‌های موجود ادامه می‌دهم."
fi

# ── ۳) ساخت .env.local ───────────────────────────────────────────────────
step "۳) نوشتن .env.local"
url_pass="$(node -e 'process.stdout.write(encodeURIComponent(process.argv[1]))' "$DB_PASS")"
DB_URL="mysql://${DB_USER}:${url_pass}@127.0.0.1:3306/${DB_NAME}"
if [ -f .env.local ]; then
  c_y "  .env.local هست؛ SESSION_SECRET و مقادیر موجود حفظ می‌شوند."
  SECRET="$(grep -E '^SESSION_SECRET=' .env.local | head -1 | cut -d= -f2- || true)"
fi
[ -n "${SECRET:-}" ] || SECRET="$(node -e 'console.log(require("crypto").randomBytes(32).toString("hex"))')"
# AUTH_DEV_MODE فقط وقتی کلید پیامک باشد false می‌شود
if [ -n "${SMSIR_API_KEY:-}" ]; then DEV_MODE=false; else DEV_MODE=true; c_y "  کلید SMS خالی → AUTH_DEV_MODE=true (کد ورود در لاگ، بدون پیامک واقعی)"; fi
umask 077
cat > .env.local <<EOF
# تولیدشده توسط deploy.sh — رازها اینجا می‌مانند، در git نمی‌روند.
DATABASE_URL=${DB_URL}
SESSION_SECRET=${SECRET}
AUTH_DEV_MODE=${DEV_MODE}
SMSIR_API_KEY=${SMSIR_API_KEY:-}
SMSIR_TEMPLATE_ID=${SMSIR_TEMPLATE_ID:-}
ADMIN_PHONES=${ADMIN_PHONES:-}
EOF
chmod 600 .env.local
c_g "  .env.local نوشته شد (chmod 600)."

# ── ۴) ساخت دیتابیس (اختیاری) ────────────────────────────────────────────
# نکته: کاربر باید برای هر دو میزبانِ 'localhost' (سوکت، برای CLI/migrate) و
# '127.0.0.1' (TCP، همانی که DATABASE_URL از آن استفاده می‌کند) ساخته شود؛
# در MySQL/MariaDB یوزرِ 'localhost' برای اتصال TCP از 127.0.0.1 هم کار نمی‌کند.
if [ "$CREATE_DB" = "1" ]; then
  step "۴) ساخت دیتابیس و کاربر (با root سوکت)"
  SQL="CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS '${DB_USER}'@'localhost' IDENTIFIED BY '${DB_PASS}';
CREATE USER IF NOT EXISTS '${DB_USER}'@'127.0.0.1' IDENTIFIED BY '${DB_PASS}';
ALTER USER '${DB_USER}'@'localhost' IDENTIFIED BY '${DB_PASS}';
ALTER USER '${DB_USER}'@'127.0.0.1' IDENTIFIED BY '${DB_PASS}';
GRANT ALL PRIVILEGES ON \`${DB_NAME}\`.* TO '${DB_USER}'@'localhost';
GRANT ALL PRIVILEGES ON \`${DB_NAME}\`.* TO '${DB_USER}'@'127.0.0.1';
FLUSH PRIVILEGES;"
  DA_CONF=/usr/local/directadmin/conf/mysql.conf
  # سوکتِ واقعیِ MariaDB را پیدا کن؛ کلاینت‌ها به‌طور پیش‌فرض /tmp/mysql.sock را
  # امتحان می‌کنند که ممکن است روی این سرور وجود نداشته باشد (سوکتِ واقعی جای
  # دیگری‌ست، مثلاً /var/lib/mysql/mysql.sock).
  DA_SOCK="$(awk -F= '/^socket=/{print $2}' "$DA_CONF" 2>/dev/null)"
  [ -S "${DA_SOCK:-}" ] || DA_SOCK="$(awk -F= '/^socket[[:space:]]*=/{print $2}' /etc/my.cnf /etc/my.cnf.d/*.cnf 2>/dev/null | head -1)"
  SOCK_OPT=(); [ -S "${DA_SOCK:-}" ] && SOCK_OPT=(--socket="$DA_SOCK")
  if echo "$SQL" | "$MYSQL_CLI" -u root "${SOCK_OPT[@]}" 2>/dev/null; then c_g "  دیتابیس/کاربر آماده شد (root سوکت)."
  elif echo "$SQL" | sudo "$MYSQL_CLI" -u root "${SOCK_OPT[@]}" 2>/dev/null; then c_g "  دیتابیس/کاربر آماده شد (sudo root)."
  elif [ -r "$DA_CONF" ]; then
    # DirectAdmin: root مای‌اسکل با سوکت باز نمی‌شود؛ رمزِ da_admin در این فایل است.
    DA_U="$(awk -F= '/^user=/{print $2}' "$DA_CONF")"
    DA_P="$(awk -F= '/^passwd=/{print $2}' "$DA_CONF")"
    if [ -n "$DA_U" ] && echo "$SQL" | "$MYSQL_CLI" -u"$DA_U" -p"$DA_P" "${SOCK_OPT[@]}" 2>/dev/null; then
      c_g "  دیتابیس/کاربر آماده شد (اعتبارِ DirectAdmin)."
    else die "ساخت دیتابیس با اعتبارِ DirectAdmin هم نشد. دستی بساز یا CREATE_DB=0 کن. SQL:
$SQL"; fi
  else die "ساخت دیتابیس با root نشد. دستی بساز یا CREATE_DB=0 کن. SQL:
$SQL"; fi
else
  step "۴) ساخت دیتابیس — رد شد (CREATE_DB=0)"
fi
# اتصال کاربر اپ همیشه با TCP/127.0.0.1 — دقیقاً همان چیزی که DATABASE_URL استفاده
# می‌کند. سوکتِ پیش‌فرضِ کلاینت (/tmp/mysql.sock) روی خیلی سرورها وجود ندارد،
# پس زیرِ این خط دیگر هرگز به سوکتِ پیش‌فرض تکیه نمی‌کنیم.
DB_CLI=("$MYSQL_CLI" -h127.0.0.1 -P3306 --protocol=TCP -u"$DB_USER" -p"$DB_PASS" "$DB_NAME")
echo 'SELECT 1;' | "${DB_CLI[@]}" >/dev/null 2>&1 \
  || die "اتصال TCP با کاربر اپ (${DB_USER}@127.0.0.1) به دیتابیس نشد. DB_PASS/دسترسیِ '${DB_USER}'@'127.0.0.1' را چک کن."
c_g "  اتصال کاربر اپ به دیتابیس (TCP) اوکی."

# ── ۵) وابستگی‌ها ─────────────────────────────────────────────────────────
step "۵) نصب وابستگی‌ها (npm ci)"
if ! npm ci 2>&1 | tail -4; then
  c_y "  npm ci شکست خورد؛ پاک‌سازی node_modules و تلاش دوباره…"
  rm -rf node_modules && npm ci 2>&1 | tail -4 || die "npm ci نشد."
fi
c_g "  وابستگی‌ها نصب شد."

# ── ۶) مهاجرت schema ─────────────────────────────────────────────────────
step "۶) مهاجرت دیتابیس (migrate + extras + mariadb-fix)"
npm run db:migrate 2>&1 | tail -6 || die "db:migrate نشد."

# ── ۷) واردکردن داده ─────────────────────────────────────────────────────
step "۷) واردکردن داده"
PLACES="$(echo 'SELECT COUNT(*) FROM place;' | "${DB_CLI[@]}" -N 2>/dev/null || echo 0)"
BACKUP_TGZ="$(ls -1t kucafe-backup-*.tar.gz 2>/dev/null | head -1 || true)"
if [ "${PLACES:-0}" -gt 0 ]; then
  c_g "  دیتابیس از قبل $PLACES کافه دارد — واردکردن رد شد."
elif [ -n "$BACKUP_TGZ" ]; then
  c_y "  بکاپ پیدا شد: $BACKUP_TGZ — دیتا از آن بازیابی می‌شود."
  tmp="$(mktemp -d)"; tar -xzf "$BACKUP_TGZ" -C "$tmp"
  SEED="$(ls "$tmp"/*.sql.gz 2>/dev/null | head -1 || true)"
  [ -n "$SEED" ] || die "در بکاپ فایل .sql.gz نبود."
  gzip -dc "$SEED" | "${DB_CLI[@]}" || die "بازیابی دیتای بکاپ نشد."
  # مدیای داخل بکاپ (اگر بود)
  if ls "$tmp"/media*.tar.gz >/dev/null 2>&1; then
    c_y "  بازیابی مدیا از بکاپ…"; mkdir -p public/media
    tar -xzf "$tmp"/media*.tar.gz -C . && DOWNLOAD_MEDIA=0
  fi
  rm -rf "$tmp"
  npm run db:mariadb-fix 2>&1 | tail -2 || true
  c_g "  دیتا از بکاپ بازیابی شد."
elif [ -f db/seed/kucafe-data.sql.gz ]; then
  c_y "  واردکردن seed از مخزن (db/seed/kucafe-data.sql.gz)…"
  gzip -dc db/seed/kucafe-data.sql.gz | "${DB_CLI[@]}" || die "واردکردن seed نشد."
  npm run db:mariadb-fix 2>&1 | tail -2 || true
  # seed از یک دیپلویِ دیگر می‌آید که ردیف‌های media را status='ok' علامت زده؛
  # روی این سرورِ تازه فایلی روی دیسک نیست. بدون این ریست، media:download
  # چیزی برای دانلود پیدا نمی‌کند و همه‌ی تصویرها ۴۰۴ می‌مانند.
  echo "UPDATE media SET status='pending', attempts=0, error=NULL WHERE status='ok';" \
    | "${DB_CLI[@]}" || true
  NEW="$(echo 'SELECT COUNT(*) FROM place;' | "${DB_CLI[@]}" -N)"
  c_g "  seed وارد شد: $NEW کافه (مدیا برای بازسازی از منبع به pending برگشت)."
else
  c_y "  نه دیتای موجود، نه بکاپ، نه seed. دیتابیس خالی می‌ماند."
fi

# ── ۸) ساخت (prebuild خودش نقشه را می‌سازد) ──────────────────────────────
step "۸) ساخت پروداکشن (build + map:worker + map:publish)"
NODE_ENV=production npm run build 2>&1 | tail -8 || die "build نشد."
c_g "  ساخت کامل شد."

# ── ۹) تصاویر ─────────────────────────────────────────────────────────────
step "۹) تصاویر"
# اگر public/media هنوز نباشد (اولین اجرا)، find با exit≠0 برمی‌گردد که زیرِ
# `set -e -o pipefail` کل اسکریپت را قبل از رسیدن به PM2 می‌کشد؛ `|| true` می‌گذاریم.
mkdir -p public/media
MEDIA_COUNT="$(find public/media -type f 2>/dev/null | head -2000 | wc -l | tr -d ' ' || true)"
if [ "${MEDIA_COUNT:-0}" -gt 100 ]; then
  c_g "  مدیا از قبل موجود است (~$MEDIA_COUNT فایلِ نمونه‌گیری‌شده) — رد شد."
elif [ "$DOWNLOAD_MEDIA" = "1" ]; then
  c_y "  دانلود/ساختِ تصاویر در پس‌زمینه (۱ گیگ، طول می‌کشد)…"
  mkdir -p logs
  nohup npm run media:download > logs/media-download.log 2>&1 &
  c_g "  در پس‌زمینه شروع شد. پیشرفت: tail -f logs/media-download.log"
else
  c_y "  DOWNLOAD_MEDIA=0 — بعداً دستی: npm run media:download"
fi

# ── ۱۰) PM2 ───────────────────────────────────────────────────────────────
step "۱۰) اجرا با PM2"
mkdir -p logs
if pm2 describe kucafe >/dev/null 2>&1; then pm2 reload ecosystem.config.cjs --env production; else pm2 start ecosystem.config.cjs --env production; fi
pm2 save >/dev/null 2>&1 || true
pm2 startup >/dev/null 2>&1 || c_y "  برای بالاآمدن خودکار بعد از ری‌بوت، دستور چاپ‌شده‌ی 'pm2 startup' را اجرا کن."

# ── ۱۱) بررسی سلامت ───────────────────────────────────────────────────────
step "۱۱) بررسی سلامت"
ok=0
for i in $(seq 1 20); do
  code="$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/robots.txt || echo 000)"
  [ "$code" = "200" ] && { ok=1; break; }
  sleep 1
done
[ "$ok" = "1" ] && c_g "  اپ روی 127.0.0.1:3000 پاسخ می‌دهد (HTTP 200)." || { pm2 logs kucafe --lines 20 --nostream; die "اپ بالا نیامد."; }
npm run deploy:verify 2>&1 | tail -15 || c_y "  deploy:verify هشدار داد — بالا را ببین."

# ── پایان ─────────────────────────────────────────────────────────────────
step "تمام"
c_g "«کو کافه» روی 127.0.0.1:3000 بالاست."
cat <<EOF

مرحله‌ی بعد — ریورس‌پروکسی و TLS (اپ عمداً فقط روی 127.0.0.1 گوش می‌دهد):

  • DirectAdmin/LiteSpeed: یک reverse proxy از ${DOMAIN} به 127.0.0.1:3000 بساز.
    نمونه‌های آماده: deploy/nginx.conf ، deploy/apache-kucafe.conf ، deploy/kucafe-proxy.conf
  • بعد از وصل‌شدن DNS، گواهی TLS را از پنل یا certbot بگیر.

دستورهای روزمره:
  pm2 logs kucafe          لاگ زنده
  pm2 reload kucafe        ری‌لود بی‌قطعی بعد از تغییر
  npm run deploy:verify    چک سلامت دیتابیس/نقشه/جست‌وجو
  ./scripts/backup.sh      گرفتن بکاپ قابل‌انتقال

$( [ "$DEV_MODE" = "true" ] && echo "⚠️ AUTH_DEV_MODE=true: ورود پیامک واقعی نمی‌فرستد؛ کد در «pm2 logs kucafe» می‌آید. برای فعال‌کردن پیامک، SMSIR_API_KEY را در deploy.env بگذار و دوباره ./deploy.sh بزن." )
EOF
