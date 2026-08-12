"use client";

import { useCallback, useEffect, useState } from "react";

import { Pager } from "@/components/pager";
import { errorMessage } from "@/lib/api-client";
import {
  ADMIN_PAGE_SIZE,
  getAdminOrders,
  type AdminOrder,
  type AdminPage,
} from "@/lib/app-api";
import { formatJalaliDate, formatTehranTime, formatToman } from "@/lib/format";

const FILTERS = [
  { label: "همه", value: undefined },
  { label: "پرداخت‌شده", value: "PAID" },
  { label: "در انتظار", value: "PENDING" },
  { label: "ناموفق", value: "FAILED" },
  { label: "مسترد", value: "REFUNDED" },
] as const;

const STATUS_LABEL: Record<AdminOrder["status"], string> = {
  PAID: "پرداخت‌شده",
  PENDING: "در انتظار",
  FAILED: "ناموفق",
  REFUNDED: "مسترد",
};

const STATUS_TONE: Record<AdminOrder["status"], string> = {
  PAID: "badge-ok",
  PENDING: "badge-wait",
  FAILED: "badge-off",
  REFUNDED: "badge-neutral",
};

/**
 * تراکنش‌ها.
 *
 * این فهرست سفارش‌هاست نه دفتر کل: سفارش یعنی «کاربر چقدر پرداخت کرد»
 * و دفتر کل یعنی «آن پول چطور بین پلتفرم و استاد تقسیم شد». دومی در
 * پرونده‌ی هر استاد است، چون سؤالش همیشه درباره‌ی یک استاد مشخص است.
 */
export default function AdminOrdersPage() {
  const [status, setStatus] = useState<string | undefined>(undefined);
  const [offset, setOffset] = useState(0);
  const [page, setPage] = useState<AdminPage<AdminOrder> | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setPage(null);
    try {
      setPage(await getAdminOrders({ status, offset, limit: ADMIN_PAGE_SIZE }));
      setError(null);
    } catch (caught) {
      setError(errorMessage(caught));
      setPage({ rows: [], total: 0, limit: ADMIN_PAGE_SIZE, offset: 0 });
    }
  }, [status, offset]);

  useEffect(() => {
    void load();
  }, [load]);

  /** عوض شدن فیلتر، صفحه‌بندی را به اول برمی‌گرداند. */
  function changeFilter(value: string | undefined) {
    setStatus(value);
    setOffset(0);
  }

  const orders = page?.rows ?? null;

  return (
    <div className="mx-auto max-w-5xl px-5 py-12">
      <h1 className="text-2xl font-bold">تراکنش‌ها</h1>

      <div className="mt-6 flex flex-wrap gap-2">
        {FILTERS.map((filter) => (
          <button
            key={filter.label}
            type="button"
            onClick={() => changeFilter(filter.value)}
            className={
              status === filter.value
                ? "rounded-full bg-accent px-4 py-1.5 text-sm text-accent-ink"
                : "rounded-full border border-border px-4 py-1.5 text-sm text-ink-muted"
            }
          >
            {filter.label}
          </button>
        ))}
      </div>

      {error ? <p className="alert-error mt-6">{error}</p> : null}

      {orders === null ? (
        <p className="mt-8 text-sm text-ink-muted">در حال بارگذاری…</p>
      ) : orders.length === 0 ? (
        <p className="alert-info mt-8">تراکنشی با این فیلتر پیدا نشد.</p>
      ) : (
        <ul className="mt-8 space-y-2">
          {orders.map((order) => (
            <li
              key={order.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border px-4 py-3 text-sm"
            >
              <div>
                <p className="font-medium">
                  {formatToman(order.amount)} تومان · {order.studentName}
                </p>
                <p className="mt-1 text-ink-muted">
                  <span dir="ltr">{order.studentPhone}</span> ·{" "}
                  {formatJalaliDate(order.createdAt.slice(0, 10))} ساعت{" "}
                  {formatTehranTime(order.createdAt)}
                  {order.refId ? (
                    <>
                      {" · کد رهگیری "}
                      <span dir="ltr">{order.refId}</span>
                    </>
                  ) : null}
                </p>
              </div>

              <span className={`badge ${STATUS_TONE[order.status]}`}>
                {STATUS_LABEL[order.status]}
              </span>
            </li>
          ))}
        </ul>
      )}

      {page ? (
        <Pager
          total={page.total}
          limit={page.limit}
          offset={page.offset}
          onChange={setOffset}
        />
      ) : null}
    </div>
  );
}
