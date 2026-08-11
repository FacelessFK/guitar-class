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
