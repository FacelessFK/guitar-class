/**
 * ترجمه‌ی وضعیت و نوع رزرو به چیزی که کاربر می‌فهمد.
 *
 * جدا از کامپوننت است چون هم فهرست کلاس‌ها و هم پنل استاد و هم صفحه‌ی
 * اتاق کلاس همین نگاشت را لازم دارند، و سه نسخه‌ی جدا یعنی سه جای
 * متفاوت که «لغو شده» را طور دیگری بنویسند.
 */

import type { BookingStatus } from "./app-api";

type BadgeTone = "badge-ok" | "badge-wait" | "badge-off" | "badge-neutral";

interface StatusDisplay {
  label: string;
  tone: BadgeTone;
}

/**
 * برچسب وضعیت، از دید کاربری که آن را می‌بیند.
 *
 * `role` لازم است چون «لغو شده» برای دو طرف دو معنی دارد: هنرجویی که
 * خودش لغو کرده باید «شما لغو کردید» ببیند، نه «هنرجو لغو کرد».
 */
export function statusDisplay(
  status: BookingStatus,
  role: "STUDENT" | "TEACHER",
): StatusDisplay {
  const iAmStudent = role === "STUDENT";

  switch (status) {
    case "PENDING_PAYMENT":
      return { label: "در انتظار پرداخت", tone: "badge-wait" };
    case "CONFIRMED":
      return { label: "تأییدشده", tone: "badge-ok" };
    case "IN_PROGRESS":
      return { label: "در حال برگزاری", tone: "badge-ok" };
    case "COMPLETED":
      return { label: "برگزار شد", tone: "badge-neutral" };
    case "CANCELLED_BY_STUDENT":
      return {
        label: iAmStudent ? "شما لغو کردید" : "هنرجو لغو کرد",
        tone: "badge-off",
      };
    case "CANCELLED_BY_TEACHER":
      return {
        label: iAmStudent ? "استاد لغو کرد" : "شما لغو کردید",
        tone: "badge-off",
      };
    case "NO_SHOW_STUDENT":
      return {
        label: iAmStudent ? "شما حاضر نشدید" : "هنرجو حاضر نشد",
        tone: "badge-off",
      };
    case "NO_SHOW_TEACHER":
      return {
        label: iAmStudent ? "استاد حاضر نشد" : "شما حاضر نشدید",
        tone: "badge-off",
      };
    case "NO_SHOW":
      return { label: "برگزار نشد", tone: "badge-off" };
    case "EXPIRED":
      return { label: "مهلت پرداخت تمام شد", tone: "badge-off" };
  }
}

/**
 * برچسب وضعیت از دید ناظرِ بیرونی.
 *
 * `statusDisplay` همیشه یک طرفِ ماجراست و «شما» می‌گوید؛ ادمین هیچ‌کدام
 * از دو طرف نیست، پس آنجا «شما لغو کردید» صریحاً غلط است و برای رسیدگی
 * به اختلاف هم دقیقاً همان چیزی که لازم است — «کدام‌شان» — را پنهان
 * می‌کند.
 */
export function statusLabel(status: BookingStatus): string {
  switch (status) {
    case "PENDING_PAYMENT":
      return "در انتظار پرداخت";
    case "CONFIRMED":
      return "تأییدشده";
    case "IN_PROGRESS":
      return "در حال برگزاری";
    case "COMPLETED":
      return "برگزار شد";
    case "CANCELLED_BY_STUDENT":
      return "لغو توسط هنرجو";
    case "CANCELLED_BY_TEACHER":
      return "لغو توسط استاد";
    case "NO_SHOW_STUDENT":
      return "عدم حضور هنرجو";
    case "NO_SHOW_TEACHER":
      return "عدم حضور استاد";
    case "NO_SHOW":
      return "هیچ‌کس نیامد";
    case "EXPIRED":
      return "مهلت پرداخت تمام شد";
  }
}

export function typeLabel(type: "TRIAL" | "SINGLE" | "PACKAGE"): string {
  switch (type) {
    case "TRIAL":
      return "جلسه معارفه رایگان";
    case "SINGLE":
      return "تک جلسه";
    case "PACKAGE":
      return "بسته ماهانه";
  }
}

/**
 * وضعیت‌هایی که جلسه هنوز «زنده» است.
 *
 * فهرست کلاس‌ها بر همین اساس به «پیشِ رو» و «گذشته» تقسیم می‌شود، نه
 * فقط بر اساس تاریخ: جلسه‌ی لغوشده‌ی هفته‌ی بعد در «پیشِ رو» نشستن
 * فقط سردرگمی می‌سازد.
 */
export const LIVE_STATUSES: readonly BookingStatus[] = [
  "PENDING_PAYMENT",
  "CONFIRMED",
  "IN_PROGRESS",
];
