"use client";

import { faNumber } from "@/lib/format";

/**
 * صفحه‌بندی فهرست‌های پنل ادمین.
 *
 * پیش از این، فهرست‌ها سقف ثابت ۲۰۰ سطر داشتند و بعد از آن، ادمین
 * بی‌آنکه بفهمد فقط تازه‌ترین‌ها را می‌دید. برای همین این کامپوننت
 * **همیشه** بازه و کل را می‌نویسد، حتی وقتی یک صفحه بیشتر نیست: عددی که
 * دیده شود، جا افتادنِ بی‌صدا را ناممکن می‌کند.
 *
 * دکمه‌ی «برو به صفحه‌ی N» ندارد. با فهرستی که هر روز بلندتر می‌شود،
 * شماره‌ی صفحه معنای پایداری ندارد — چیزی که ادمین واقعاً می‌خواهد
 * فیلتر است، و صفحه‌بندی فقط باید بگذارد به ته فهرستِ فیلترشده برسد.
 */
export function Pager({
  total,
  limit,
  offset,
  busy,
  onChange,
}: {
  total: number;
  limit: number;
  offset: number;
  busy?: boolean;
  onChange: (offset: number) => void;
}) {
  if (total === 0) return null;

  const from = offset + 1;
  const to = Math.min(offset + limit, total);
  const hasPrevious = offset > 0;
  const hasNext = to < total;

  return (
    <div className="mt-6 flex flex-wrap items-center justify-between gap-3 text-sm">
      <p className="text-ink-muted">
        {faNumber(from)}–{faNumber(to)} از {faNumber(total)}
      </p>

      {hasPrevious || hasNext ? (
        <div className="flex gap-2">
          <button
            type="button"
            className="btn-secondary"
            disabled={!hasPrevious || busy}
            // با `Math.max` صفر، بازگشت از صفحه‌ای که سطرهایش کم شده‌اند
            // به آفست منفی نمی‌رسد
            onClick={() => onChange(Math.max(offset - limit, 0))}
          >
            قبلی
          </button>
          <button
            type="button"
            className="btn-secondary"
            disabled={!hasNext || busy}
            onClick={() => onChange(offset + limit)}
          >
            بعدی
          </button>
        </div>
      ) : null}
    </div>
  );
}
