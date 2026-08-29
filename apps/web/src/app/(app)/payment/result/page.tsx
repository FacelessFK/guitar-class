"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import { errorMessage } from "@/lib/api-client";
import { getOrder, type OrderResult } from "@/lib/app-api";
import { faDigits, formatToman } from "@/lib/format";
import {
  isAuthoritativePaymentSuccess,
  orderIdFromPaymentResultParams,
} from "@/lib/payment-result";

/**
 * بازگشت از درگاه.
 *
 * ⚠️ این صفحه **تصمیم نمی‌گیرد** پرداخت موفق بوده یا نه، فقط نتیجه‌ای
 * را نشان می‌دهد که سرور از قبل گرفته است. تأیید پرداخت سرور به سرور
 * انجام شده و URL فقط شناسه‌ی سفارش را حمل می‌کند. هیچ `status` یا
 * نتیجه‌ی دیگری از نوار آدرس خوانده نمی‌شود.
 *
 * برای همین سفارش هم مستقل خوانده می‌شود: چیزی که نمایش داده می‌شود
 * وضعیت واقعی سفارش در دیتابیس است، نه چیزی که در نوار آدرس نوشته.
 */
export default function PaymentResultPage() {
  return (
    <Suspense fallback={<p className="mx-auto max-w-lg px-5 py-16">در حال بارگذاری…</p>}>
      <PaymentResult />
    </Suspense>
  );
}

function PaymentResult() {
  const searchParams = useSearchParams();
  const orderId = orderIdFromPaymentResultParams(searchParams);

  const [order, setOrder] = useState<OrderResult | null>(null);
  const [loading, setLoading] = useState(orderId !== null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!orderId) {
      setLoading(false);
      return;
    }

    getOrder(orderId)
      .then(setOrder)
      .catch((caught: unknown) => setError(errorMessage(caught)))
      .finally(() => setLoading(false));
  }, [orderId]);

  return (
    <div className="mx-auto max-w-lg px-5 py-16 text-center">
      <Outcome order={order} loading={loading} />

      {order ? (
        <dl className="card mt-8 space-y-2 text-right text-sm">
          <Row label="مبلغ" value={`${formatToman(order.totalAmount)} تومان`} />
          {/*
            سهم اعتبار فقط وقتی نوشته می‌شود که وجود داشته باشد.
            «از اعتبار: ۰ تومان» روی سفارشی که با کارت پرداخت شده، فقط
            یک سطر اضافه است.
          */}
          {BigInt(order.creditApplied) > 0n ? (
            <Row
              label="از اعتبار"
              value={`${formatToman(order.creditApplied)} تومان`}
            />
          ) : null}
          {order.refId ? (
            <Row label="کد رهگیری" value={faDigits(order.refId)} />
          ) : null}
        </dl>
      ) : null}

      {error ? <p className="alert-error mt-6">{error}</p> : null}

      <Link href="/dashboard" className="btn-primary mt-8">
        رفتن به کلاس‌های من
      </Link>
    </div>
  );
}

/**
 * حالت‌هایی که API می‌فرستد.
 *
 * `paid_unmatched` نادر ولی مهم است: پول گرفته شده ولی در همان فاصله
 * مهلت رزرو تمام شده و اسلات آزاد شده. باید صریح بگوید پول به اعتبار برگشته،
 * نه اینکه «موفق» نشان دهد و کاربر سر ساعتی برود که دیگر مال او نیست.
 */
function Outcome({ order, loading }: { order: OrderResult | null; loading: boolean }) {
  if (loading) {
    return (
      <>
        <h1 className="text-2xl font-bold">در حال بررسی پرداخت</h1>
        <p className="mt-3 text-ink-muted">وضعیت سفارش از سرور خوانده می‌شود…</p>
      </>
    );
  }

  if (isAuthoritativePaymentSuccess(order)) {
    return (
      <>
        <h1 className="text-2xl font-bold">پرداخت انجام شد</h1>
        <p className="mt-3 text-ink-muted">
          کلاس شما قطعی شد. یک روز و یک ساعت پیش از شروع، پیامک یادآوری
          می‌فرستیم.
        </p>
      </>
    );
  }

  switch (order?.outcome) {
    case "PAID_UNMATCHED":
      return (
        <>
          <h1 className="text-2xl font-bold">پرداخت شد، ولی ساعت از دست رفت</h1>
          <p className="mt-3 text-ink-muted">
            مهلت نگه‌داشتن ساعت تمام شد و رزرو قطعی نشد. مبلغ کامل
            {` (${formatToman(order.recoveredToCredit)} تومان) `}
            به اعتبار هوگه‌ی شما برگشت.
          </p>
        </>
      );

    case "FAILED":
      return (
        <>
          <h1 className="text-2xl font-bold">پرداخت ناموفق بود</h1>
          <p className="mt-3 text-ink-muted">
            مبلغی از حساب شما کم نشده است. تا وقتی مهلت رزرو تمام نشده،
            می‌توانید از فهرست کلاس‌ها دوباره پرداخت کنید.
          </p>
        </>
      );

    case "PENDING":
      return (
        <>
          <h1 className="text-2xl font-bold">پرداخت در حال بررسی است</h1>
          <p className="mt-3 text-ink-muted">
            هنوز نتیجه‌ی قطعی از درگاه ثبت نشده است. کمی بعد دوباره این صفحه را
            باز کنید.
          </p>
        </>
      );

    case "REFUNDED":
      return (
        <>
          <h1 className="text-2xl font-bold">سفارش مسترد شده است</h1>
          <p className="mt-3 text-ink-muted">این سفارش دیگر رزرو فعالی ایجاد نمی‌کند.</p>
        </>
      );

    default:
      return (
        <>
          <h1 className="text-2xl font-bold">نتیجه‌ی پرداخت مشخص نشد</h1>
          <p className="mt-3 text-ink-muted">
            هیچ نتیجه‌ی موفقی برای این آدرس تأیید نشده است. وضعیت رزرو و
            اعتبارتان را در حساب کاربری ببینید.
          </p>
        </>
      );
  }
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-ink-muted">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
