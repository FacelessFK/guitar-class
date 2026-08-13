import { eq } from "drizzle-orm";
import { checkPassword, normalizePhone, type NormalizedPhone } from "@music/shared";

import { db } from "../db/client.js";
import { users } from "../db/schema/index.js";
import { OTP_CONFIG, consumeOtp, requestOtp, verifyOtp } from "./otp.service.js";
import { burnPasswordTime, hashPassword, verifyPassword } from "./password.js";
import {
  checkLoginAllowed,
  clearLoginAttempts,
  recordFailedLogin,
} from "./password-attempts.js";
import { issueAccessToken, issueRefreshToken, rotateRefreshToken } from "./token.service.js";
import { devLoginCodeEnabled } from "../config/env.js";
import type { SmsSender } from "../notification/sms.port.js";

export class AuthError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export interface RequestCodeResult {
  /** فاصله‌ی لازم تا امکان درخواست دوباره — فرانت شمارش معکوس نشان می‌دهد */
  retryAfterSeconds: number;
  /**
   * کد ورود در پاسخ.
   *
   * فقط وقتی پر می‌شود که `ALLOW_DEV_LOGIN_CODE=true` **صریحاً** تنظیم
   * شده باشد. تفصیلش در `config/env.ts` است؛ خلاصه‌اش این است که شرط
   * قبلی (`NODE_ENV !== "production"`) پیش‌فرضش باز بود و یک متغیر
   * فراموش‌شده در استقرار، این اندپوینتِ عمومی را به راه ورود به هر
   * حسابی — از جمله ادمین — تبدیل می‌کرد.
   */
  devCode?: string;
}

/**
 * درخواست کد ورود.
 *
 * پاسخ عمداً نمی‌گوید کاربر از قبل وجود دارد یا نه. افشای این موضوع
 * یعنی هر کسی می‌تواند با پیمایش شماره‌ها بفهمد چه کسانی در پلتفرم
 * ثبت‌نام کرده‌اند.
 */
export async function requestLoginCode(
  rawPhone: string,
  sms: SmsSender,
): Promise<RequestCodeResult> {
  const phone = normalizePhone(rawPhone);

  if (!phone) {
    throw new AuthError("شماره‌ی موبایل معتبر نیست.", "INVALID_PHONE");
  }

  const outcome = await requestOtp(phone);

  if (!outcome.ok) {
    const message =
      outcome.reason === "COOLDOWN"
        ? `برای درخواست کد جدید ${outcome.retryAfterSeconds} ثانیه صبر کنید.`
        : "تعداد درخواست‌های شما بیش از حد مجاز است. کمی بعد دوباره تلاش کنید.";

    throw new AuthError(message, outcome.reason, outcome.retryAfterSeconds);
  }

  await sms.sendOtp(phone, outcome.code);

  return {
    retryAfterSeconds: outcome.retryAfterSeconds,
    // با پرچم صریح، کد در پاسخ هم می‌آید تا کار با API بدون خواندن لاگ
    // ممکن باشد. بدون پرچم — که پیش‌فرض است — نمی‌آید.
    devCode: devLoginCodeEnabled() ? outcome.code : undefined,
  };
}

export interface LoginResult {
  accessToken: string;
  refreshToken: string;
  /** برای عمر کوکی — کنترلر توکن را در `Set-Cookie` می‌نشاند */
  refreshExpiresAt: Date;
  expiresIn: number;
  user: {
    id: string;
    phone: string;
    fullName: string;
    isAdmin: boolean;
    isNewUser: boolean;
  };
}

export interface VerifyCodeInput {
  phone: string;
  code: string;
  /** برای کاربر تازه لازم است */
  fullName?: string;
  userAgent?: string;
}

/**
 * بررسی کد و ورود.
 *
 * ثبت‌نام و ورود یک مسیرند: اگر شماره تازه باشد کاربر ساخته می‌شود.
 * فرم جداگانه‌ی ثبت‌نام حذف می‌شود و اصطکاک کمتر می‌شود.
 */
