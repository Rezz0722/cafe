#!/usr/bin/env bash
# بازیابی یک بکاپ کامل کوکافه روی Ubuntu/Debian تازه.
# پیش‌نیازها، MariaDB، Node.js 22، Nginx، systemd و TLS را آماده می‌کند.

set -Eeuo pipefail
umask 077

usage() {
  cat <<'EOF'
استفاده (با root):
  ./restore-full.sh BACKUP.tar.gz --domain kucafe.ir --email admin@example.com

گزینه‌ها:
  --target DIR       مسیر نصب (پیش‌فرض: /opt/kucafe)
  --domain DOMAIN    دامنهٔ اصلی
  --email EMAIL      ایمیل Let's Encrypt
  --port PORT        پورت داخلی Node (پیش‌فرض: 3000)
  --replace          نصب موجود را به DIR.before-TIMESTAMP منتقل کن
  --skip-packages    نصب apt را انجام نده
  --skip-tls         فقط HTTP را بالا بیاور
  --www              گواهی و vhost برای www هم بساز (DNS آن باید وصل باشد)
EOF
}

if [[ "${1:-}" = -h || "${1:-}" = --help ]]; then
  usage
  exit 0
fi
[[ $# -ge 1 ]] || { usage >&2; exit 2; }
ARCHIVE="$1"; shift
TARGET=/opt/kucafe
DOMAIN=kucafe.ir
EMAIL=''
PORT=3000
REPLACE=0
SKIP_PACKAGES=0
SKIP_TLS=0
WITH_WWW=0

while (($#)); do
  case "$1" in
    --target) TARGET="${2:?مسیر لازم است}"; shift 2 ;;
    --domain) DOMAIN="${2:?دامنه لازم است}"; shift 2 ;;
    --email) EMAIL="${2:?ایمیل لازم است}"; shift 2 ;;
    --port) PORT="${2:?پورت لازم است}"; shift 2 ;;
    --replace) REPLACE=1; shift ;;
    --skip-packages) SKIP_PACKAGES=1; shift ;;
    --skip-tls) SKIP_TLS=1; shift ;;
    --www) WITH_WWW=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "گزینهٔ ناشناخته: $1" >&2; usage >&2; exit 2 ;;
  esac
done

