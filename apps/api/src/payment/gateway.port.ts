import { randomUUID } from "node:crypto";

import { Logger } from "@nestjs/common";

/**
 * پورت درگاه پرداخت.
 *
 * پشت یک واسط است تا تا وقتی حساب پذیرندگی آماده نیست، کل مسیر پرداخت
 * ساخته و تست شود — همان کاری که برای پیامک شد. وقتی مرچنت‌آی‌دی آمد
 * فقط متغیر محیطی عوض می‌شود و هیچ کد دیگری دست نمی‌خورد.
 *
 * قرارداد مهم: هیچ آداپتوری اجازه ندارد وضعیتی که مرورگر کاربر
 * برگردانده را باور کند. تأیید فقط از مسیر سرور به سرور و با بررسی
 * مبلغ انجام می‌شود.
 */

export interface PaymentRequestInput {
  orderId: string;
  /** ریال */
  amount: bigint;
  description: string;
  /** آدرسی که درگاه کاربر را بعد از پرداخت به آن برمی‌گرداند */
  callbackUrl: string;
  /** E.164 — بعضی درگاه‌ها با آن شماره‌ی کارت ذخیره‌شده را پیشنهاد می‌دهند */
  mobile?: string;
}

export interface PaymentRequestResult {
  /** شناسه‌ی درگاه برای این تلاش پرداخت */
  authority: string;
  /** جایی که کاربر باید به آن هدایت شود */
  redirectUrl: string;
}

/**
 * نتیجه‌ی تأیید.
 *
 * `ALREADY_VERIFIED` از `FAILED` جداست چون معنایش کاملاً فرق می‌کند:
 * پول گرفته شده و فقط ما دو بار پرسیده‌ایم. اگر این دو یکی می‌شدند، هر
 * بار که کاربر صفحه‌ی بازگشت را رفرش می‌کرد، سفارشِ پرداخت‌شده ناموفق
 * علامت می‌خورد.
 */
export type VerificationResult =
  | { status: "OK"; refId: string; cardPan?: string }
  | { status: "ALREADY_VERIFIED"; refId: string }
  | { status: "FAILED"; reason: string };

export interface VerificationInput {
  authority: string;
  /** مبلغی که ما انتظار داریم، به ریال — درگاه باید همین را تأیید کند */
  amount: bigint;
}

export interface PaymentGateway {
  /** در ستون `orders.gateway` ذخیره می‌شود */
  readonly name: string;
  request(input: PaymentRequestInput): Promise<PaymentRequestResult>;
  verify(input: VerificationInput): Promise<VerificationResult>;
}

// ---------------------------------------------------------------------------
// آداپتور توسعه
// ---------------------------------------------------------------------------

/**
 * درگاه جعلی برای توسعه و تست.
 *
 * به‌جای صفحه‌ی پرداخت، مستقیم به همان آدرس بازگشت هدایت می‌کند. یعنی
 * کل جریان — ساخت سفارش، بازگشت، تأیید، قطعی شدن رزرو، ثبت در دفتر کل —
 * بدون حساب درگاه از سر تا ته اجرا می‌شود.
 *
 * مبلغ را نگه می‌دارد و در تأیید مقایسه می‌کند، چون همین بررسی است که
 * باید در آداپتور واقعی هم انجام شود و تست باید بتواند نبودنش را ببیند.
 */
export class FakePaymentGateway implements PaymentGateway {
  readonly name = "fake";
  private readonly logger = new Logger("Payment");
  private readonly pending = new Map<string, bigint>();
  private readonly verified = new Map<string, string>();

  async request(input: PaymentRequestInput): Promise<PaymentRequestResult> {
    const authority = `FAKE-${randomUUID()}`;
    this.pending.set(authority, input.amount);

    const redirectUrl = new URL(input.callbackUrl);
    redirectUrl.searchParams.set("Authority", authority);
    redirectUrl.searchParams.set("Status", "OK");

    this.logger.warn(
      `درگاه جعلی: سفارش ${input.orderId} به مبلغ ${input.amount} ریال — ${redirectUrl}`,
    );

    return { authority, redirectUrl: redirectUrl.toString() };
  }