export async function verifyLoginCode(input: VerifyCodeInput): Promise<LoginResult> {
  const phone = normalizePhone(input.phone);

  if (!phone) {
    throw new AuthError("شماره‌ی موبایل معتبر نیست.", "INVALID_PHONE");
  }

  /**
   * کد اینجا **مصرف نمی‌شود.**
   *
   * برای کاربر تازه، «نام لازم است» تازه بعد از این نقطه معلوم می‌شود
   * و اگر کد همین‌جا سوزانده می‌شد، اولین تلاشِ هر کاربر جدید به یک
   * بن‌بست شصت‌ثانیه‌ای می‌خورد: کد باطل، cooldown فعال، و پیامی که
   * می‌گوید نامت را بده ولی راهی برای دادنش نیست.
   *
   * شمارنده‌ی تلاش همچنان بالا می‌رود، پس کد همچنان در برابر حدس زدن
   * محافظت است؛ فقط سوزاندنش به لحظه‌ای موکول می‌شود که ورود واقعاً
   * قطعی شده.
   */
  const outcome = await verifyOtp(phone, input.code, { consume: false });

  if (!outcome.ok) {
    if (outcome.reason === "NO_CODE") {
      throw new AuthError(
        "کدی برای این شماره فعال نیست. دوباره درخواست کد بدهید.",
        "NO_ACTIVE_CODE",
      );
    }
    if (outcome.reason === "TOO_MANY_ATTEMPTS") {
      throw new AuthError(
        "تعداد تلاش‌های نادرست بیش از حد بود. کد باطل شد؛ کد جدید بگیرید.",
        "TOO_MANY_ATTEMPTS",
      );
    }
    throw new AuthError(
      `کد وارد شده درست نیست. ${outcome.attemptsLeft} تلاش باقی مانده است.`,
      "INVALID_CODE",
    );
  }

  const { user, isNewUser } = await findOrCreateUser(phone, input.fullName);

  // از اینجا حساب قطعاً وجود دارد و کد کارش را کرده؛ سوزاندنش تا
  // اینجا عقب افتاده بود تا نبودِ نام، کد را هدر ندهد
  await consumeOtp(phone);

  if (user.status === "SUSPENDED") {
    throw new AuthError("حساب شما مسدود شده است.", "ACCOUNT_SUSPENDED");
  }

  const accessToken = await issueAccessToken({
    userId: user.id,
    isAdmin: user.isAdmin,
  });
  const refresh = await issueRefreshToken(user.id, input.userAgent);

  return {
    accessToken,
    refreshToken: refresh.token,
    refreshExpiresAt: refresh.expiresAt,
    expiresIn: 15 * 60,
    user: {
      id: user.id,
      phone: user.phone,
      fullName: user.fullName,
      isAdmin: user.isAdmin,
      isNewUser,
    },
  };
}

async function findOrCreateUser(phone: NormalizedPhone, fullName?: string) {
  const [existing] = await db
    .select({
      id: users.id,
      phone: users.phone,
      fullName: users.fullName,
      isAdmin: users.isAdmin,
      status: users.status,
    })
    .from(users)
    .where(eq(users.phone, phone))
    .limit(1);

  if (existing) {
    return { user: existing, isNewUser: false };
  }

  if (!fullName || fullName.trim().length < 2) {
    throw new AuthError(
      "برای ساخت حساب، نام و نام خانوادگی لازم است.",
      "FULL_NAME_REQUIRED",
    );
  }

  // `onConflictDoUpdate` روی شماره، مسابقه‌ی دو درخواست هم‌زمان برای
  // یک شماره‌ی تازه را بی‌خطر می‌کند: هر دو به یک کاربر می‌رسند
  const [created] = await db
    .insert(users)
    .values({ phone, fullName: fullName.trim() })
    .onConflictDoUpdate({
      target: users.phone,
      set: { updatedAt: new Date() },
    })
    .returning({
      id: users.id,
      phone: users.phone,
      fullName: users.fullName,
      isAdmin: users.isAdmin,
      status: users.status,
    });

  if (!created) {
    throw new AuthError("ساخت حساب ناموفق بود.", "USER_CREATION_FAILED");
  }

  return { user: created, isNewUser: true };
}

