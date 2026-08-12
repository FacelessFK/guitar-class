"use client";

import { useEffect, useState } from "react";

/**
 * «الان» که هر ثانیه تازه می‌شود.
 *
 * برای شمارش معکوس‌ها لازم است: مهلت پرداخت، باز شدن اتاق کلاس، و
 * فعال شدن دکمه‌ی ورود. بدون آن، صفحه‌ای که کاربر بازش گذاشته هیچ‌وقت
 * متوجه نمی‌شود اتاق باز شده و او باید دستی تازه‌سازی کند.
 *
 * مقدار اولیه `null` است و نه `Date.now()`: رندر سرور و اولین رندر
 * کلاینت باید یکی باشند، و ساعت این دو هرگز یکی نیست. تا وقتی مقدار
 * `null` است، صدازننده به‌جای شمارش معکوس چیزی خنثی نشان می‌دهد.
 *
 * ⚠️ ساعت مرورگر است، پس قابل جابه‌جایی است. هر تصمیمی که از این
 * گرفته می‌شود فقط ظاهری است — API خودش پنجره‌ی زمانی را بررسی می‌کند
 * و بیرون از آن توکنی صادر نمی‌کند.
 */
export function useNow(intervalMs = 1000): number | null {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);

  return now;
}
