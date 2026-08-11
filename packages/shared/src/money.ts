/**
 * حساب پول.
 *
 * همه‌ی مبالغ `bigint` و به ریال‌اند. هیچ‌جای این فایل عدد اعشاری
 * جاوااسکریپت وارد محاسبه نمی‌شود: `0.1 + 0.2` در ممیز شناور برابر
 * `0.30000000000000004` است و در حسابداری این یعنی دفتر کل تراز نمی‌شود.
 *
 * درصد کمیسیون از دیتابیس به صورت رشته می‌آید (`numeric(5,2)` با حالت
 * `string`) و همین‌جا به عدد صحیح تبدیل می‌شود، نه به `number`.
 */

/** درصد با دو رقم اعشار، ضرب در ۱۰۰ — یعنی «۲۰.۵۰٪» می‌شود `2050`. */
const PERCENT_PRECISION = 100n;
const FULL_PERCENT = 100n * PERCENT_PRECISION;

const PERCENT_PATTERN = /^(\d{1,3})(?:\.(\d{1,2}))?$/;

/**
 * «۲۰» یا «۲۰.۵۰» را به عدد صحیح (درصد × ۱۰۰) تبدیل می‌کند.
 *
 * از `Number()` استفاده نمی‌شود چون هدف دقیقاً فرار از ممیز شناور است.
 */
export function parsePercent(rate: string): bigint {
  const match = PERCENT_PATTERN.exec(rate.trim());
  if (!match) {
    throw new RangeError(`درصد نامعتبر است: «${rate}»`);
  }

  const whole = BigInt(match[1]!);
  // «۲۰.۵» یعنی ۲۰.۵۰ نه ۲۰.۰۵ — رقم کم را از راست پر می‌کنیم
  const fraction = BigInt((match[2] ?? "").padEnd(2, "0"));
  const value = whole * PERCENT_PRECISION + fraction;

  if (value > FULL_PERCENT) {
    throw new RangeError(`درصد کمیسیون نمی‌تواند بیشتر از ۱۰۰ باشد: «${rate}»`);
  }

  return value;
}

/**
 * تقسیم مبلغ ناخالص بین پلتفرم و استاد.
 *
 * `commission + net` **همیشه** دقیقاً برابر `gross` است، چون سهم استاد
 * تفریق می‌شود نه اینکه جدا محاسبه شود. قید
 * `ledger_amounts_balance` در دیتابیس همین را می‌خواهد؛ اگر دو طرف
 * جداگانه گرد می‌شدند، یک ریال اختلاف کل درج را رد می‌کرد.
 */
export interface CommissionSplit {
  gross: bigint;
  commission: bigint;
  net: bigint;
}

/**
 * گرد کردن به نزدیک‌ترین ریال، با نصف به بالا.
 *
 * گرد کردن روی قدر مطلق انجام می‌شود تا منفی و مثبت قرینه بمانند —
 * لازمه‌ی این است که یک بازپرداخت، درآمدِ متناظرش را دقیقاً صفر کند.
 */
function divideRounded(numerator: bigint, denominator: bigint): bigint {
  const negative = numerator < 0n;
  const magnitude = negative ? -numerator : numerator;
  const rounded = (magnitude * 2n + denominator) / (denominator * 2n);
  return negative ? -rounded : rounded;
}

export function splitCommission(gross: bigint, ratePercent: string): CommissionSplit {
  if (gross < 0n) {
    throw new RangeError(
      "مبلغ ناخالص منفی نیست. برای بازپرداخت از negateSplit استفاده کنید.",
    );
  }

  const rate = parsePercent(ratePercent);
  const commission = divideRounded(gross * rate, FULL_PERCENT);

  return { gross, commission, net: gross - commission };
}

/**
 * قرینه‌ی یک تقسیم — برای ثبت بازپرداخت در دفتر کل.
 *
 * دفتر کل فقط افزودنی است، پس بازپرداخت با یک سطر منفی ثبت می‌شود نه با
 * ویرایش سطر درآمد. مجموع ستون `net_amount` هر استاد، بدهی واقعی
 * پلتفرم به اوست — بدون هیچ محاسبه‌ی جانبی.
 */
export function negateSplit(split: CommissionSplit): CommissionSplit {
  return {
    gross: -split.gross,
    commission: -split.commission,
    net: -split.net,
  };
}

/** جمع چند مبلغ. `Array.prototype.reduce` با `0` شروع می‌شود که `number` است. */
export function sumRial(amounts: readonly bigint[]): bigint {
  let total = 0n;
  for (const amount of amounts) total += amount;
  return total;
}
