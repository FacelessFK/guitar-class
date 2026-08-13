import { DomainError } from "../common/domain-error.js";

/** خطاهای دامنه‌ی پرداخت. */
export class PaymentError extends DomainError {}

export class OrderNotFoundError extends PaymentError {
  constructor() {
    super("سفارش مورد نظر پیدا نشد.", "ORDER_NOT_FOUND");
  }
}

/**
 * سفارش برای رزروی که قابل پرداخت نیست.
 *
 * یعنی رزرو منقضی شده، لغو شده، یا از قبل قطعی است. پیام باید بگوید
 * کدام، وگرنه هنرجویی که مهلتش تمام شده نمی‌فهمد چرا صفحه‌ی پرداخت باز
 * نمی‌شود.
 */
export class NotPayableError extends PaymentError {
  constructor(message: string) {
    super(message, "NOT_PAYABLE");
  }
}

export class PaymentHoldExpiredError extends PaymentError {
  constructor() {
    super(
      "مهلت پرداخت این رزرو تمام شده و اسلات آزاد شده است. لطفاً دوباره رزرو کنید.",
      "HOLD_EXPIRED",
    );
  }
}

/** سفارش مال کاربر دیگری است. */
export class NotOrderOwnerError extends PaymentError {
  constructor() {
    super("شما به این سفارش دسترسی ندارید.", "NOT_ORDER_OWNER");
  }
}

/**
 * درگاه تأیید نکرد.
 *
 * این حالت شامل «کاربر پرداخت را لغو کرد» هم می‌شود. متن درگاه عیناً
 * منتقل می‌شود چون معمولاً دقیق‌تر از هر جمله‌ای است که ما بسازیم.
 */
export class PaymentVerificationFailedError extends PaymentError {
  constructor(reason: string) {
    super(`پرداخت تأیید نشد: ${reason}`, "VERIFICATION_FAILED");
  }
}

/**
 * موجودی اعتبار برای این خرج کافی نیست.
 *
 * در مسیر عادی نباید دیده شود: چک‌اوت سهم اعتبار را از روی همان موجودی
 * حساب می‌کند و پیش از قطعی شدن سفارش، اجازه‌ی چک‌اوتِ اعتباریِ دوم را
 * نمی‌دهد. دیده شدنش یعنی یکی از آن دو گارد سوراخ شده — پس پیام برای
 * کاربر است ولی خودِ خطا باید در لاگ جدی گرفته شود.
 */
export class InsufficientCreditError extends PaymentError {
  constructor(
    readonly balance: bigint,
    readonly requested: bigint,
  ) {
    super(
      "موجودی اعتبار شما برای این پرداخت کافی نیست. صفحه را تازه کنید و دوباره تلاش کنید.",
      "INSUFFICIENT_CREDIT",
    );
  }
}

/** هنرجویی که اعتبارش نوشته می‌شود وجود ندارد. */
export class StudentNotFoundError extends PaymentError {
  constructor() {
    super("کاربر مورد نظر پیدا نشد.", "STUDENT_NOT_FOUND");
  }
}

/**
 * یک پرداختِ نیمه‌تمام با اعتبار از قبل باز است.
 *
 * دو سفارشِ در انتظار که هر دو روی یک موجودی حساب کرده‌اند، یعنی هنگام
 * قطعی شدن دومی موجودی دیگر نیست — و آن لحظه پول درگاه گرفته شده و
 * برگرداندنش دستی است. جلوگیری پیش از رفتن به درگاه، تنها جایی است که
 * این حالت هزینه ندارد. مهلت سفارش پانزده دقیقه است، پس انتظار کوتاه
 * است.
 */
export class CreditCheckoutInProgressError extends PaymentError {
  constructor() {
    super(
      "یک پرداخت نیمه‌تمام با اعتبار دارید. تا کامل یا منقضی شدنش (حداکثر ۱۵ دقیقه) نمی‌توانید اعتبار را جای دیگری خرج کنید.",
      "CREDIT_CHECKOUT_IN_PROGRESS",
    );
  }
}

/**
 * درگاه در دسترس نبود.
 *
 * از `VERIFICATION_FAILED` جداست: آنجا پرداخت انجام نشده، اینجا
 * نمی‌دانیم. کاربر باید دوباره تلاش کند نه اینکه دوباره پول بدهد.
 */
export class GatewayUnreachableError extends PaymentError {
  constructor() {
    super(
      "ارتباط با درگاه پرداخت برقرار نشد. اگر مبلغ از حساب شما کم شده، تا ۷۲ ساعت آینده برمی‌گردد.",
      "GATEWAY_UNREACHABLE",
    );
  }
}
