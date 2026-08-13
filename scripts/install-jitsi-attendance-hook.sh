#!/usr/bin/env bash
#
# نصب هوک حضور روی سرور جیتسیِ پلتفرم (class.hyggemode.com).
#
# چه کاری می‌کند: ماژول `event_sync_component` را روی prosody فعال
# می‌کند تا هر ورود و خروج اتاق را به API بفرستد. تا وقتی این نصب نشده،
# حضور فقط گزارشِ مرورگر است و هیچ تصمیم مالی‌ای رویش گرفته نمی‌شود —
# جاروی بستن جلسه به‌جای بازپرداخت خودکار، پرونده‌ی
# `ATTENDANCE_UNVERIFIED` باز می‌کند.
#
#   ./scripts/install-jitsi-attendance-hook.sh --check    فقط گزارش وضعیت
#   ./scripts/install-jitsi-attendance-hook.sh            نصب یا به‌روزرسانی
#
# راز مشترک از `JITSI_WEBHOOK_SECRET` در `.env` ریشه‌ی مخزن خوانده
# می‌شود؛ همان مقداری که API هم با آن رویدادها را می‌سنجد.
#
# ⚠️ **این اسکریپت روی سرور تیم دست نمی‌زند.** فقط پروژه‌ی کامپوزِ
# `jitsi-class` در `/home/fardin/music-platform/jitsi` را می‌شناسد.
# نمونه‌ی تیم (`/root/project/jitsi`) به این پروژه ربطی ندارد.
set -euo pipefail

SERVER="${JITSI_SSH_HOST:-87.107.104.218}"
REMOTE_DIR="${JITSI_REMOTE_DIR:-/home/fardin/music-platform/jitsi}"
SERVICE="prosody"

# دامنه‌ی XMPP **داخلی**، نه دامنه‌ی عمومی. همان چیزی که در `sub` توکن
# می‌رود و یک بار قبلاً با دامنه‌ی عمومی اشتباه گرفته شد.
XMPP_DOMAIN="${JITSI_XMPP_DOMAIN:-meet.jitsi}"

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$REPO_ROOT/.env"

MODULE="mod_event_sync_component.lua"
# ماژول در خودِ ایمیج هست، ولی زیر پوشه‌ای که prosody در آن دنبالش
# نمی‌گردد: مسیرهای جست‌وجو فقط `mod_X.lua` یا `X/mod_X.lua` را پیدا
# می‌کنند و این یکی در `event_sync/` است، نه `event_sync_component/`.
MODULE_IN_IMAGE="/prosody-plugins-contrib/event_sync/$MODULE"
MODULE_TARGET="/prosody-plugins-custom/$MODULE"
CONF_TARGET="/config/conf.d/event-sync.cfg.lua"

say() { printf '%s\n' "$*"; }
fail() { printf '%s\n' "$*" >&2; exit 1; }

remote() { ssh "$SERVER" "cd $REMOTE_DIR && $*"; }

# ---------------------------------------------------------------------------
# ورودی‌ها
# ---------------------------------------------------------------------------

read_env() {
  local key="$1"
  [ -f "$ENV_FILE" ] || fail "فایل $ENV_FILE پیدا نشد."
  # مقدار ممکن است داخل گیومه باشد
  sed -n "s/^${key}=[\"']\{0,1\}\([^\"']*\)[\"']\{0,1\}$/\1/p" "$ENV_FILE" | tail -n1
}

API_BASE="$(read_env NEXT_PUBLIC_API_URL)"
SECRET="$(read_env JITSI_WEBHOOK_SECRET)"

CHECK_ONLY="false"
[ "${1:-}" = "--check" ] && CHECK_ONLY="true"

if [ "$CHECK_ONLY" = "false" ]; then
  [ -n "$SECRET" ] || fail "JITSI_WEBHOOK_SECRET در .env خالی است. با «openssl rand -base64 48» یکی بسازید."
  [ -n "$API_BASE" ] || fail "NEXT_PUBLIC_API_URL در .env خالی است — نشانی API را نمی‌دانم."