  async verify(input: VerificationInput): Promise<VerificationResult> {
    const alreadyVerified = this.verified.get(input.authority);
    if (alreadyVerified) {
      return { status: "ALREADY_VERIFIED", refId: alreadyVerified };
    }

    const expected = this.pending.get(input.authority);
    if (expected === undefined) {
      return { status: "FAILED", reason: "شناسه‌ی پرداخت نامعتبر است." };
    }
    if (expected !== input.amount) {
      return { status: "FAILED", reason: "مبلغ تأیید با مبلغ سفارش نمی‌خواند." };
    }

    const refId = `FAKEREF-${this.verified.size + 1}`;
    this.verified.set(input.authority, refId);
    this.pending.delete(input.authority);

    return { status: "OK", refId };
  }

  /** فقط برای تست: پرداخت را ناموفق کن. */
  fail(authority: string): void {
    this.pending.delete(authority);
  }
}

// ---------------------------------------------------------------------------
// آداپتور زرین‌پال
// ---------------------------------------------------------------------------

const ZARINPAL_LIVE = "https://payment.zarinpal.com";
const ZARINPAL_SANDBOX = "https://sandbox.zarinpal.com";

/**
 * واحدی که **حساب پذیرندگی** با آن کار می‌کند.
 *
 * همه‌ی مبالغ داخل سیستم ریال‌اند و این تنها جایی است که ممکن است چیز
 * دیگری برود. مستندات v4 ریال می‌گوید، ولی حساب‌های پذیرندگی واقعی
 * می‌توانند روی تومان تنظیم باشند و آن وقت **هر** پرداختی کد `-50`
 * می‌گیرد: مبلغی که در تأیید می‌فرستیم با آنچه واقعاً پرداخت شده ده
 * برابر فرق دارد.
 *
 * چرا متغیر محیطی و نه ثابتِ کد: این را نمی‌شود پیش از یک تراکنش واقعی
 * دانست (کد `-50` فقط در **تأیید** ظاهر می‌شود، یعنی بعد از اینکه پول
 * از حساب کاربر رفته). وقتی معلوم شد، رفعش باید یک مقدار در `.env` باشد
 * نه یک دیپلوی با تغییر کد — چون آن لحظه، هر پرداختِ در جریان دارد
 * شکست می‌خورد.
 *
 * `pnpm verify:payment` همین را با کمترین مبلغ ممکن می‌سنجد.
 */
export type AmountUnit = "RIAL" | "TOMAN";

export const AMOUNT_UNITS: readonly AmountUnit[] = ["RIAL", "TOMAN"];

/**
 * ریال → واحد حساب پذیرنده.
 *
 * مبلغی که به تومان بخش‌پذیر نیست پرتاب می‌کند و گِرد نمی‌شود. گِرد
 * کردنِ بی‌صدا یعنی مبلغ ارسالی با مبلغ سفارش فرق کند، و آن دقیقاً همان
 * `-50` است — با این تفاوت که دیگر نمی‌شود از روی لاگ فهمید چرا.
 */
export function toGatewayAmount(rials: bigint, unit: AmountUnit): number {
  if (unit === "RIAL") return Number(rials);

  if (rials % 10n !== 0n) {
    throw new Error(
      `مبلغ ${rials} ریال به تومان بخش‌پذیر نیست و حساب پذیرندگی روی تومان تنظیم شده است. ` +
        "قیمت‌ها باید مضرب ۱۰ ریال باشند.",
    );
  }

  return Number(rials / 10n);
}

/** کد ۱۰۰ یعنی موفق، ۱۰۱ یعنی قبلاً تأیید شده. */
const ZARINPAL_OK = 100;
const ZARINPAL_ALREADY_VERIFIED = 101;

