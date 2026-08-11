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

/** کد ۱۰۰ یعنی موفق، ۱۰۱ یعنی قبلاً تأیید شده. */
const ZARINPAL_OK = 100;
const ZARINPAL_ALREADY_VERIFIED = 101;

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
 *   ۱. **واحد مبلغ.** اینجا ریال فرستاده می‌شود، مطابق مستندات v4. اگر
 *      حساب پذیرندگی روی تومان تنظیم شده باشد، مبلغ‌ها ده برابر کوچک
 *      می‌شوند و — چون تأیید مبلغ را مقایسه می‌کند — پرداخت رد می‌شود
 *      نه اینکه بی‌صدا اشتباه ثبت شود. این حالتِ شکست عمداً پرسر و صداست.
 *   ۲. نام دقیق فیلدها در پاسخ خطا، که بین نسخه‌ها فرق کرده است.
 */
export class ZarinpalGateway implements PaymentGateway {
  readonly name = "zarinpal";
  private readonly logger = new Logger("Payment");
  private readonly baseUrl: string;

  constructor(
    private readonly merchantId: string,
    sandbox = false,
  ) {
    this.baseUrl = sandbox ? ZARINPAL_SANDBOX : ZARINPAL_LIVE;
  }

  private async post(path: string, body: Record<string, unknown>): Promise<ZarinpalEnvelope> {
    const response = await fetch(`${this.baseUrl}/pg/v4/payment/${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ merchant_id: this.merchantId, ...body }),
      signal: AbortSignal.timeout(20_000),
    });

    if (!response.ok) {
      throw new Error(`درگاه زرین‌پال با کد ${response.status} پاسخ داد.`);
    }

    return (await response.json()) as ZarinpalEnvelope;
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

  private static errorMessage(envelope: ZarinpalEnvelope): string {
    if (Array.isArray(envelope.errors)) return "پاسخ نامشخص از درگاه.";
    return envelope.errors?.message ?? `خطای درگاه (${envelope.errors?.code ?? "?"})`;
  }

  async request(input: PaymentRequestInput): Promise<PaymentRequestResult> {
    const envelope = await this.post("request.json", {
      amount: Number(input.amount),
      description: input.description,
      callback_url: input.callbackUrl,
      metadata: input.mobile ? { mobile: input.mobile } : undefined,
    });

    const data = ZarinpalGateway.payload(envelope);
    if (data.code !== ZARINPAL_OK || !data.authority) {
      throw new Error(ZarinpalGateway.errorMessage(envelope));
    }

    return {
      authority: data.authority,
      redirectUrl: `${this.baseUrl}/pg/StartPay/${data.authority}`,
    };
  }

  async verify(input: VerificationInput): Promise<VerificationResult> {
    const envelope = await this.post("verify.json", {
      amount: Number(input.amount),
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

    const reason = ZarinpalGateway.errorMessage(envelope);
    this.logger.warn(`تأیید پرداخت ${input.authority} ناموفق بود: ${reason}`);
    return { status: "FAILED", reason };
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

  if (merchantId) {
    return new ZarinpalGateway(merchantId, sandbox);
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
