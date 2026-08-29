import type { OrderResult } from "./app-api";

interface SearchParamsReader {
  get(name: string): string | null;
}

/** تنها داده‌ای که صفحه‌ی نتیجه از URL می‌پذیرد، شناسه‌ی سفارش است. */
export function orderIdFromPaymentResultParams(params: SearchParamsReader): string | null {
  return params.get("order");
}

/** موفقیت فقط از قرارداد احراز هویت‌شده‌ی سفارش می‌آید. */
export function isAuthoritativePaymentSuccess(
  order: Pick<OrderResult, "outcome"> | null,
): boolean {
  return order?.outcome === "PAID_MATCHED";
}
