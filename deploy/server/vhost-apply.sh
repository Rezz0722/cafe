#!/bin/bash
# افزودن vhost کو کافه با بازگشتِ خودکار اگر سایتِ موجودی صدمه بخورد.
#
# دفعه‌ی اول این کار بدون این گارد انجام شد و چهار سایت زنده ۵۰۳ شدند
# (`<VirtualHost *:80>` سبدِ wildcard ساخت و پیش‌فرضِ همه شد). این اسکریپت
# همان اشتباه را غیرقابل‌تکرار می‌کند: قبل از تغییر وضعیت را می‌گیرد، بعد
# مقایسه می‌کند، و اگر بدتر شده بود خودش برمی‌گردد.
set -u
VH=/etc/httpd/conf/extra/httpd-vhosts.conf
DOMAINS="pakerino.ir greensmoke.ir coco.pakerino.ir agent.pakerino.ir"

probe() { curl -s -o /dev/null -w '%{http_code}' --max-time 12 -H "Host: $1" http://127.0.0.1/ 2>/dev/null || echo 000; }

echo "── وضعیت پیش از تغییر ──"
BEFORE=""
for d in $DOMAINS; do c=$(probe "$d"); BEFORE="$BEFORE $d=$c"; echo "  $d $c"; done

cp "$VH" "/root/kucafe-xfer/vhosts.before.$(date +%s)"

if ! grep -q "conf/extra/kucafe.conf" "$VH"; then
  printf '\n# کو کافه — reverse proxy روی Node\nInclude conf/extra/kucafe.conf\n' >> "$VH"
fi

if ! httpd -t 2>&1 | grep -q "Syntax OK"; then
  echo "✗ سینتکس خراب — برمی‌گردانیم"
  sed -i '/conf\/extra\/kucafe.conf/d;/کو کافه — reverse proxy/d' "$VH"
  httpd -t 2>&1 | head -3
  exit 1
fi

systemctl reload httpd
sleep 4

echo "── وضعیت پس از تغییر ──"
BROKE=0
for d in $DOMAINS; do
  c=$(probe "$d")
  was=$(echo "$BEFORE" | tr ' ' '\n' | grep "^$d=" | cut -d= -f2)
  echo "  $d $was → $c"
  [ "$was" = "200" ] && [ "$c" != "200" ] && BROKE=1
done

if [ "$BROKE" = 1 ]; then
  echo "✗ سایتی صدمه خورد — بازگردانی فوری"
  sed -i '/conf\/extra\/kucafe.conf/d;/کو کافه — reverse proxy/d' "$VH"
  systemctl reload httpd
  sleep 3
  for d in $DOMAINS; do echo "  بازگشت: $d $(probe "$d")"; done
  exit 1
fi

echo "✓ هیچ سایتی صدمه نخورد"
echo "  kucafe.ir → $(probe kucafe.ir)  (۵۰۳ طبیعی است تا Node بالا بیاید)"