/**
 * کدهایی که **قطعاً** یعنی پرداخت انجام نشده.
 *
 * فهرست عمداً کوتاه و بسته است. هر کدی که اینجا نباشد «نمی‌دانم» حساب
 * می‌شود و سفارش را `PENDING` می‌گذارد، چون اشتباه در این جهت قابل
 * جبران است و در جهت دیگر نه.
 *
 * ⚠️ `-50` همان تله‌ای است که در توضیح کلاس آمده: اگر حساب پذیرندگی
 * روی تومان تنظیم باشد و ما ریال بفرستیم، **هر** پرداختی این کد را
 * می‌گیرد. پیامش صریح است تا کسی که لاگ را می‌خواند سراغ واحد مبلغ
 * برود، نه دنبال اشکال در کارت کاربر.
 */
const DEFINITIVE_FAILURES: Readonly<Record<number, string>> = {
  [-33]: "مبلغ تراکنش با مبلغ پرداخت‌شده همخوانی ندارد.",
  [-50]: "مبلغ تأیید با مبلغ پرداخت‌شده یکی نیست — واحد مبلغ حساب پذیرندگی (ریال یا تومان) را بررسی کنید.",
  [-51]: "پرداخت ناموفق بود یا کاربر آن را نیمه‌کاره رها کرد.",
  [-53]: "این تراکنش متعلق به پذیرنده‌ی دیگری است.",
  [-54]: "شناسه‌ی پرداخت نامعتبر است.",
};

interface ZarinpalEnvelope {
  data?: { code?: number; authority?: string; ref_id?: number; card_pan?: string } | unknown[];
  errors?: { code?: number; message?: string } | unknown[];
}

/**
 * آداپتور زرین‌پال (REST v4).
 *
 * ⚠️ هنوز روی حساب واقعی اجرا نشده — مرچنت‌آی‌دی نداریم. دو چیز باید
 * پیش از اولین فروش با یک تراکنش واقعی تأیید شود:
 *
 *   ۱. **واحد مبلغ.** پیش‌فرض ریال است، مطابق مستندات v4. اگر حساب
 *      پذیرندگی روی تومان تنظیم شده باشد، هر پرداختی کد `-50` می‌گیرد —
 *      پرداخت رد می‌شود نه اینکه بی‌صدا اشتباه ثبت شود، و این حالتِ
 *      شکست عمداً پرسر و صداست. رفعش `PAYMENT_AMOUNT_UNIT="TOMAN"` است،
 *      بدون تغییر کد. با `pnpm verify:payment` پیش از اولین فروش
 *      معلومش کنید.
 *   ۲. نام دقیق فیلدها در پاسخ خطا، که بین نسخه‌ها فرق کرده است.
 */
export class ZarinpalGateway implements PaymentGateway {
  readonly name = "zarinpal";
  private readonly logger = new Logger("Payment");
  private readonly baseUrl: string;

  constructor(
    private readonly merchantId: string,
    sandbox = false,
    /**
     * واحد حساب پذیرندگی. پیش‌فرض ریال است، مطابق مستندات v4 — ولی
     * فرضی است که تا اولین تراکنش واقعی اثبات نشده.
     */
    private readonly unit: AmountUnit = "RIAL",
  ) {
    this.baseUrl = sandbox ? ZARINPAL_SANDBOX : ZARINPAL_LIVE;
  }

  /**
   * پاسخ خوانده می‌شود حتی وقتی کد HTTP خطاست.
   *
   * زرین‌پال خطاهای دامنه‌ای را با کد ۴۰۰ **و** بدنه‌ی JSON برمی‌گرداند و
   * علت واقعی فقط در همان بدنه است. بررسی `response.ok` پیش از خواندن
   * بدنه، «مبلغ نمی‌خواند» و «کاربر پرداخت را رها کرد» را به یک خطای
   * بی‌شکلِ «۴۰۰» تبدیل می‌کرد.
   *
   * فقط دو چیز اینجا پرتاب می‌شود و هر دو یعنی «نمی‌دانیم چه شد»:
   * نرسیدن به درگاه، و پاسخی که JSON نیست. تفاوتشان با «قطعاً ناموفق»
   * در `verify` حیاتی است — `settleOrder` برای اولی سفارش را دست‌نخورده
   * `PENDING` می‌گذارد و برای دومی `FAILED` می‌کند.
   */
  private async post(path: string, body: Record<string, unknown>): Promise<ZarinpalEnvelope> {
    let response: Response;

    try {
      response = await fetch(`${this.baseUrl}/pg/v4/payment/${path}`, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ merchant_id: this.merchantId, ...body }),
        signal: AbortSignal.timeout(20_000),
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(`ارتباط با زرین‌پال برقرار نشد (${path}): ${reason}`);
    }

