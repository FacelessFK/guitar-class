import { Logger } from "@nestjs/common";
import { maskPhone, toLocalPhone, type NormalizedPhone } from "@music/shared";

import { isProduction } from "../config/env.js";

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

// ---------------------------------------------------------------------------
// آداپتور واقعی — کاوه‌نگار
// ---------------------------------------------------------------------------

const KAVENEGAR_BASE = "https://api.kavenegar.com/v1";

/**
 * مهلت پاسخ.
 *
 * کوتاه‌تر از مهلت درگاه پرداخت (۲۰ ثانیه) عمدی است: کاربر پشت فرم ورود
 * منتظر همین درخواست است و بیست ثانیه انتظار، از خطا هم بدتر است.
 * کاوه‌نگار معمولاً زیر یک ثانیه پاسخ می‌دهد؛ ده ثانیه یعنی «قطعاً
 * مشکلی هست».
 */
const REQUEST_TIMEOUT_MS = 10_000;

/**
 * پاسخ کاوه‌نگار.
 *
 * `return` وضعیت خودِ درخواست است و `entries` وضعیت تک‌تک پیام‌ها.
 * برای «آیا پذیرفته شد؟» فقط `return.status` معتبر است.
 */
interface KavenegarEnvelope {
  return?: { status?: number; message?: string };
  entries?: Array<{ messageid?: number; status?: number; statustext?: string }> | null;
}

/**
 * کدهای خطایی که واقعاً پیش می‌آیند، با کاری که باید کرد.
 *
 * پیام خودِ کاوه‌نگار («عملیات ناموفق») به کسی نمی‌گوید چه چیزی را درست
 * کند. این جدول همان لحظه‌ی نیمه‌شبی را هدف گرفته که ورود کاربران کار
 * نمی‌کند و کسی باید از روی لاگ بفهمد چرا — و پرتکرارترین علتش، ۴۱۸،
 * هیچ ربطی به کد ندارد.
 */
const ERROR_HINTS: Readonly<Record<number, string>> = {
  400: "پارامترهای درخواست ناقص‌اند.",
  401: "حساب کاوه‌نگار غیرفعال است.",
  403: "کلید API نامعتبر است — SMS_API_KEY را بررسی کنید.",
  407: "دسترسی به این متد برای حساب فعال نیست.",
  411: "شماره‌ی گیرنده از نظر کاوه‌نگار نامعتبر است.",
  412: "خط فرستنده نامعتبر است — SMS_SENDER را بررسی کنید.",
  414: "حجم درخواست بیش از حد مجاز است.",
  418: "اعتبار حساب کاوه‌نگار کافی نیست. ← شارژ کنید؛ هیچ پیامکی ارسال نمی‌شود.",
  424: "الگوی لوکاپ پیدا نشد — SMS_OTP_TEMPLATE باید دقیقاً نام الگوی تأییدشده در پنل باشد.",
  426: "این متد خط خدماتی می‌خواهد.",
  431: "ساختار کد نادرست است.",
  432: "پارامتر کد در الگو پیدا نشد.",
};

/**
 * آداپتور کاوه‌نگار.
 *
 * دو مسیر جدا، چون در ایران یک مسیر برای هر دو کار نمی‌کند:
 *
 *   • **کد ورود** از `verify/lookup` می‌رود، یعنی الگوی از پیش
 *     تأییدشده. متن آزاد برای OTP عملاً کار نمی‌کند — فیلتر می‌شود یا
 *     با تأخیر می‌رسد، و کد ورودی که دیر برسد یعنی کاربری که وارد
 *     نمی‌شود.
 *   • **یادآوری** از `sms/send` می‌رود چون متنش پویاست و در قالب
 *     لوکاپ نمی‌نشیند.
 *
 * ⚠️ **هنوز روی حساب واقعی اجرا نشده** — کلید نداریم. آنچه بدون حساب
 * قابل تأیید نیست و باید با اولین ارسال واقعی بررسی شود:
 *
 *   ۱. **نام الگو.** `SMS_OTP_TEMPLATE` باید دقیقاً همان چیزی باشد که
 *      در پنل تأیید شده. اشتباهش خطای ۴۲۴ می‌دهد که این کلاس صریح
 *      ترجمه‌اش می‌کند.
 *   ۲. **خط خدماتی برای `sms/send`.** بدون خط تأییدشده، یادآوری‌ها
 *      خطای ۴۲۶ می‌گیرند در حالی که کد ورود سالم کار می‌کند — یعنی
 *      نیمی از سیستم بی‌صدا خراب است. جاروی یادآوری این خطا را روی
 *      سطر می‌نویسد و در لاگ می‌آورد، پس دیده می‌شود.
 */
