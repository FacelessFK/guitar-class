import { SignJWT } from "jose";

/**
 * صدور توکن ورود به سرور جیتسی.
 *
 * سرور با `AUTH_TYPE=jwt`، `ENABLE_GUESTS=0` و `allow_empty_token=false`
 * بالا آمده. یعنی **هیچ‌کس بدون توکنِ امضاشده‌ی همین API وارد هیچ اتاقی
 * نمی‌شود** — نه با حدس زدن نام اتاق، نه با لینکِ لو رفته، نه حتی وقتی
 * اتاق را استاد از قبل باز کرده باشد.
 *
 * توکن به اتاق گره خورده است (`room`)، پس توکنِ کلاسِ دیگر روی این اتاق
 * کار نمی‌کند. با مرورگر واقعی تست شد: پیام «Sorry, you're not allowed
 * to join this call» حتی وقتی امضا معتبر است و اتاق وجود دارد.
 *
 * این ماژول از `token.service.ts` جداست چون کلید و مخاطبش فرق دارد:
 * آن یکی توکن نشستِ خودمان را امضا می‌کند، این یکی توکنی که یک سرویس
 * دیگر آن را بررسی می‌کند.
 */

interface JitsiSettings {
  /** دامنه‌ی عمومی که فرانت IFrame را از آن بار می‌کند */
  domain: string;
  /** ادعای `iss` — با `JWT_ACCEPTED_ISSUERS` روی سرور یکی است */
  appId: string;
  /** ادعای `aud` — با `JWT_ACCEPTED_AUDIENCES` روی سرور یکی است */
  audience: string;
  /** ادعای `sub` */
  xmppDomain: string;
  secret: Uint8Array;
}

/**
 * تنظیمات از محیط، در هر بار صدا زدن.
 *
 * عمداً کش نمی‌شود تا تست بتواند مقدارها را جایگزین کند، و بالا آمدن
 * برنامه به وجود این متغیرها گره نخورد — همان کاری که
 * `token.service.ts` با `JWT_SECRET` می‌کند.
 *
 * پیش‌فرض‌ها با نصب واقعی هماهنگ‌اند تا `.env` ناقص به توکنی منجر نشود
 * که جیتسی بی‌توضیح ردش می‌کند. کلید مشترک پیش‌فرض ندارد: توکنِ بدون
 * کلید درست، هیچ ارزشی جز یک خطای گیج‌کننده در مرورگر کاربر ندارد.
 */
function jitsiSettings(): JitsiSettings {
  const domain = process.env.JITSI_DOMAIN;
  const secret = process.env.JITSI_APP_SECRET;

  if (!domain) {
    throw new Error("JITSI_DOMAIN تعریف نشده است. به `.env.example` نگاه کنید.");
  }

  if (!secret) {
    throw new Error(
      "JITSI_APP_SECRET تعریف نشده است. مقدار واقعی روی سرور جیتسی در " +
        "/home/fardin/music-platform/jitsi/.env با نام JWT_APP_SECRET است.",
    );
  }

  return {
    domain,
    appId: process.env.JITSI_APP_ID ?? "music-platform",
    audience: process.env.JITSI_AUDIENCE ?? "jitsi",
    /**
     * ⚠️ دامنه‌ی **XMPP داخلی**، نه دامنه‌ی عمومی.
     *
     * با نصب داکری، دامنه‌ی عمومی مال nginx است و prosody هرگز آن را
     * نمی‌بیند. توکنی که `class.hyggemode.com` را در `sub` بگذارد رد
     * می‌شود. نسخه‌ی اول سند معماری همین را اشتباه نوشته بود.
     */
    xmppDomain: process.env.JITSI_XMPP_DOMAIN ?? "meet.jitsi",
    secret: new TextEncoder().encode(secret),
  };
}

/** دامنه‌ی عمومی جیتسی — فرانت برای ساخت IFrame لازمش دارد. */
export function jitsiDomain(): string {
  return jitsiSettings().domain;
}

export interface RoomTokenInput {
  /** `bookings.room_id` — uuid غیرقابل حدس */
  roomId: string;
  userId: string;
  displayName: string;
  avatarUrl?: string | null;
  /** فقط استاد. مدیر جلسه می‌تواند اخراج و قفل کند. */
  moderator: boolean;
  /** `nbf` — پیش از این لحظه توکن هنوز معتبر نیست */
  notBefore: Date;
  /** `exp` */
  expiresAt: Date;
}

const toSeconds = (date: Date): number => Math.floor(date.getTime() / 1000);

/**
 * توکن ورود به یک اتاق مشخص.
 *
 * `nbf` و `exp` تکرارِ همان بررسی‌ای هستند که سرویس پیش از صدور انجام
 * می‌دهد، ولی لازم‌اند: توکن یک بار صادر می‌شود و ممکن است ساعت‌ها بعد
 * استفاده شود. بدون `exp`، توکنِ جلسه‌ی امروز کلید همیشگی همان اتاق
 * می‌شد.
 */
export async function signRoomToken(input: RoomTokenInput): Promise<string> {
  const settings = jitsiSettings();

  return new SignJWT({
    room: input.roomId,
    context: {
      user: {
        id: input.userId,
        name: input.displayName,
        ...(input.avatarUrl ? { avatar: input.avatarUrl } : {}),
        /**
         * prosody این را به صورت **رشته** می‌خواند نه بولین، و کلید
         * نبودنش یعنی شرکت‌کننده‌ی عادی. با مرورگر واقعی تست شد.
         */
        ...(input.moderator ? { moderator: "true" } : {}),
      },
    },
  })
    /**
     * ⚠️ `typ` اجباری است.
     *
     * `jose` به‌صورت پیش‌فرض این کلید را در هدر نمی‌گذارد، ولی prosody
     * صریح بررسی‌اش می‌کند و بدون آن توکن را رد می‌کند:
     * `Error verifying token err:not-allowed, reason:Invalid typ`.
     * در مرورگر فقط «Sorry, you're not allowed to join this call»
     * دیده می‌شود — همان پیامی که برای اتاقِ اشتباه هم می‌آید، پس بدون
     * نگاه کردن به لاگ prosody گمراه‌کننده است.
     */
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer(settings.appId)
    .setAudience(settings.audience)
    .setSubject(settings.xmppDomain)
    .setIssuedAt()
    .setNotBefore(toSeconds(input.notBefore))
    .setExpirationTime(toSeconds(input.expiresAt))
    .sign(settings.secret);
}
