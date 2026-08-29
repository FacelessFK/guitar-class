/**
 * اعتبار هنرجو.
 *
 * سیاست لغو (سند معماری، بخش ۵) از اول می‌گفت «جلسه به اعتبار
 * برمی‌گردد». آنچه اینجاست فقط حسابِ آن است: چقدر از یک مبلغ با اعتبار
 * پرداخت می‌شود و چقدر به درگاه می‌رود. نوشتن سطرها، قفل، و ایدمپوتنسی
 * کار لایه‌ی دیتابیس است و هیچ‌کدام به این فایل راه ندارند.
 *
 * همه‌ی مبالغ `bigint` و به ریال — همان قاعده‌ی `money.ts`.
 */

import type { CreditReason } from "./enums";

/**
 * حداقل مبلغی که درگاه می‌پذیرد، به ریال.
 *
 * زرین‌پال درخواستِ کمتر از این را رد می‌کند. برای پرداختِ ترکیبی این یک
 * جزئیات نیست: هنرجویی که اعتبارش تا پانصد ریالِ آخر را پوشش می‌دهد،
 * بدون این قاعده به درگاه فرستاده می‌شود و آنجا خطای بی‌ربطی می‌گیرد که
 * نه او می‌فهمد نه لاگ.
 */
export const MIN_GATEWAY_AMOUNT_RIAL = 1_000n;

/** یک سطر اعتبار، آن‌قدری که برای حساب کردن لازم است. */
export interface CreditEntry {
  reason: CreditReason;
  /** مثبت یعنی اعطا، منفی یعنی خرج */
  amount: bigint;
}

/**
 * موجودی = جمع ساده‌ی سطرها.
 *
 * دقیقاً به همان دلیلی که جمع `net_amount` دفتر کل بدهی واقعی به استاد
 * است: خرج، سطر منفی است نه ویرایش سطر اعطا. پس هیچ‌جا لازم نیست
 * «منهای خرج‌شده‌ها» حساب شود.
 */
export function creditBalance(entries: readonly CreditEntry[]): bigint {
  let total = 0n;
  for (const entry of entries) total += entry.amount;
  return total;
}

/**
 * علامتی که هر دلیل اجازه دارد داشته باشد.
 *
 * همین قاعده در دیتابیس هم قید است (`credit_amount_sign_matches_reason`).
 * دو جا بودنش عمدی است: قید جلوی داده‌ی خراب را می‌گیرد و این تابع
 * پیش از رسیدن به دیتابیس خطای قابل فهم می‌دهد.
 */
export function isCreditAmountValid(reason: CreditReason, amount: bigint): boolean {
  if (amount === 0n) return false;

  switch (reason) {
    case "CANCELLATION":
    case "PAYMENT_RECOVERY":
      return amount > 0n;
    case "SPEND":
      return amount < 0n;
    case "ADMIN_ADJUSTMENT":
      return true;
  }
}

export interface PaymentSplitInput {
  /** کل مبلغ سفارش، به ریال */
  total: bigint;
  /** موجودی اعتبار هنرجو */
  balance: bigint;
  /** هنرجو خواسته اعتبارش خرج شود یا نه */
  useCredit: boolean;
  /** قابل تنظیم فقط برای تست */
  minGatewayAmount?: bigint;
}

export interface PaymentSplit {
  /** از اعتبار برداشته می‌شود */
  fromCredit: bigint;
  /** به درگاه می‌رود. صفر یعنی سفارش اصلاً به درگاه نمی‌رود */
  fromGateway: bigint;
}

/**
 * مبلغ را بین اعتبار و درگاه تقسیم می‌کند.
 *
 * `fromCredit + fromGateway` **همیشه** دقیقاً برابر `total` است — همان
 * قاعده‌ای که `splitCommission` دارد و به همان دلیل: یک ریال اختلاف یعنی
 * سفارشی که نه کامل پرداخت شده و نه ناموفق است.
 *
 * سه حالت:
 *
 *   • اعتبار کل مبلغ را می‌پوشاند → `fromGateway = 0`، مسیر بدون درگاه
 *   • اعتبار بخشی را می‌پوشاند → باقی‌مانده به درگاه
 *   • باقی‌مانده زیر کف درگاه می‌افتد → از اعتبار **کمتر** برداشته
 *     می‌شود تا باقی‌مانده به کف برسد. برعکسش (بالا بردن سهم اعتبار تا
 *     پوشش کامل) وسوسه‌انگیز است ولی یعنی برداشتن پولی از اعتبار که
 *     هنرجو اجازه‌اش را نداده.
 */
export function splitPayment(input: PaymentSplitInput): PaymentSplit {
  const minGateway = input.minGatewayAmount ?? MIN_GATEWAY_AMOUNT_RIAL;

  if (!input.useCredit || input.balance <= 0n || input.total <= 0n) {
    return { fromCredit: 0n, fromGateway: input.total };
  }

  const fromCredit = input.balance < input.total ? input.balance : input.total;
  const fromGateway = input.total - fromCredit;

  if (fromGateway === 0n || fromGateway >= minGateway) {
    return { fromCredit, fromGateway };
  }

  /**
   * باقی‌مانده‌ی ناچیزی مانده که درگاه نمی‌پذیرد.
   *
   * سهم اعتبار آن‌قدر کم می‌شود که باقی‌مانده به کف برسد. اگر خودِ کل
   * مبلغ از کف کمتر باشد (که برای قیمت یک جلسه اتفاق نمی‌افتد ولی تابع
   * نباید به آن تکیه کند)، چیزی برای کم کردن نمی‌ماند و کل مبلغ به
   * درگاه می‌رود.
   */
  const reduced = input.total - minGateway;

  return reduced > 0n
    ? { fromCredit: reduced, fromGateway: minGateway }
    : { fromCredit: 0n, fromGateway: input.total };
}