export class KavenegarSmsSender implements SmsSender {
  private readonly logger = new Logger("SMS");

  constructor(
    private readonly apiKey: string,
    private readonly template: string,
    /** خط فرستنده برای پیام آزاد؛ خالی یعنی خط پیش‌فرض حساب */
    private readonly sender?: string,
  ) {}

  /**
   * درخواست با **POST** و بدنه‌ی فرم فرستاده می‌شود، نه با کوئری‌استرینگ.
   *
   * کاوه‌نگار هر دو را می‌پذیرد، ولی کد ورود در URL یعنی همان کد در لاگ
   * دسترسی هر پراکسی و در هر ابزار پایشی که URLها را نگه می‌دارد
   * بنشیند. کلید API ناچار در مسیر است — این حداقل کاری است که می‌شود
   * کرد و به همان دلیل، هیچ پیام خطایی در این کلاس URL را نمی‌آورد.
   */
  private async call(method: string, params: Record<string, string>): Promise<void> {
    let response: Response;

    try {
      response = await fetch(`${KAVENEGAR_BASE}/${this.apiKey}/${method}.json`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams(params).toString(),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      // قطعی شبکه و مهلت تمام‌شده هر دو اینجا می‌افتند. متن خطای خام
      // `fetch` («fetch failed») به تنهایی گمراه‌کننده است.
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(`ارتباط با کاوه‌نگار برقرار نشد (${method}): ${reason}`);
    }

    /**
     * بدنه پیش از بررسی کد HTTP خوانده می‌شود.
     *
     * کاوه‌نگار خطاهای دامنه‌ای را با کد HTTP غیر ۲۰۰ **و** بدنه‌ی JSON
     * برمی‌گرداند — مثلاً ۴۱۸ برای اعتبار ناکافی. اگر اول به
     * `response.ok` نگاه کنیم، همان بدنه‌ای را دور می‌ریزیم که تنها
     * چیزِ به‌دردبخور در آن است.
     */
    const envelope = (await response.json().catch(() => null)) as KavenegarEnvelope | null;
    const status = envelope?.return?.status;

    if (status === 200) return;

    const hint = status !== undefined ? ERROR_HINTS[status] : undefined;
    const message = envelope?.return?.message ?? `پاسخ نامشخص (HTTP ${response.status})`;

    throw new Error(
      `کاوه‌نگار درخواست ${method} را رد کرد (${status ?? response.status}): ${message}` +
        (hint ? ` — ${hint}` : ""),
    );
  }

  /**
   * گیرنده به شکل محلی (`09121234567`) فرستاده می‌شود.
   *
   * پایگاه داده E.164 نگه می‌دارد (`+989121234567`) ولی کاوه‌نگار شکل
   * محلی می‌خواهد و برای `+98` خطای «گیرنده نامعتبر» می‌دهد — خطایی که
   * شبیه مشکل شماره‌ی کاربر به نظر می‌رسد، نه مشکل قالب‌بندی ما.
   */
  async sendOtp(phone: NormalizedPhone, code: string): Promise<void> {
    await this.call("verify/lookup", {
      receptor: toLocalPhone(phone),
      template: this.template,
      // کد شش‌رقمی است و فاصله ندارد، پس در `token` جا می‌شود؛
      // توکن‌های دارای فاصله فقط در token10 و token20 مجازند
      token: code,
    });
  }

  async sendText(phone: NormalizedPhone, text: string): Promise<void> {
    await this.call("sms/send", {
      receptor: toLocalPhone(phone),
      message: text,
      ...(this.sender ? { sender: this.sender } : {}),
    });

    this.logger.log(`پیامک به ${maskPhone(phone)} فرستاده شد.`);
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

  if (apiKey) {
    return new KavenegarSmsSender(apiKey, template, process.env.SMS_SENDER);
  }

  if (isProduction()) {
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
