import type { OrderResult } from "./app-api";

interface SearchParamsReader {
  get(name: string): string | null;
}

/** نتیجه‌ی تسویه فقط شناسه‌ی سفارش را در URL حمل می‌کند. */
export function paymentResultHref(orderId: string): `/payment/result?order=${string}` {
  return `/payment/result?order=${encodeURIComponent(orderId)}`;
}

/** تنها داده‌ای که صفحه‌ی نتیجه از URL می‌پذیرد، شناسه‌ی سفارش است. */
export function orderIdFromPaymentResultParams(params: SearchParamsReader): string | null {
  const orderId = params.get("order")?.trim();
  return orderId ? orderId : null;
}

/** سفارش قبلی هنگام عوض شدن query هرگز مرجعِ آدرس تازه نیست. */
export function orderForPaymentResult<T extends { id: string }>(
  order: T | null,
  orderId: string | null,
): T | null {
  return order?.id === orderId ? order : null;
}

/** موفقیت فقط از قرارداد احراز هویت‌شده‌ی سفارش می‌آید. */
export function isAuthoritativePaymentSuccess(
  order: Pick<OrderResult, "outcome"> | null,
): boolean {
  return order?.outcome === "PAID_MATCHED";
}

export type PaymentResultState =
  | "SUCCESS_GATEWAY"
  | "SUCCESS_CREDIT"
  | "SUCCESS_MIXED"
  | "SUCCESS_PACKAGE"
  | "RECOVERED_TO_CREDIT"
  | "FAILED"
  | "PENDING"
  | "REFUNDED"
  | "UNKNOWN";

/**
 * تنها نگاشتِ DTO معتبر سرور به حالت بصری نتیجه‌ی پرداخت.
 *
 * ترتیب مهم است: بسته پیش از روش پرداخت بررسی می‌شود تا خرید چهارجلسه‌ای
 * در هر سه روش مالی، هویت محصولی خودش را حفظ کند.
 */
export function paymentResultState(
  order: Pick<OrderResult, "outcome" | "paymentMethod" | "target"> | null,
): PaymentResultState {
  if (!order) return "UNKNOWN";

  switch (order.outcome) {
    case "PAID_MATCHED":
      if (order.target.kind === "PACKAGE") return "SUCCESS_PACKAGE";
      if (order.paymentMethod === "CREDIT") return "SUCCESS_CREDIT";
      if (order.paymentMethod === "MIXED") return "SUCCESS_MIXED";
      return "SUCCESS_GATEWAY";
    case "PAID_UNMATCHED":
      return "RECOVERED_TO_CREDIT";
    case "FAILED":
      return "FAILED";
    case "PENDING":
      return "PENDING";
    case "REFUNDED":
      return "REFUNDED";
  }
}
