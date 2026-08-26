"use client";

import { useEffect, useState } from "react";

/**
 * شمارش معکوس بر حسب ثانیه.
 *
 * سه جا لازم است و در هر سه دیزاین یک رفتار دارد: مهلت پرداخت روی
 * کارت جلسه، تایمر «ارسال دوباره‌ی کد»، و شمارش تا باز شدن اتاق کلاس.
 *
 * تایمر روی `unmount` پاک می‌شود و روی صفر خودش می‌ایستد — بدون آن،
 * `setInterval` تا ابد هر ثانیه یک رندر می‌سازد.
 *
 * ⚠️ این شمارنده **نمایشی** است. تصمیم واقعی («مهلت تمام شد») سمت سرور
 * و با جاروی `expire-holds` گرفته می‌شود؛ رسیدن این عدد به صفر فقط
 * یعنی UI باید وضعیت را دوباره بپرسد.
 */
export function useCountdown(seconds: number) {
  const [left, setLeft] = useState(seconds);

  useEffect(() => {
    setLeft(seconds);
  }, [seconds]);

  useEffect(() => {
    if (left <= 0) return;
    const id = setInterval(() => setLeft((v) => (v > 0 ? v - 1 : 0)), 1000);
    return () => clearInterval(id);
  }, [left]);

  return {
    left,
    done: left <= 0,
    /** `mm:ss` با ارقام فارسی — همان شکلی که کارت جلسه نشان می‌دهد */
    clock: format(left),
    reset: (next: number) => setLeft(next),
  };
}

const FA = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"] as const;

function format(total: number): string {
  const mm = String(Math.floor(total / 60)).padStart(2, "0");
  const ss = String(total % 60).padStart(2, "0");
  return `${mm}:${ss}`.replace(/\d/g, (d) => FA[Number(d)]!);
}