export async function refreshSession(
  refreshToken: string,
  userAgent?: string,
): Promise<LoginResult> {
  const rotated = await rotateRefreshToken(refreshToken, userAgent);

  if (!rotated) {
    throw new AuthError(
      "نشست شما منقضی شده است. دوباره وارد شوید.",
      "INVALID_REFRESH_TOKEN",
    );
  }

  const [user] = await db
    .select({
      id: users.id,
      phone: users.phone,
      fullName: users.fullName,
      isAdmin: users.isAdmin,
      status: users.status,
    })
    .from(users)
    .where(eq(users.id, rotated.userId))
    .limit(1);

  if (!user || user.status === "SUSPENDED") {
    throw new AuthError("حساب شما در دسترس نیست.", "ACCOUNT_UNAVAILABLE");
  }

  const accessToken = await issueAccessToken({
    userId: user.id,
    isAdmin: user.isAdmin,
  });

  return {
    accessToken,
    refreshToken: rotated.refreshToken,
    refreshExpiresAt: rotated.refreshExpiresAt,
    expiresIn: 15 * 60,
    user: {
      id: user.id,
      phone: user.phone,
      fullName: user.fullName,
      isAdmin: user.isAdmin,
      isNewUser: false,
    },
  };
}

// ---------------------------------------------------------------------------
// ورود با رمز عبور
// ---------------------------------------------------------------------------

export interface RegisterInput {
  phone: string;
  fullName: string;
  password: string;
  userAgent?: string;
}

/**
 * ساخت حساب با رمز عبور.
 *
 * راه دوم است، نه جایگزین: مسیر کد پیامکی سر جایش می‌ماند و حسابی که
 * از آنجا ساخته شده رمز ندارد. این مسیر برای وقتی است که پیامک در
 * دسترس نیست.
 *
 * ⚠️ **این اندپوینت، برخلاف مسیر کد پیامکی، شماره را تأیید نمی‌کند.**
 * یعنی کسی می‌تواند با شماره‌ای که مال خودش نیست حساب بسازد. تا وقتی
 * تنها اثرش «یک حساب با نام و رمز» است اشکالی ندارد، ولی اگر روزی
 * چیزی به مالکیتِ شماره گره خورد — بازیابی رمز با پیامک، یا اعتماد به
 * شماره برای تماس — این فرض باید دوباره بررسی شود.
 */
export async function registerWithPassword(input: RegisterInput): Promise<LoginResult> {
  const phone = normalizePhone(input.phone);

  if (!phone) {
    throw new AuthError("شماره‌ی موبایل معتبر نیست.", "INVALID_PHONE");
  }

  if (checkPassword(input.password)) {
    // متن دقیق را فرانت از همان تابع مشترک می‌سازد؛ اینجا فقط نباید
    // یک رمز نامعتبر ذخیره شود.
    throw new AuthError("رمز عبور شرایط لازم را ندارد.", "WEAK_PASSWORD");
  }

  const fullName = input.fullName.trim();

  if (fullName.length < 2) {
    throw new AuthError("نام و نام خانوادگی لازم است.", "FULL_NAME_REQUIRED");
  }

  const passwordHash = await hashPassword(input.password);

  /**
   * درج با `onConflictDoNothing` و بعد بررسی نتیجه.
   *
   * «اول ببین هست، بعد بساز» با دو درخواست هم‌زمان دو حساب می‌سازد یا
   * با خطای قید یکتایی می‌شکند. اینجا دیتابیس تصمیم می‌گیرد: آرایه‌ی
   * خالی یعنی شماره از قبل بوده.
   */
  const [created] = await db
    .insert(users)
    .values({ phone, fullName, passwordHash })
    .onConflictDoNothing({ target: users.phone })
    .returning({
      id: users.id,
      phone: users.phone,
      fullName: users.fullName,
      isAdmin: users.isAdmin,
      status: users.status,
    });

  if (!created) {
    /**
     * شماره از قبل حساب دارد.
     *
     * رمزِ حسابِ موجود **جایگزین نمی‌شود** — وگرنه هر کسی با دانستن
     * شماره‌ی یک نفر می‌توانست از راه فرم ثبت‌نام رمزش را عوض کند و
     * حسابش را بگیرد. تغییر رمز کارِ کسی است که قبلاً وارد شده.
     */
    throw new AuthError(
      "این شماره از قبل حساب دارد. وارد شوید.",
      "PHONE_ALREADY_REGISTERED",
    );
  }

  const accessToken = await issueAccessToken({
    userId: created.id,
    isAdmin: created.isAdmin,
  });
  const refresh = await issueRefreshToken(created.id, input.userAgent);

  return {
    accessToken,
    refreshToken: refresh.token,
    refreshExpiresAt: refresh.expiresAt,
    expiresIn: 15 * 60,
    user: {
      id: created.id,
      phone: created.phone,
      fullName: created.fullName,
      isAdmin: created.isAdmin,
      isNewUser: true,
    },
  };
}

