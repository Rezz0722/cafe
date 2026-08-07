#!/bin/bash
# rsync دستی روی یک لینکِ ۷ کیلوبایتی و پرریست.
#
#   sync.sh <فایل-محلی> <مسیر-مقصد>
#
# ═══ چرا این و نه scp ═══
#
# آپلود این ماشین ~۷ KB/s است و اتصال SSH هر چند دقیقه ریست می‌شود. scp رزومه
# ندارد: یک ریست در بایت ۹.۶ مگابایتی یعنی از صفر. rsync هم روی این ماشین
# نصب نیست.
#
# پس: فایل به قطعه‌های ۱۲۸ کیلوبایتی شکسته می‌شود، md5 هر قطعه با سرور مقایسه
# می‌شود، و **فقط قطعه‌های گمشده یا متفاوت** می‌روند. اجرای دوباره‌اش ارزان
# است و هر بار به پایان نزدیک‌تر می‌شود.
set -u
LOCAL="$1"
DEST="$2"
NAME=$(basename "$LOCAL")
CHUNK=131072
WORK="/root/kucafe-xfer/sync/$NAME"
OPTS=$(cat "$HOME/.kc/opts")
SCP_OPTS=$(echo "$OPTS" | sed 's/^-p /-P /')
HOST=root@45.159.115.116

rsh() { ssh $OPTS "$HOST" "$@" 2>/dev/null; }

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
split -b $CHUNK -d -a 4 "$LOCAL" "$TMP/p"
TOTAL=$(ls "$TMP" | wc -l)
echo "[$NAME] $TOTAL قطعه × 128KB (کل $(stat -c%s "$LOCAL") بایت)"

# اگر فایلِ ناقصی از تلاش قبلی روی سرور هست، همان را به قطعه بشکن تا
# قطعه‌های سالمش دوباره فرستاده نشوند.
rsh "mkdir -p $WORK && cd $WORK && rm -f p* && if [ -s '$DEST' ]; then split -b $CHUNK -d -a 4 '$DEST' p; fi" >/dev/null

REMOTE_MD5=$(rsh "cd $WORK 2>/dev/null && md5sum p* 2>/dev/null | awk '{print \$2\":\"\$1}'" | tr -d '\r')

need=0
sent=0
for f in "$TMP"/p*; do
  b=$(basename "$f")
  want=$(md5sum "$f" | awk '{print $1}')
  have=$(echo "$REMOTE_MD5" | grep "^$b:" | cut -d: -f2)
  [ "$have" = "$want" ] && continue
  need=$((need + 1))
  for try in $(seq 1 10); do
    timeout 150 scp $SCP_OPTS "$f" "$HOST:$WORK/" >/dev/null 2>&1
    got=$(rsh "md5sum $WORK/$b 2>/dev/null | awk '{print \$1}'" | tr -d '\r')
    if [ "$got" = "$want" ]; then sent=$((sent + 1)); echo "  ✓ $b"; break; fi
    sleep $((try * 3))
  done
done
echo "[$NAME] لازم بود: $need، فرستاده شد: $sent"

# بازسازی و تأیید
rsh "cd $WORK && cat p* > '$DEST' && echo REASSEMBLED" >/dev/null
LOCAL_MD5=$(md5sum "$LOCAL" | awk '{print $1}')
REMOTE_FULL=$(rsh "md5sum '$DEST' | awk '{print \$1}'" | tr -d '\r')
if [ "$LOCAL_MD5" = "$REMOTE_FULL" ]; then
  echo "[$NAME] ✓ md5 یکسان: $LOCAL_MD5"
  rsh "rm -rf $WORK" >/dev/null
  exit 0
fi
echo "[$NAME] ✗ md5 متفاوت (محلی=$LOCAL_MD5 سرور=$REMOTE_FULL) — دوباره اجرا کنید"
exit 1
