"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import { errorMessage } from "@/lib/api-client";
import { getOrder, type Order } from "@/lib/app-api";
import { faDigits, formatToman } from "@/lib/format";

/**
 * بازگشت از درگاه.
 *
 * ⚠️ این صفحه **تصمیم نمی‌گیرد** پرداخت موفق بوده یا نه، فقط نتیجه‌ای
 * را نشان می‌دهد که سرور از قبل گرفته است. تأیید پرداخت سرور به سرور
 * انجام شده و API کاربر را با پارامتر `status` به اینجا فرستاده. اگر
 * این صفحه از روی پارامترها تصمیم می‌گرفت، هر کسی می‌توانست با تایپ
 * `?status=paid` صفحه‌ی «پرداخت موفق» ببیند.
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
  const orderId = searchParams.get("order");
  const status = searchParams.get("status");

  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!orderId) return;

    getOrder(orderId)
      .then(setOrder)
      .catch((caught: unknown) => setError(errorMessage(caught)));
  }, [orderId]);

  return (
    <div className="mx-auto max-w-lg px-5 py-16 text-center">
      <Outcome status={status} />

      {order ? (
        <dl className="card mt-8 space-y-2 text-right text-sm">
          <Row label="مبلغ" value={`${formatToman(order.amount)} تومان`} />
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
 * چهار حالتی که API می‌فرستد.
 *
 * `paid_unmatched` نادر ولی مهم است: پول گرفته شده ولی در همان فاصله
 * مهلت رزرو تمام شده و اسلات آزاد شده. باید صریح بگوید پول برمی‌گردد،
 * نه اینکه «موفق» نشان دهد و کاربر سر ساعتی برود که دیگر مال او نیست.
 */
function Outcome({ status }: { status: string | null }) {
  switch (status) {
    case "paid":
      return (
        <>
          <h1 className="text-2xl font-bold">پرداخت انجام شد</h1>
          <p className="mt-3 text-ink-muted">
            کلاس شما قطعی شد. یک روز و یک ساعت پیش از شروع، پیامک یادآوری
            می‌فرستیم.
          </p>
        </>
      );

    case "paid_unmatched":
      return (
        <>
          <h1 className="text-2xl font-bold">پرداخت شد، ولی ساعت از دست رفت</h1>
          <p className="mt-3 text-ink-muted">
            مبلغ از حساب شما کم شد اما مهلت نگه‌داشتن آن ساعت دقیقاً در همان
            فاصله تمام شد و ساعت آزاد شد. این مبلغ به شما برگردانده می‌شود؛
            پشتیبانی پیگیری می‌کند.
          </p>
        </>
      );

    case "failed":
      return (
        <>
          <h1 className="text-2xl font-bold">پرداخت ناموفق بود</h1>
          <p className="mt-3 text-ink-muted">
            مبلغی از حساب شما کم نشده است. تا وقتی مهلت رزرو تمام نشده،
            می‌توانید از فهرست کلاس‌ها دوباره پرداخت کنید.
          </p>
        </>
      );

    default:
      return (
        <>
          <h1 className="text-2xl font-bold">نتیجه‌ی پرداخت مشخص نشد</h1>
          <p className="mt-3 text-ink-muted">
            اگر مبلغی از حساب شما کم شده، تا ساعاتی دیگر به‌صورت خودکار
            برمی‌گردد. وضعیت رزرو را در فهرست کلاس‌ها ببینید.
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
