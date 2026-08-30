"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { tehranDateKey } from "@music/shared";

import { ButtonLink, Skeleton, StatusDot } from "@/components/ui";
import { errorMessage } from "@/lib/api-client";
import { getOrder, type OrderResult } from "@/lib/app-api";
import {
  faDigits,
  faNumber,
  formatJalaliDayMonth,
  formatTehranTime,
  formatToman,
} from "@/lib/format";
import {
  orderIdFromPaymentResultParams,
  orderForPaymentResult,
  paymentResultState,
  type PaymentResultState,
} from "@/lib/payment-result";

const POLL_PENDING_MS = 3_000;

export default function PaymentResultPage() {
  return (
    <Suspense fallback={<PaymentResultSkeleton />}>
      <PaymentResult />
    </Suspense>
  );
}

function PaymentResultSkeleton() {
  return (
    <main className="mx-auto max-w-[716px] px-4.5 py-10 md:px-6 md:py-16">
      <Skeleton className="h-5 w-28" />
      <Skeleton className="mt-5 h-11 w-64" delay={1} />
      <Skeleton className="mt-3 h-6 w-full max-w-md" delay={2} />
      <Skeleton className="mt-9 h-64 w-full" />
    </main>
  );
}

function PaymentResult() {
  const searchParams = useSearchParams();
  const orderId = orderIdFromPaymentResultParams(searchParams);
  const [order, setOrder] = useState<OrderResult | null>(null);
  const [loading, setLoading] = useState(orderId !== null);
  const [error, setError] = useState<string | null>(null);
  const [poll, setPoll] = useState(0);

  useEffect(() => {
    if (!orderId) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (order?.id !== orderId) setLoading(true);
    setError(null);

    getOrder(orderId)
      .then((result) => {
        if (cancelled) return;
        setOrder(result);
        if (result.outcome === "PENDING") {
          timer = setTimeout(() => setPoll((value) => value + 1), POLL_PENDING_MS);
        }
      })
      .catch((caught: unknown) => {
        if (!cancelled) setError(errorMessage(caught));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [orderId, poll]);

  const visibleOrder = orderForPaymentResult(order, orderId);

  if (loading && !visibleOrder) return <PaymentResultSkeleton />;

  const state = paymentResultState(visibleOrder);
  const copy = resultCopy(state, error, orderId !== null);

  return (
    <main className="mx-auto max-w-[716px] px-4.5 py-10 md:px-6 md:py-16">
      <div aria-live="polite">
        <ResultMarker state={state} label={copy.marker} />
        <h1 className="mt-4 text-[clamp(26px,3.2vw,34px)] font-semibold tracking-[-0.02em] text-ink">
          {copy.heading}
        </h1>
        <p className="mt-2.5 max-w-[46ch] text-base leading-[1.85] text-ink-2">
          {copy.support}
        </p>
      </div>

      {state === "PENDING" ? <PendingDots /> : null}

      {visibleOrder ? <OrderSummary order={visibleOrder} state={state} /> : null}

      {error ? (
        <div className="mt-4 rounded-control bg-error-surface px-4 py-3.5 text-sm leading-[1.8] text-error shadow-[inset_0_0_0_1px_var(--color-error-border)]">
          {error}
        </div>
      ) : null}

      {state === "RECOVERED_TO_CREDIT" && visibleOrder ? (
        <div className="mt-4 rounded-control bg-violet-surface px-4 py-3.5 text-sm leading-[1.85] text-ink-2 shadow-[inset_0_0_0_1px_var(--color-violet-border)]">
          مبلغ {formatToman(visibleOrder.recoveredToCredit)} تومان به اعتبار هوگه‌ی تو
          اضافه شده و برای رزرو بعدی قابل استفاده است.
        </div>
      ) : null}

      <ResultActions state={state} />
    </main>
  );
}

function ResultMarker({ state, label }: { state: PaymentResultState; label: string }) {
  const tone =
    state.startsWith("SUCCESS")
      ? "ok"
      : state === "FAILED"
        ? "error"
        : state === "REFUNDED" || state === "UNKNOWN"
          ? "off"
          : "live";

  return <StatusDot tone={tone}>{label}</StatusDot>;
}

function PendingDots() {
  return (
    <div aria-hidden="true" className="mt-5 flex items-center gap-2">
      <span className="size-1.5 rounded-full bg-violet animate-dot" />
      <span className="size-1.5 rounded-full bg-violet animate-dot [animation-delay:0.2s]" />
      <span className="size-1.5 rounded-full bg-violet animate-dot [animation-delay:0.4s]" />
    </div>
  );
}

function OrderSummary({ order, state }: { order: OrderResult; state: PaymentResultState }) {
  const sessionDate = tehranDateKey(new Date(order.target.firstSessionAt));
  const success = state.startsWith("SUCCESS");
  const status =
    success
      ? { label: "تأییدشده", tone: "ok" as const }
      : state === "PENDING"
        ? { label: "در حال بررسی", tone: "live" as const }
        : state === "FAILED"
          ? { label: "تأییدنشده", tone: "error" as const }
          : state === "RECOVERED_TO_CREDIT"
            ? { label: "بازیابی‌شده", tone: "live" as const }
            : { label: "غیرفعال", tone: "off" as const };

  return (
    <>
      <section className="mt-8 overflow-hidden rounded-card bg-surface shadow-[inset_0_0_0_1px_var(--color-divider)] md:mt-9">
        <div className="flex flex-wrap items-start gap-3 px-4.5 py-4.5 md:px-5">
          <div className="min-w-0 flex-1">
            <h2 className="text-[16.5px] font-semibold text-ink">
              کلاس {order.target.instrumentName}
            </h2>
            <p className="mt-1 text-sm text-ink-2">با {order.target.teacherName}</p>
          </div>
          {order.target.kind === "PACKAGE" ? (
            <span className="rounded-pill bg-violet-surface px-3 py-1 text-[13px] text-violet-strong">
              بسته ماهانه · ۴ جلسه
            </span>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2 px-4.5 pb-4.5 md:px-5">
          <Fact>{formatJalaliDayMonth(sessionDate)}</Fact>
          <Fact>{formatTehranTime(order.target.firstSessionAt)}</Fact>
          <Fact>
            {order.target.kind === "PACKAGE"
              ? `بسته ماهانه · ${faNumber(order.target.sessionCount)} جلسه`
              : "تک جلسه"}
          </Fact>
        </div>

        <dl className="border-t border-divider px-4.5 py-2 md:px-5">
          <AmountRow
            label={success ? "مبلغ پرداخت‌شده" : "مبلغ سفارش"}
            value={order.totalAmount}
            strong
          />
          {state === "RECOVERED_TO_CREDIT" ? (
            <AmountRow label="بازیابی به اعتبار" value={order.recoveredToCredit} />
          ) : null}
        </dl>

        <div className="flex items-center justify-between gap-4 border-t border-divider bg-surface-2/60 px-4.5 py-3.5 md:px-5">
          <span className="text-sm text-meta">وضعیت رزرو</span>
          <StatusDot tone={status.tone}>{status.label}</StatusDot>
        </div>
      </section>

      <PaymentDetails order={order} state={state} />
    </>
  );
}

function Fact({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex min-h-9 items-center rounded-control bg-surface-2 px-3 text-[13.5px] text-ink-2">
      {children}
    </span>
  );
}

function AmountRow({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-3 py-2.5">
      <dt className="text-[14.5px] text-ink-2">{label}</dt>
      <dd className={strong ? "text-[15px] font-semibold text-ink" : "text-[14.5px] text-ink-2"}>
        {formatToman(value)} تومان
      </dd>
    </div>
  );
}

function PaymentDetails({ order, state }: { order: OrderResult; state: PaymentResultState }) {
  const hasCredit = BigInt(order.creditApplied) > 0n;
  const hasGateway = BigInt(order.gatewayAmount) > 0n;
  const paid = state.startsWith("SUCCESS") || state === "RECOVERED_TO_CREDIT";

  return (
    <section className="mt-5 border-t border-divider pt-4.5">
      <h2 className="text-sm font-medium text-meta">جزئیات پرداخت</h2>
      <dl className="mt-1">
        <DetailRow label="روش پرداخت" value={paymentMethodLabel(order.paymentMethod)} />
        {hasCredit ? <DetailRow label="پرداخت از اعتبار" value={`${formatToman(order.creditApplied)} تومان`} /> : null}
        {hasGateway ? (
          <DetailRow
            label={paid ? "پرداخت در درگاه" : "سهم درگاه"}
            value={`${formatToman(order.gatewayAmount)} تومان`}
          />
        ) : null}
        {order.refId && hasGateway ? (
          <DetailRow label="شماره پیگیری" value={faDigits(order.refId)} reference />
        ) : null}
      </dl>
    </section>
  );
}

function DetailRow({
  label,
  value,
  reference = false,
}: {
  label: string;
  value: string;
  reference?: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-divider-soft py-2.5">
      <dt className="text-[14.5px] text-ink-2">{label}</dt>
      <dd
        dir={reference ? "ltr" : undefined}
        className={`min-w-0 max-w-full text-[14.5px] text-ink-2 ${reference ? "break-all text-left" : ""}`}
      >
        {value}
      </dd>
    </div>
  );
}

function ResultActions({ state }: { state: PaymentResultState }) {
  const success = state.startsWith("SUCCESS");

  return (
    <div className="mt-7 flex flex-wrap items-center gap-4 max-sm:flex-col max-sm:items-stretch md:mt-8">
      {success || state === "RECOVERED_TO_CREDIT" || state === "REFUNDED" ? (
        <ButtonLink href="/dashboard" className="max-sm:w-full">
          رفتن به کلاس‌های من
        </ButtonLink>
      ) : state === "FAILED" ? (
        <ButtonLink href="/dashboard" className="max-sm:w-full">
          رفتن به کلاس‌های من
        </ButtonLink>
      ) : (
        <ButtonLink href="/dashboard" variant="quiet" className="max-sm:w-full">
          کلاس‌های من
        </ButtonLink>
      )}

      {state === "FAILED" || state === "RECOVERED_TO_CREDIT" || state === "UNKNOWN" ? (
        <ButtonLink href="/dashboard/book" variant="ghost" className="max-sm:justify-center">
          بازگشت به رزرو کلاس
        </ButtonLink>
      ) : null}
    </div>
  );
}

function paymentMethodLabel(method: OrderResult["paymentMethod"]): string {
  switch (method) {
    case "CREDIT":
      return "اعتبار هوگه";
    case "MIXED":
      return "اعتبار هوگه + درگاه";
    case "GATEWAY":
      return "درگاه پرداخت";
  }
}

function resultCopy(
  state: PaymentResultState,
  error: string | null,
  hasOrderId: boolean,
): { marker: string; heading: string; support: string } {
  switch (state) {
    case "SUCCESS_GATEWAY":
      return {
        marker: "پرداخت موفق",
        heading: "پرداخت موفق بود.",
        support: "کلاس تو با موفقیت رزرو و تأیید شد.",
      };
    case "SUCCESS_CREDIT":
      return {
        marker: "پرداخت با اعتبار",
        heading: "پرداخت موفق بود.",
        support: "هزینه کلاس از اعتبار هوگه پرداخت شد و رزرو تأیید شد.",
      };
    case "SUCCESS_MIXED":
      return {
        marker: "اعتبار + درگاه",
        heading: "پرداخت موفق بود.",
        support: "بخشی از هزینه از اعتبار هوگه و باقی آن در درگاه پرداخت شد.",
      };
    case "SUCCESS_PACKAGE":
      return {
        marker: "بسته ماهانه تأیید شد",
        heading: "پرداخت موفق بود.",
        support: "بسته ماهانه · ۴ جلسه برای تو ثبت و تأیید شد.",
      };
    case "RECOVERED_TO_CREDIT":
      return {
        marker: "مبلغ به اعتبار بازیابی شد",
        heading: "پرداخت ثبت شد، اما زمان قابل رزرو نبود.",
        support: "پرداخت با کلاس تطبیق پیدا نکرد و ارزش آن به اعتبار هوگه‌ی تو برگشت.",
      };
    case "FAILED":
      return {
        marker: "پرداخت ناموفق",
        heading: "پرداخت انجام نشد.",
        support: "رزرو هنوز تأیید نشده است. اگر مهلت رزرو باقی مانده باشد، از کلاس‌های من دوباره تلاش کن.",
      };
    case "PENDING":
      return {
        marker: "در حال بررسی",
        heading: "در حال بررسی پرداخت…",
        support: "نتیجه قطعی هنوز از سرور ثبت نشده است؛ این صفحه خودکار دوباره بررسی می‌شود.",
      };
    case "REFUNDED":
      return {
        marker: "سفارش غیرفعال",
        heading: "این سفارش دیگر فعال نیست.",
        support: "این سفارش رزرو فعالی ایجاد نمی‌کند. وضعیت کلاس‌ها و اعتبارت را در حساب ببین.",
      };
    case "UNKNOWN":
      return {
        marker: "نتیجه نامشخص",
        heading: hasOrderId ? "نتیجه پرداخت در دسترس نیست." : "شناسه سفارش پیدا نشد.",
        support: error
          ? "سرور هیچ نتیجه موفقی برای این سفارش در اختیار این حساب نگذاشت."
          : "این آدرس نتیجه‌ی پرداخت معتبری ندارد. وضعیت کلاس‌ها و اعتبارت را در حساب ببین.",
      };
  }
}
