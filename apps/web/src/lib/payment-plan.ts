/**
 * چه کسی دکمه‌ی پرداخت را نشان دهد.
 *
 * پکیج ماهانه چهار رزروِ مستقل می‌سازد ولی **یک** پرداخت دارد: API
 * جلسه‌ی پکیج را جداگانه نمی‌فروشد و با پیام «کل پکیج را یک‌جا پرداخت
 * کنید» ردش می‌کند. اگر فهرست ساده‌دلانه به ازای هر رزروِ
 * `PENDING_PAYMENT` یک دکمه بگذارد، کاربر چهار دکمه می‌بیند که سه‌تایشان
 * خطا می‌دهند و یکی‌شان کار می‌کند — بدون اینکه هیچ‌کدام بگویند چرا.
 *
 * پس تصمیم یک جا گرفته می‌شود: در هر پکیج، فقط زودترین جلسه صاحب
 * دکمه است و بقیه توضیح می‌دهند که با همان یکی پرداخت می‌شوند.
 */

import type { BookingDetail } from "./app-api";

export type PaymentPlan =
  /** جلسه‌ی مستقل — با شناسه‌ی خودش پرداخت می‌شود */
  | { kind: "BOOKING" }
  /** زودترین جلسه‌ی پکیج — کل پکیج را با شناسه‌ی ثبت‌نام پرداخت می‌کند */
  | { kind: "ENROLLMENT"; enrollmentId: string; sessionCount: number }
  /** جلسه‌ی دیگرِ همان پکیج — فقط توضیح می‌دهد، دکمه ندارد */
  | { kind: "COVERED_BY_PACKAGE" };

/**
 * نقشه‌ی «شناسه‌ی رزرو ← نقشش در پرداخت».
 *
 * فقط رزروهایی که کاربر در آن‌ها هنرجوست وارد می‌شوند؛ استاد هیچ‌وقت
 * پرداخت‌کننده نیست.
 */
export function buildPaymentPlans(
  bookings: readonly BookingDetail[],
): Map<string, PaymentPlan> {
  const plans = new Map<string, PaymentPlan>();

  const pending = bookings.filter(
    (booking) => booking.status === "PENDING_PAYMENT" && booking.role === "STUDENT",
  );

  const packages = new Map<string, BookingDetail[]>();

  for (const booking of pending) {
    /**
     * تصمیم روی `type` گرفته می‌شود نه روی پر بودن `enrollmentId`.
     *
     * این دو باید همیشه با هم بخوانند، ولی اگر روزی نخوانند — پاسخی
     * که فیلد را ندارد، نسخه‌ی قدیمی‌تر API — این شکل به سمت امن
     * می‌افتد: جلسه‌ی پکیجِ بدون شناسه‌ی ثبت‌نام دکمه‌ای نمی‌گیرد،
     * به‌جای اینکه دکمه‌ای بگیرد که با ۴۰۰ برمی‌گردد.
     */
    if (booking.type !== "PACKAGE") {
      plans.set(booking.id, { kind: "BOOKING" });
      continue;
    }

    if (!booking.enrollmentId) {
      plans.set(booking.id, { kind: "COVERED_BY_PACKAGE" });
      continue;
    }

    const group = packages.get(booking.enrollmentId);
    if (group) group.push(booking);
    else packages.set(booking.enrollmentId, [booking]);
  }

  for (const [enrollmentId, group] of packages) {
    // زودترین جلسه صاحب دکمه است: همان چیزی که کاربر در فهرست «پیشِ رو»
    // اول می‌بیند، پس دکمه جایی است که دنبالش می‌گردد
    const owner = group.reduce((earliest, booking) =>
      booking.scheduledAt < earliest.scheduledAt ? booking : earliest,
    );

    for (const booking of group) {
      plans.set(
        booking.id,
        booking.id === owner.id
          ? { kind: "ENROLLMENT", enrollmentId, sessionCount: group.length }
          : { kind: "COVERED_BY_PACKAGE" },
      );
    }
  }

  return plans;
}
