import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from "node:crypto";
import { promisify } from "node:util";

/**
 * هش رمز عبور.
 *
 * **scrypt از `node:crypto`** و نه bcrypt/argon2 — با اینکه آن دو
 * متداول‌ترند. دلیلش وابستگی نیتیو است: سرور این پروژه به رجیستری npm
 * دسترسی ندارد و ایمیج روی ماشین توسعه ساخته می‌شود، پس هر پکیجی که
 * موقع نصب کامپایل می‌شود یک شکستِ ممکن اضافه می‌کند که ربطی به رمز
 * عبور ندارد. scrypt خودش در استاندارد نود است، همان خانواده‌ی
 * «کندِ حافظه‌خواه» است و برای این کار کافی است.
 *
 * قالب ذخیره‌شده خودتوصیف است:
 *
 *   scrypt$<N>$<r>$<p>$<salt base64>$<hash base64>
 *
 * پارامترها **داخل خود رشته‌اند** و از کد خوانده نمی‌شوند. اگر فردا
 * سخت‌تر شوند، رمزهای قدیمی همچنان با پارامترهای خودشان بررسی می‌شوند
 * و کسی از حسابش بیرون نمی‌افتد. نسخه‌بندی جدا هم لازم نیست: پیشوند
 * `scrypt` همان نقش را دارد و روزی که الگوریتم عوض شود، پیشوند تازه
 * کنار همین یکی می‌نشیند.
 */

/**
 * امضای صریح لازم است: `promisify` سربارگذاری‌ی بدون `options` را
 * انتخاب می‌کند و پارامترهای scrypt دقیقاً همان‌جا می‌روند.
 */
const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: ScryptOptions,
) => Promise<Buffer>;

/**
 * پارامترهای امروز.
 *
 * `N=2^15` حدود ۳۲ مگابایت حافظه و چند ده میلی‌ثانیه CPU می‌خواهد —
 * برای ورودِ کاربر بی‌اثر است و برای کسی که میلیون‌ها حدس می‌زند گران.
 *
 * ⚠️ نود پیش‌فرض `maxmem` دارد (۳۲ مگابایت) و `N` بزرگ‌تر بدون بالا
 * بردن آن با خطای «memory limit exceeded» می‌شکند — نه با کندی. برای
 * همین `maxmem` صریح داده می‌شود.
 */
const CURRENT = { N: 2 ** 15, r: 8, p: 1 } as const;
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;

const maxmemFor = (N: number, r: number): number => 256 * N * r * 2;

async function derive(
  password: string,
  salt: Buffer,
  params: { N: number; r: number; p: number },
): Promise<Buffer> {
  return scryptAsync(password, salt, KEY_LENGTH, {
    N: params.N,
    r: params.r,
    p: params.p,
    maxmem: maxmemFor(params.N, params.r),
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const hash = await derive(password, salt, CURRENT);

  return [
    "scrypt",
    CURRENT.N,
    CURRENT.r,
    CURRENT.p,
    salt.toString("base64"),
    hash.toString("base64"),
  ].join("$");
}

/**
 * بررسی رمز در برابر هش ذخیره‌شده.
 *
 * هر شکلِ خرابیِ ورودی — قالب ناشناس، عدد نامعتبر، طول نادرست — به
 * `false` تبدیل می‌شود و پرتاب نمی‌کند. یک سطر خرابِ دیتابیس نباید
 * اندپوینت ورود را با خطای ۵۰۰ بشکند؛ باید فقط یعنی «این رمز درست
 * نیست».
 */
export async function verifyPassword(
  password: string,
  stored: string | null,
): Promise<boolean> {
  if (!stored) return false;

  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;

  const N = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);

  if (!Number.isSafeInteger(N) || !Number.isSafeInteger(r) || !Number.isSafeInteger(p)) {
    return false;
  }

  // `N` باید توانی از دو باشد وگرنه خودِ scrypt پرتاب می‌کند. سقف هم
  // لازم است: یک `N` بزرگِ دستکاری‌شده در دیتابیس یعنی هر تلاش ورود،
  // گیگابایت‌ها حافظه بخواهد.
  if (N < 2 || N > 2 ** 20 || (N & (N - 1)) !== 0) return false;
  if (r < 1 || r > 32 || p < 1 || p > 16) return false;

  let salt: Buffer;
  let expected: Buffer;

  try {
    salt = Buffer.from(parts[4]!, "base64");
    expected = Buffer.from(parts[5]!, "base64");
  } catch {
    return false;
  }

  if (salt.length === 0 || expected.length !== KEY_LENGTH) return false;

  let actual: Buffer;

  try {
    actual = await derive(password, salt, { N, r, p });
  } catch {
    return false;
  }

  // مقایسه‌ی زمان‌ثابت. مقایسه‌ی معمولی روی اولین بایتِ متفاوت
  // برمی‌گردد و همان تفاوتِ زمانی، بایت‌به‌بایت لو می‌دهد.
  return timingSafeEqual(actual, expected);
}

/**
 * کاری با همان هزینه‌ی بررسی واقعی، برای وقتی که کاربر اصلاً وجود ندارد.
 *
 * بدون این، پاسخِ «شماره ثبت نشده» خیلی زودتر از «رمز غلط» برمی‌گردد و
 * همان اختلاف زمان می‌گوید کدام شماره‌ها در پلتفرم حساب دارند — همان
 * چیزی که مسیر کد پیامکی با دقت پنهانش می‌کند.
 */
export async function burnPasswordTime(password: string): Promise<void> {
  await derive(password, randomBytes(SALT_LENGTH), CURRENT);
}