    const envelope = (await response.json().catch(() => null)) as ZarinpalEnvelope | null;

    if (!envelope) {
      throw new Error(
        `پاسخ زرین‌پال قابل خواندن نبود (${path}، HTTP ${response.status}).`,
      );
    }

    return envelope;
  }

  /** `data` وقتی خطا باشد آرایه‌ی خالی برمی‌گردد، نه شیء. */
  private static payload(envelope: ZarinpalEnvelope): {
    code?: number;
    authority?: string;
    ref_id?: number;
    card_pan?: string;
  } {
    return Array.isArray(envelope.data) ? {} : (envelope.data ?? {});
  }

  /**
   * کد خطا در `errors` می‌نشیند، نه در `data`.
   *
   * وقتی درخواست خطا بخورد، `data` آرایه‌ی خالی است و هرچه هست در
   * `errors` است. نگاه کردن فقط به `data.code` یعنی هیچ خطایی هرگز
   * تشخیص داده نشود و همه به یک «پاسخ نامشخص» تبدیل شوند.
   */
  private static errorCode(envelope: ZarinpalEnvelope): number | undefined {
    if (Array.isArray(envelope.errors)) return undefined;
    return envelope.errors?.code;
  }

  private static errorMessage(envelope: ZarinpalEnvelope): string {
    if (Array.isArray(envelope.errors)) return "پاسخ نامشخص از درگاه.";
    return envelope.errors?.message ?? `خطای درگاه (${envelope.errors?.code ?? "?"})`;
  }

  async request(input: PaymentRequestInput): Promise<PaymentRequestResult> {
    const envelope = await this.post("request.json", {
      amount: toGatewayAmount(input.amount, this.unit),
      description: input.description,
      callback_url: input.callbackUrl,
      metadata: input.mobile ? { mobile: input.mobile } : undefined,
    });

    const data = ZarinpalGateway.payload(envelope);

    /**
     * اینجا پرتاب کردن بی‌خطر است — هنوز هیچ پولی جابه‌جا نشده.
     *
     * کد خطا در پیام می‌آید چون خطاهای این مرحله تقریباً همیشه
     * پیکربندی‌اند (`-9` اعتبارسنجی، `-10` ترمینال نامعتبر، `-11`
     * ترمینال غیرفعال) و بدون کد، پیام فارسی درگاه به تنهایی معلوم
     * نمی‌کند کدام‌یک.
     */
    if (data.code !== ZARINPAL_OK || !data.authority) {
      const code = data.code ?? ZarinpalGateway.errorCode(envelope);
      throw new Error(
        `زرین‌پال درخواست پرداخت را نپذیرفت (${code ?? "?"}): ` +
          ZarinpalGateway.errorMessage(envelope),
      );
    }

    return {
      authority: data.authority,
      redirectUrl: `${this.baseUrl}/pg/StartPay/${data.authority}`,
    };
  }

  /**
   * تأیید — تنها جایی که اشتباهش پول است.
   *
   * `FAILED` برگرداندن یعنی `settleOrder` سفارش را برای همیشه ناموفق
   * علامت می‌زند. پس فقط وقتی برمی‌گردد که زرین‌پال **صریحاً** گفته
   * باشد پرداخت انجام نشده. هر چیز دیگری — کد ناشناخته، پاسخ بی‌شکل،
   * `ref_id` غایب — پرتاب می‌شود تا سفارش `PENDING` بماند و قابل بررسی
   * باشد.
   *
   * جهت این پیش‌فرض عمدی است: سفارشِ `PENDING` که باید ناموفق می‌شد،
   * خودش با جاروی مهلت پاک می‌شود؛ ولی سفارشِ `FAILED` که واقعاً پرداخت
   * شده بود، یعنی پول گرفته شده و جلسه‌ای قطعی نشده — و هیچ چیزی در
   * سیستم دیگر سراغش نمی‌رود.
   */
  async verify(input: VerificationInput): Promise<VerificationResult> {
    /**
     * همان تبدیلی که در `request` انجام شد.
     *
     * اگر این دو از هم بیفتند، درگاه کد `-50` می‌دهد و پول کاربر رفته
     * ولی سفارش تأیید نشده. برای همین یک تابع مشترک است، نه دو جای
     * جدا که باید هماهنگ بمانند.
     */
    const envelope = await this.post("verify.json", {
      amount: toGatewayAmount(input.amount, this.unit),
      authority: input.authority,
    });

    const data = ZarinpalGateway.payload(envelope);

    if (data.code === ZARINPAL_OK && data.ref_id !== undefined) {
      return {
        status: "OK",
        refId: String(data.ref_id),
        cardPan: data.card_pan,
      };
    }

    if (data.code === ZARINPAL_ALREADY_VERIFIED && data.ref_id !== undefined) {
      return { status: "ALREADY_VERIFIED", refId: String(data.ref_id) };
    }

    const code = ZarinpalGateway.errorCode(envelope);
    const reason = code !== undefined ? DEFINITIVE_FAILURES[code] : undefined;

    if (reason) {
      this.logger.warn(`تأیید پرداخت ${input.authority} ناموفق بود (${code}): ${reason}`);
      return { status: "FAILED", reason };
    }

    /**
     * اینجا یعنی نمی‌دانیم.
     *
     * شامل حالتی که کد ۱۰۰ آمده ولی `ref_id` نیامده — که «موفق» است
     * بدون شناسه‌ای برای ثبت، و بدترین چیزی که می‌شود کرد این است که
     * ناموفق حسابش کنیم.
     */
    throw new Error(
      `پاسخ زرین‌پال برای ${input.authority} شناخته نشد ` +
        `(code=${data.code ?? code ?? "?"}): ${ZarinpalGateway.errorMessage(envelope)}`,
    );
  }
}

