/**
 * جبر بازه‌های زمانی.
 *
 * همه‌چیز روی «میلی‌ثانیه از مبدأ یونیکس» کار می‌کند، نه دقیقه‌ی روز.
 * دلیل: جلسه‌ای که از نیمه‌شب رد شود، یا پنجره‌ای که به روز بعد سرریز
 * کند، در دامنه‌ی مطلق بدون هیچ حالت خاصی درست کار می‌کند.
 *
 * قرارداد بازه‌ها نیم‌باز است: `[start, end)`. یعنی جلسه‌ی ۱۶:۰۰ تا ۱۷:۰۰
 * و جلسه‌ی ۱۷:۰۰ تا ۱۸:۰۰ تداخل ندارند.
 */

export interface Interval {
  /** میلی‌ثانیه‌ی یونیکس، شامل */
  start: number;
  /** میلی‌ثانیه‌ی یونیکس، غیرشامل */
  end: number;
}

export function durationMs(interval: Interval): number {
  return interval.end - interval.start;
}

/** آیا دو بازه اشتراک واقعی دارند؟ تماس در نقطه‌ی مرزی تداخل نیست. */
export function overlaps(a: Interval, b: Interval): boolean {
  return a.start < b.end && b.start < a.end;
}

export function contains(outer: Interval, inner: Interval): boolean {
  return outer.start <= inner.start && inner.end <= outer.end;
}

/**
 * مرتب‌سازی، حذف بازه‌های تهی، و ادغام بازه‌های متداخل یا مماس.
 * ادغام مماس‌ها عمدی است: ۱۶–۱۸ و ۱۸–۲۰ باید یک پنجره‌ی ۱۶–۲۰ شوند تا
 * جلسه‌ای که روی مرز می‌افتد از دست نرود.
 */
export function normalize(intervals: readonly Interval[]): Interval[] {
  const sorted = intervals
    .filter((i) => i.end > i.start)
    .sort((a, b) => a.start - b.start);

  const merged: Interval[] = [];
  for (const current of sorted) {
    const last = merged[merged.length - 1];
    if (last && current.start <= last.end) {
      if (current.end > last.end) last.end = current.end;
    } else {
      merged.push({ start: current.start, end: current.end });
    }
  }
  return merged;
}

/** `base` منهای `cuts`. هر دو طرف اول نرمال می‌شوند. */
export function subtract(base: readonly Interval[], cuts: readonly Interval[]): Interval[] {
  const holes = normalize(cuts);
  let remaining = normalize(base);

  for (const hole of holes) {
    const next: Interval[] = [];
    for (const piece of remaining) {
      if (hole.end <= piece.start || hole.start >= piece.end) {
        next.push(piece);
        continue;
      }
      if (hole.start > piece.start) {
        next.push({ start: piece.start, end: hole.start });
      }
      if (hole.end < piece.end) {
        next.push({ start: hole.end, end: piece.end });
      }
    }
    remaining = next;
  }

  return remaining;
}

/** اشتراک مجموعه‌ای از بازه‌ها با یک پنجره‌ی محدودکننده. */
export function clampTo(intervals: readonly Interval[], window: Interval): Interval[] {
  const out: Interval[] = [];
  for (const iv of normalize(intervals)) {
    const start = Math.max(iv.start, window.start);
    const end = Math.min(iv.end, window.end);
    if (end > start) out.push({ start, end });
  }
  return out;
}

/**
 * یک بازه‌ی پیوسته را به اسلات‌های هم‌اندازه تقسیم می‌کند.
 *
 * `stepMs` فاصله‌ی شروع دو اسلات پشت‌سرهم است و می‌تواند از `slotMs`
 * کوچک‌تر باشد تا اسلات‌های هم‌پوشان تولید شوند (مثلاً شروع هر ۱۵ دقیقه
 * برای جلسه‌ی ۶۰ دقیقه‌ای). اسلات ناقص انتهایی دور ریخته می‌شود.
 */
export function sliceIntoSlots(interval: Interval, slotMs: number, stepMs: number): Interval[] {
  if (slotMs <= 0 || stepMs <= 0) {
    throw new Error("طول اسلات و گام باید مثبت باشند");
  }
  const slots: Interval[] = [];
  for (let start = interval.start; start + slotMs <= interval.end; start += stepMs) {
    slots.push({ start, end: start + slotMs });
  }
  return slots;
}