fi

# `api_prefix` را خود ماژول با `/events/occupant/joined` و سه تای دیگر
# کامل می‌کند، پس اینجا نباید اسلش انتهایی داشته باشد.
API_PREFIX="${API_BASE%/}/classroom/hook"

# ---------------------------------------------------------------------------
# وضعیت فعلی
# ---------------------------------------------------------------------------

say "→ سرور: $SERVER · پروژه: $REMOTE_DIR"

remote "docker compose ps --status running --services" | grep -qx "$SERVICE" \
  || fail "سرویس $SERVICE در $REMOTE_DIR بالا نیست."

/bin/echo -n "→ ماژول در ایمیج: "
if remote "docker compose exec -T $SERVICE test -f $MODULE_IN_IMAGE"; then
  say "هست"
else
  fail "در این ایمیج نیست. نسخه‌ی prosody را بررسی کنید یا فایل را دستی از
  https://github.com/jitsi-contrib/prosody-plugins بردارید."
fi

/bin/echo -n "→ ماژول نصب‌شده: "
remote "docker compose exec -T $SERVICE test -f $MODULE_TARGET" && say "بله" || say "خیر"

/bin/echo -n "→ کانفیگ کامپوننت: "
remote "docker compose exec -T $SERVICE test -f $CONF_TARGET" && say "بله" || say "خیر"

# ---------------------------------------------------------------------------
# ماندگاری — مهم‌ترین چیزی که این اسکریپت باید بگوید
# ---------------------------------------------------------------------------

# هر دو مسیر در ایمیج `VOLUME` اعلام شده‌اند. اگر در compose به مسیر
# میزبان بایند شده باشند، هر چه بنویسیم می‌ماند. اگر نه، داکر ولوم
# ناشناس می‌سازد که `restart` و حتی `up -d` را رد می‌کند ولی
# `--renew-anon-volumes` پاکش می‌کند — همان تله‌ای که یک بار سر
# متغیرهای محیطی خوردیم.
mount_kind() {
  local dest="$1"
  ssh "$SERVER" "docker inspect --format '{{range .Mounts}}{{if eq .Destination \"$dest\"}}{{.Type}} {{.Source}}{{end}}{{end}}' \$(cd $REMOTE_DIR && docker compose ps -q $SERVICE)"
}

PLUGINS_MOUNT="$(mount_kind /prosody-plugins-custom)"
CONFIG_MOUNT="$(mount_kind /config)"

say "→ /prosody-plugins-custom: ${PLUGINS_MOUNT:-بدون ولوم}"
say "→ /config:                 ${CONFIG_MOUNT:-بدون ولوم}"

warn_anonymous() {
  case "$1" in
    bind*) return 0 ;;
    volume*)
      say ""
      say "⚠️  «$2» ولوم ناشناس است، نه بایند به مسیر میزبان."
      say "    یعنی این نصب با «docker compose up -d --renew-anon-volumes» یا"
      say "    «down -v» از بین می‌رود و هیچ خطایی هم نمی‌دهد — فقط حضور"
      say "    دوباره تأییدنشده می‌شود. برای ماندگاری، در compose.yaml بایند کنید."
      ;;
    *) say "⚠️  وضعیت ولوم «$2» تشخیص داده نشد." ;;
  esac
}

if [ "$CHECK_ONLY" = "true" ]; then
  say ""
  say "→ آخرین رویداد رسیده به API:"
  curl -fsS "${API_BASE%/}/health" | grep -o '"classroomHookLastEventAt":[^,}]*' || true
  exit 0
fi

# ---------------------------------------------------------------------------
# نصب
# ---------------------------------------------------------------------------

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

say "→ برداشتن ماژول از خود ایمیج"
# از ایمیج برداشته می‌شود نه از گیتهاب: دسترسی اینترنت این سرور محدود
# است (همان چیزی که کلاینت ACME را هم از کار انداخت) و نسخه‌ی داخل
# ایمیج با همان بیلدی می‌خواند که واقعاً اجرا می‌شود.
remote "docker compose cp $SERVICE:$MODULE_IN_IMAGE /tmp/$MODULE"
remote "docker compose cp /tmp/$MODULE $SERVICE:$MODULE_TARGET"

