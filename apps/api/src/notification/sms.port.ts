import { Logger } from "@nestjs/common";
import { maskPhone, toLocalPhone, type NormalizedPhone } from "@music/shared";

/**
 * پورت ارسال پیامک.
 *
 * پشت یک واسط است تا تا وقتی حساب پنل پیامک آماده نیست، بقیه‌ی سیستم
 * ساخته و تست شود. وقتی حساب آمد فقط یک کلاس اضافه می‌شود و هیچ کد
 * دیگری دست نمی‌خورد.
 */
export interface SmsSender {
  sendOtp(phone: NormalizedPhone, code: string): Promise<void>;
  /**
   * پیام آزاد — یادآوری جلسه، اطلاع لغو.
   *
   * از `sendOtp` جداست چون در ایران کد ورود از الگوی تأییدشده‌ی «لوکاپ»
   * می‌رود و پیام آزاد از خط خدماتی. یک متد برای هر دو، در آداپتور
   * واقعی به یک شرط روی محتوای پیام تبدیل می‌شد.
   */
  sendText(phone: NormalizedPhone, text: string): Promise<void>;
}

/**
 * آداپتور توسعه: کد را در کنسول چاپ می‌کند.
 *
 * عمداً پر سر و صداست تا در لاگ گم نشود و بشود هنگام توسعه کد را
 * برداشت. در محیط تولید هرگز نباید انتخاب شود — کارخانه‌ی زیر این را
 * تضمین می‌کند.
 */
export class ConsoleSmsSender implements SmsSender {
  private readonly logger = new Logger("SMS");

  async sendOtp(phone: NormalizedPhone, code: string): Promise<void> {
    this.logger.warn(
      `\n${"═".repeat(46)}\n  کد ورود برای ${toLocalPhone(phone)}\n  ${code}\n${"═".repeat(46)}`,
    );
  }

  async sendText(phone: NormalizedPhone, text: string): Promise<void> {
    this.logger.warn(
      `\n${"─".repeat(46)}\n  پیامک به ${toLocalPhone(phone)}\n  ${text}\n${"─".repeat(46)}`,
    );
  }
}

/**
 * آداپتور کاوه‌نگار.
 *
 * ⚠️ هنوز پیاده نشده — منتظر حساب و کلید API.
 * وقتی آماده شد، درخواست به الگوی «لوکاپ» ارسال می‌شود (نه پیام آزاد)،
 * چون پیامک تبلیغاتی/آزاد برای کد ورود در ایران محدودیت دارد و
 * الگوی تأییدشده سریع‌تر و مطمئن‌تر تحویل می‌شود.
 */
export class KavenegarSmsSender implements SmsSender {
  constructor(
    private readonly apiKey: string,
    private readonly template: string,
  ) {}

  async sendOtp(phone: NormalizedPhone, code: string): Promise<void> {
    void code;
    throw new Error(
      `ارسال پیامک به ${maskPhone(phone)} با الگوی «${this.template}» هنوز پیاده نشده است.`,
    );
  }

  async sendText(phone: NormalizedPhone, text: string): Promise<void> {
    void text;
    throw new Error(`ارسال پیامک آزاد به ${maskPhone(phone)} هنوز پیاده نشده است.`);
  }
}

/**
 * فرستنده‌ی پیامک را از روی محیط انتخاب می‌کند.
 *
 * اگر در تولید کلید تعریف نشده باشد، عمداً بالا نمی‌آید. سکوت کردن و
 * برگشتن به آداپتور کنسول یعنی کد ورود همه‌ی کاربران در لاگ سرور
 * بنویسد و ورود عملاً باز شود.
 */
export function createSmsSender(): SmsSender {
  const apiKey = process.env.SMS_API_KEY;
  const template = process.env.SMS_OTP_TEMPLATE ?? "verify";
  const isProduction = process.env.NODE_ENV === "production";

  if (apiKey) {
    return new KavenegarSmsSender(apiKey, template);
  }

  if (isProduction) {
    throw new Error(
      "SMS_API_KEY در محیط تولید تعریف نشده است. آداپتور کنسول کد ورود را در لاگ می‌نویسد و نباید در تولید استفاده شود.",
    );
  }

  return new ConsoleSmsSender();
}

let sender: SmsSender | undefined;

/**
 * فرستنده‌ی مشترک پروسه.
 *
 * کنترلر احراز هویت فرستنده‌اش را از تزریق وابستگی نست می‌گیرد، ولی
 * وُرکر پروسه‌ی جدایی است و نستی ندارد. این تابع همان نقش را برای
 * جاب‌های پس‌زمینه بازی می‌کند — دقیقاً مثل `paymentGateway()`.
 */
export function smsSender(): SmsSender {
  sender ??= createSmsSender();
  return sender;
}

/** فقط برای تست: فرستنده را عوض می‌کند. */
export function setSmsSender(replacement: SmsSender): void {
  sender = replacement;
}
