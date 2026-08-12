#!/usr/bin/env bash
#
# تمدید گواهی TLS سرور جیتسیِ پلتفرم (class.hyggemode.com).
#
# چرا اسکریپت لازم است و چرا روی سرور اجرا نمی‌شود:
# سرور به Let's Encrypt دسترسی ندارد — `curl` به
# acme-v02.api.letsencrypt.org از آنجا صفر برمی‌گرداند در حالی که بقیه‌ی
# اینترنت باز است. پس گواهی روی همین ماشین صادر می‌شود و با scp می‌رود.
#
# چالش DNS-01 است نه HTTP-01، چون DNS-01 به دسترسی ورودی نیاز ندارد و
# رکورد TXT را می‌شود دستی گذاشت.
#
#   ./scripts/renew-jitsi-cert.sh          صدور/تمدید و نصب
#   ./scripts/renew-jitsi-cert.sh --deploy فقط نصب گواهی موجود روی سرور
#
# گواهی‌ها ۹۰ روزه‌اند. هر ~۶۰ روز اجرا شود.
#
# برای خودکار کردن کامل: acme.sh افزونه‌ی dns_arvan دارد. با توکن API
# آروان (`Arvan_Token`) دیگر مرحله‌ی دستی TXT لازم نیست:
#   export Arvan_Token="..."
#   acme.sh --issue --dns dns_arvan -d class.hyggemode.com
set -euo pipefail

DOMAIN="class.hyggemode.com"
SERVER="87.107.104.218"
REMOTE_DIR="/etc/nginx/ssl/class"
ACME="$HOME/.acme.sh/acme.sh"
CERT_DIR="$HOME/.acme.sh/${DOMAIN}_ecc"

if [ ! -x "$ACME" ]; then
  echo "acme.sh نصب نیست. نصبش کنید:" >&2
  echo "  curl -sS https://get.acme.sh -o /tmp/i.sh" >&2
  # ترتیب آرگومان‌ها مهم است: اسکریپت نصب، آرگومان اول را ایمیل فرض
  # می‌کند و بقیه را عیناً پاس می‌دهد.
  echo "  sh /tmp/i.sh email=YOU@example.com --nocron" >&2
  exit 1
fi

deploy() {
  echo "→ انتقال گواهی به $SERVER"
  scp -q "$CERT_DIR/fullchain.cer" "$SERVER:$REMOTE_DIR/fullchain.pem"
  scp -q "$CERT_DIR/$DOMAIN.key"   "$SERVER:$REMOTE_DIR/privkey.pem"
  ssh "$SERVER" "chmod 600 $REMOTE_DIR/privkey.pem && chmod 644 $REMOTE_DIR/fullchain.pem && nginx -t && systemctl reload nginx"

  echo "→ بررسی گواهی زنده"
  echo | openssl s_client -connect "$SERVER:443" -servername "$DOMAIN" 2>/dev/null \
    | openssl x509 -noout -issuer -subject -enddate
}

if [ "${1:-}" = "--deploy" ]; then
  deploy
  exit 0
fi

echo "→ درخواست چالش DNS-01"
set +e
"$ACME" --issue --dns -d "$DOMAIN" --server letsencrypt \
  --yes-I-know-dns-manual-mode-enough-go-ahead-please
set -e

cat <<'NOTE'

──────────────────────────────────────────────────────────────
رکورد TXT بالا را در پنل آروان اضافه کنید، منتظر انتشارش بمانید،
بعد ادامه دهید. بررسی انتشار:

  dig +short TXT _acme-challenge.class.hyggemode.com @1.1.1.1

⚠️ رکورد A برای `class` را حذف نکنید. ساختن رکورد زیرِ
   class.hyggemode.com باعث می‌شود آن نام در DNS «موجود» شود و
   وایلدکارد *.hyggemode.com دیگر پوششش ندهد — بدون رکورد A صریح،
   دامنه از کار می‌افتد.
──────────────────────────────────────────────────────────────

NOTE

read -r -p "رکورد TXT اضافه و منتشر شد؟ [y/N] " answer
[ "$answer" = "y" ] || { echo "لغو شد."; exit 1; }

echo "→ تکمیل اعتبارسنجی"
"$ACME" --renew -d "$DOMAIN" --yes-I-know-dns-manual-mode-enough-go-ahead-please

deploy