say "→ نوشتن کانفیگ کامپوننت"
cat > "$TMP/event-sync.cfg.lua" <<LUA
-- هوک حضور — رویدادهای ورود و خروج اتاق را به API پلتفرم می‌فرستد.
--
-- این فایل را اسکریپت scripts/install-jitsi-attendance-hook.sh نوشته
-- است. کانفیگِ ساختهٔ خودِ jitsi (conf.d/jitsi-meet.cfg.lua) هر بار
-- بالا آمدن بازنویسی می‌شود ولی این فایل دست‌نخورده می‌ماند، چون
-- prosody.cfg.lua کل conf.d/*.cfg.lua را Include می‌کند.
Component "esync.$XMPP_DOMAIN" "event_sync_component"
    muc_component = "conference.$XMPP_DOMAIN"

    -- صریح نوشته شده و پیش‌فرضش استفاده نمی‌شود: مقدار پیش‌فرض ماژول
    -- از muc_mapper_domain_base ساخته می‌شود و اگر آن تعریف نشده باشد،
    -- الحاق با nil در همان لحظه‌ی لود ماژول خطا می‌دهد.
    breakout_component = "breakout.$XMPP_DOMAIN"

    api_prefix = "$API_PREFIX"

    -- تنها چیزی که این مسیر را از «هر کسی را حاضر ثبت کن» جدا می‌کند.
    api_headers = {
        ["Authorization"] = "Bearer $SECRET";
    }

    -- API روی هر چیزی جز خطای واقعی ۲۰۰ می‌دهد، پس تلاش مجدد فقط برای
    -- قطعی شبکه و خطای سرور می‌ماند.
    api_retry_count = 5
    api_retry_delay = 2
    api_timeout = 10
LUA

scp -q "$TMP/event-sync.cfg.lua" "$SERVER:/tmp/event-sync.cfg.lua"
remote "docker compose cp /tmp/event-sync.cfg.lua $SERVICE:$CONF_TARGET"

say "→ ری‌استارت prosody"
# `restart` و نه `up -d`: بازسازی کانتینر با ولوم ناشناس یعنی احتمال
# پاک شدن همین چیزی که تازه نوشتیم.
remote "docker compose restart $SERVICE"
sleep 5

# ---------------------------------------------------------------------------
# تأیید
# ---------------------------------------------------------------------------

say "→ لاگ prosody:"
if remote "docker compose logs --since 60s $SERVICE" | grep -i "event_sync\|esync"; then
  :
else
  say "  (چیزی درباره‌ی event_sync در لاگ نبود — پایین را بخوانید)"
fi

warn_anonymous "$PLUGINS_MOUNT" /prosody-plugins-custom
warn_anonymous "$CONFIG_MOUNT" /config

say ""
say "حالا یک کلاس واقعی برگزار کنید و بعد بزنید:"
say "  curl -s ${API_BASE%/}/health | grep classroomHookLastEventAt"
say ""
say "اگر همچنان null بود، به ترتیب:"
say "  ۱. لاگ prosody را ببینید — «API Response code» یعنی رسیده ولی رد شده،"
say "     و نبودن هر پیامی یعنی ماژول اصلاً لود نشده."
say "  ۲. از داخل کانتینر به API برسید:"
say "     ssh $SERVER 'cd $REMOTE_DIR && docker compose exec $SERVICE curl -sS -o /dev/null -w \"%{http_code}\\n\" $API_PREFIX/events/room/created'"
say "     پاسخ ۴۰۱ یعنی مسیر و شبکه سالم‌اند و فقط راز مشترک نرفته."
say "     خطای TLS یعنی گواهی داخل کانتینر شناخته نمی‌شود — گزارش‌شده‌ی"
say "     شناخته‌شده‌ی این ماژول است و راه‌حلش نصب ca-certificates در ایمیج"
say "     یا فرستادن به یک مبدأ داخلی http است."