[[ $EUID -eq 0 ]] || { echo '✗ restore باید با root اجرا شود.' >&2; exit 1; }
[[ -f "$ARCHIVE" ]] || { echo "✗ بکاپ پیدا نشد: $ARCHIVE" >&2; exit 1; }
[[ "$TARGET" = /* && "$TARGET" != / && "$TARGET" != /opt && "$TARGET" != /var ]] || { echo '✗ --target باید یک مسیر مطلق و اختصاصی باشد.' >&2; exit 2; }
[[ "$DOMAIN" =~ ^[A-Za-z0-9.-]+$ ]] || { echo '✗ دامنه نامعتبر است.' >&2; exit 2; }
[[ "$PORT" =~ ^[0-9]+$ ]] && ((PORT >= 1024 && PORT <= 65535)) || { echo '✗ پورت نامعتبر است.' >&2; exit 2; }

TMP="$(mktemp -d)"
cleanup() { rm -rf -- "$TMP"; }
trap cleanup EXIT INT TERM

echo '▸ اعتبارسنجی آرشیو…'
if [[ -f "$ARCHIVE.sha256" ]]; then
  (cd "$(dirname "$ARCHIVE")" && sha256sum -c "$(basename "$ARCHIVE").sha256")
fi
gzip -t "$ARCHIVE"
if tar -tzf "$ARCHIVE" | grep -Eq '(^/|(^|/)\.\.(/|$))'; then
  echo '✗ مسیر ناامن داخل آرشیو پیدا شد.' >&2
  exit 1
fi
tar -xzf "$ARCHIVE" -C "$TMP"
grep -qx 'format=kucafe-portable-backup-v2' "$TMP/manifest.txt" || { echo '✗ فرمت بکاپ پشتیبانی نمی‌شود.' >&2; exit 1; }
[[ -d "$TMP/app" && -f "$TMP/database.sql.gz" && -f "$TMP/env.production" ]] || { echo '✗ بکاپ ناقص است.' >&2; exit 1; }

if ((SKIP_PACKAGES == 0)); then
  command -v apt-get >/dev/null || { echo '✗ نصب خودکار فعلاً برای Ubuntu/Debian پشتیبانی می‌شود.' >&2; exit 1; }
  echo '▸ نصب پیش‌نیازهای سیستم…'
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -y
  apt-get install -y ca-certificates curl gnupg gzip tar rsync mariadb-server mariadb-client nginx certbot python3-certbot-nginx
  if ! command -v node >/dev/null || [[ "$(node -p 'Number(process.versions.node.split(".")[0])')" -lt 22 ]]; then
    curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
    apt-get install -y nodejs
  fi
fi

for cmd in node npm mariadb mariadb-dump nginx systemctl rsync; do
  command -v "$cmd" >/dev/null || { echo "✗ پیش‌نیاز پیدا نشد: $cmd" >&2; exit 1; }
done

if [[ -e "$TARGET" ]] && [[ -n "$(find "$TARGET" -mindepth 1 -maxdepth 1 -print -quit 2>/dev/null)" ]]; then
  ((REPLACE)) || { echo "✗ $TARGET خالی نیست؛ برای نگهداری نسخهٔ قبل --replace بدهید." >&2; exit 1; }
  systemctl stop kucafe.service 2>/dev/null || true
  OLD="$TARGET.before-$(date -u +%Y%m%dT%H%M%SZ)"
  mv "$TARGET" "$OLD"
  echo "✓ نسخهٔ قبلی قابل‌بازیابی ماند: $OLD"
fi

mkdir -p "$TARGET"
rsync -a "$TMP/app/" "$TARGET/"
install -m 600 "$TMP/env.production" "$TARGET/.env.local"
if [[ -f "$TMP/runtime/topmenu-sync/state.json" ]]; then
  mkdir -p "$TARGET/var/topmenu-sync"
  install -m 600 "$TMP/runtime/topmenu-sync/state.json" "$TARGET/var/topmenu-sync/state.json"
fi

if grep -q '^NEXT_PUBLIC_SITE_URL=' "$TARGET/.env.local"; then
  sed -i "s#^NEXT_PUBLIC_SITE_URL=.*#NEXT_PUBLIC_SITE_URL=https://$DOMAIN#" "$TARGET/.env.local"
else
  printf '\nNEXT_PUBLIC_SITE_URL=https://%s\n' "$DOMAIN" >>"$TARGET/.env.local"
fi

DB_URL="$(node --env-file="$TARGET/.env.local" -e 'process.stdout.write(process.env.DATABASE_URL || "")')"
[[ -n "$DB_URL" ]] || { echo '✗ DATABASE_URL در env نیست.' >&2; exit 1; }
mapfile -t DB_PARTS < <(node -e 'const u=new URL(process.argv[1]); for (const v of [u.pathname.slice(1),decodeURIComponent(u.username),decodeURIComponent(u.password),u.hostname,u.port||"3306"]) console.log(Buffer.from(v).toString("base64"))' "$DB_URL")
decode() { printf '%s' "$1" | base64 -d; }
DB_NAME="$(decode "${DB_PARTS[0]}")"
DB_USER="$(decode "${DB_PARTS[1]}")"
DB_PASS="$(decode "${DB_PARTS[2]}")"
DB_HOST="$(decode "${DB_PARTS[3]}")"
DB_PORT="$(decode "${DB_PARTS[4]}")"
[[ "$DB_NAME" =~ ^[A-Za-z0-9_]+$ && "$DB_USER" =~ ^[A-Za-z0-9_]+$ ]] || { echo '✗ نام دیتابیس/کاربر باید فقط حرف، عدد و underscore باشد.' >&2; exit 1; }
[[ "$DB_HOST" = 127.0.0.1 || "$DB_HOST" = localhost ]] || { echo '✗ restore خودکار فقط دیتابیس محلی را می‌سازد.' >&2; exit 1; }

systemctl enable --now mariadb 2>/dev/null || systemctl enable --now mysql
SQL_PASS="${DB_PASS//\\/\\\\}"; SQL_PASS="${SQL_PASS//\'/\\\'}"
mariadb -u root <<SQL
CREATE DATABASE IF NOT EXISTS \`$DB_NAME\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS '$DB_USER'@'localhost' IDENTIFIED BY '$SQL_PASS';
CREATE USER IF NOT EXISTS '$DB_USER'@'127.0.0.1' IDENTIFIED BY '$SQL_PASS';
ALTER USER '$DB_USER'@'localhost' IDENTIFIED BY '$SQL_PASS';
ALTER USER '$DB_USER'@'127.0.0.1' IDENTIFIED BY '$SQL_PASS';
GRANT ALL PRIVILEGES ON \`$DB_NAME\`.* TO '$DB_USER'@'localhost';
GRANT ALL PRIVILEGES ON \`$DB_NAME\`.* TO '$DB_USER'@'127.0.0.1';
FLUSH PRIVILEGES;
SQL

echo '▸ نصب برنامه و بازیابی کامل schema/data…'
cd "$TARGET"
npm ci
# بکاپ v2 خروجی native همان MariaDB است و schema دقیقِ همان داده را دارد؛
# این راه از اختلاف journal قدیمی Drizzle با migrationهای افزایشی جلوگیری می‌کند.
MYSQL_PWD="$DB_PASS" gzip -dc "$TMP/database.sql.gz" | MYSQL_PWD="$DB_PASS" mariadb --protocol=TCP -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" "$DB_NAME"
npm run db:extras
npm run db:mariadb-fix
npm run db:verify
npm run build

mkdir -p "$TARGET/logs" "$TARGET/var" "$TARGET/public/media" "$TARGET/.next/cache"
chown -R www-data:www-data "$TARGET/logs" "$TARGET/var" "$TARGET/public/media" "$TARGET/.next/cache"

cat > /etc/systemd/system/kucafe.service <<EOF
[Unit]
Description=KuCafe production
After=network-online.target mariadb.service mysql.service
Wants=network-online.target

[Service]
Type=simple
User=www-data
Group=www-data
WorkingDirectory=$TARGET
EnvironmentFile=$TARGET/.env.local
Environment=NODE_ENV=production
ExecStart=/usr/bin/node $TARGET/node_modules/next/dist/bin/next start --port $PORT --hostname 127.0.0.1
Restart=always
RestartSec=3
TimeoutStopSec=20
LimitNOFILE=65535

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable kucafe.service
systemctl restart kucafe.service

SERVER_NAMES="$DOMAIN"
((WITH_WWW)) && SERVER_NAMES="$DOMAIN www.$DOMAIN"
cat > /etc/nginx/sites-available/kucafe.conf <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name $SERVER_NAMES;
    client_max_body_size 12m;

    location /_next/static/ { alias $TARGET/.next/static/; expires 1y; add_header Cache-Control "public, immutable"; }
    location /media/ { alias $TARGET/public/media/; expires 30d; }
    location /map/ { alias $TARGET/public/map/; expires 30d; }
    location /fonts/ { alias $TARGET/public/fonts/; expires 1y; }
    location /maplibre/ { alias $TARGET/public/maplibre/; expires 1y; }
    location / {
        proxy_pass http://127.0.0.1:$PORT;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
EOF
ln -sfn /etc/nginx/sites-available/kucafe.conf /etc/nginx/sites-enabled/kucafe.conf
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl enable --now nginx
systemctl reload nginx

if ((SKIP_TLS == 0)); then
  CERT_ARGS=(--nginx --non-interactive --agree-tos --redirect -d "$DOMAIN")
  [[ -n "$EMAIL" ]] && CERT_ARGS+=(--email "$EMAIL") || CERT_ARGS+=(--register-unsafely-without-email)
  ((WITH_WWW)) && CERT_ARGS+=(-d "www.$DOMAIN")
  certbot "${CERT_ARGS[@]}"
fi

echo '▸ بررسی سلامت…'
for _ in {1..30}; do
  [[ "$(curl -sS -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT/robots.txt" || true)" = 200 ]] && break
  sleep 1
done
curl -fsS "http://127.0.0.1:$PORT/robots.txt" >/dev/null
npm run db:verify
echo "✓ بازیابی و دیپلوی کامل شد: https://$DOMAIN"
