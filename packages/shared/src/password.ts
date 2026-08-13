/**
 * قاعده‌ی رمز عبور.
 *
 * اینجاست و نه در سرویس نست، چون **هر دو طرف باید یک چیز بگویند**:
 * فرم ثبت‌نام باید پیش از فرستادن، همان رمزی را رد کند که API رد
 * می‌کند. اگر دو تعریف جدا داشته باشند، کاربر رمزی می‌سازد که فرم
 * قبولش کرده و سرور پس می‌زند — و پیام خطا هم چیزی است که فرم هیچ‌وقت
 * نشانش نداده بود.
 *
 * سیاست عمداً «حداقل طول» است و نه «یک عدد و یک حرف بزرگ و یک نماد».
 * قواعد ترکیبی، رمزهای کوتاهِ قابل‌حدس می‌سازند (`Passw0rd!`) و
 * راهنمای امروزِ NIST هم همان طول را توصیه می‌کند. آنچه واقعاً جلوی
 * حدس زدن را می‌گیرد، محدودیت تعداد تلاش در سمت سرور است.
 */

export const PASSWORD_POLICY = {
  MIN_LENGTH: 8,
  /**
   * سقف دارد چون تابع هش روی ورودی بلند وقت می‌برد و یک رمزِ چندمگابایتی
   * راهِ ساده‌ای برای مشغول کردن سرور است.
   */
  MAX_LENGTH: 200,
} as const;

export type PasswordProblem = "TOO_SHORT" | "TOO_LONG" | "EMPTY";

/**
 * مشکل رمز، یا `null` اگر سالم باشد.
 *
 * فاصله‌ی ابتدا و انتها **حذف نمی‌شود**: رمز هرچه کاربر تایپ کرده همان
 * است. حذف فاصله یعنی رمزی که کاربر ساخته با رمزی که ذخیره شده فرق
 * کند و ورودِ بعدی بی‌دلیل شکست بخورد.
 */
export function checkPassword(password: string): PasswordProblem | null {
  if (password.length === 0) return "EMPTY";
  if (password.length < PASSWORD_POLICY.MIN_LENGTH) return "TOO_SHORT";
  if (password.length > PASSWORD_POLICY.MAX_LENGTH) return "TOO_LONG";
  return null;
}

export const PASSWORD_PROBLEM_MESSAGES: Record<PasswordProblem, string> = {
  EMPTY: "رمز عبور لازم است.",
  TOO_SHORT: `رمز عبور باید حداقل ${PASSWORD_POLICY.MIN_LENGTH} کاراکتر باشد.`,
  TOO_LONG: `رمز عبور نباید از ${PASSWORD_POLICY.MAX_LENGTH} کاراکتر بیشتر باشد.`,
};

export function passwordProblemMessage(password: string): string | null {
  const problem = checkPassword(password);
  return problem ? PASSWORD_PROBLEM_MESSAGES[problem] : null;
}