// ---------------------------------------------------------------------------
// انتخاب آداپتور
// ---------------------------------------------------------------------------

/**
 * درگاه را از روی محیط انتخاب می‌کند.
 *
 * در تولید، نبودِ مرچنت‌آی‌دی جلوی بالا آمدن را می‌گیرد. برگشتن بی‌صدا
 * به درگاه جعلی یعنی هر کسی می‌تواند بدون پرداخت یک ریال، رزرو را قطعی
 * کند — چون درگاه جعلی هر تأییدی را می‌پذیرد.
 */
export function createPaymentGateway(): PaymentGateway {
  const merchantId = process.env.PAYMENT_MERCHANT_ID;
  const isProduction = process.env.NODE_ENV === "production";
  const sandbox = process.env.PAYMENT_SANDBOX === "true";
  const unit = process.env.PAYMENT_AMOUNT_UNIT === "TOMAN" ? "TOMAN" : "RIAL";

  if (merchantId) {
    return new ZarinpalGateway(merchantId, sandbox, unit);
  }

  if (isProduction) {
    throw new Error(
      "PAYMENT_MERCHANT_ID در محیط تولید تعریف نشده است. درگاه جعلی هر پرداختی را تأیید می‌کند و نباید در تولید استفاده شود.",
    );
  }

  return new FakePaymentGateway();
}

/**
 * تک‌نمونه‌ی درگاه.
 *
 * درگاه جعلی وضعیت درون‌حافظه‌ای دارد (کدام شناسه چه مبلغی داشت)، پس
 * باید بین درخواست‌ها یکی بماند.
 */
let gateway: PaymentGateway | undefined;

export function paymentGateway(): PaymentGateway {
  gateway ??= createPaymentGateway();
  return gateway;
}

/** فقط برای تست: درگاه را عوض می‌کند. */
export function setPaymentGateway(replacement: PaymentGateway): void {
  gateway = replacement;
}