export interface PasswordLoginInput {
  phone: string;
  password: string;
  userAgent?: string;
}

/**
 * ورود با رمز عبور.
 *
 * سه حالتِ «شماره نامعتبر»، «حسابی با این شماره نیست»، «رمز غلط» و
 * «این حساب رمز ندارد» همگی **یک پیام** می‌گیرند. تفکیکشان یعنی هر
 * کسی بتواند با پیمایش شماره‌ها فهرست کاربران را بسازد — همان چیزی که
 * مسیر کد پیامکی با دقت پنهانش می‌کند.
 *
 * زمان پاسخ هم نباید تفکیک کند، برای همین وقتی حسابی پیدا نشد،
 * `burnPasswordTime` همان محاسبه‌ی سنگین را انجام می‌دهد.
 */
export async function loginWithPassword(
  input: PasswordLoginInput,
): Promise<LoginResult> {
  const phone = normalizePhone(input.phone);
  const wrongCredentials = new AuthError(
    "شماره یا رمز عبور درست نیست.",
    "INVALID_CREDENTIALS",
  );

  if (!phone) {
    await burnPasswordTime(input.password);
    throw wrongCredentials;
  }

  const gate = await checkLoginAllowed(phone);

  if (!gate.ok) {
    throw new AuthError(
      "تلاش‌های ناموفق زیاد بود. کمی بعد دوباره امتحان کنید یا با کد پیامکی وارد شوید.",
      "TOO_MANY_ATTEMPTS",
      gate.retryAfterSeconds,
    );
  }

  const [user] = await db
    .select({
      id: users.id,
      phone: users.phone,
      fullName: users.fullName,
      isAdmin: users.isAdmin,
      status: users.status,
      passwordHash: users.passwordHash,
    })
    .from(users)
    .where(eq(users.phone, phone))
    .limit(1);

  if (!user) {
    await burnPasswordTime(input.password);
    await recordFailedLogin(phone);
    throw wrongCredentials;
  }

  if (!(await verifyPassword(input.password, user.passwordHash))) {
    await recordFailedLogin(phone);
    throw wrongCredentials;
  }

  // مسدود بودن **بعد** از بررسی رمز گفته می‌شود. اگر پیش از آن بود،
  // یک پیام متفاوت به هر کسی می‌گفت این شماره حساب دارد.
  if (user.status === "SUSPENDED") {
    throw new AuthError("حساب شما مسدود شده است.", "ACCOUNT_SUSPENDED");
  }

  await clearLoginAttempts(phone);

  const accessToken = await issueAccessToken({
    userId: user.id,
    isAdmin: user.isAdmin,
  });
  const refresh = await issueRefreshToken(user.id, input.userAgent);

  return {
    accessToken,
    refreshToken: refresh.token,
    refreshExpiresAt: refresh.expiresAt,
    expiresIn: 15 * 60,
    user: {
      id: user.id,
      phone: user.phone,
      fullName: user.fullName,
      isAdmin: user.isAdmin,
      isNewUser: false,
    },
  };
}

export { OTP_CONFIG };
