import type { BookingDetail } from "./app-api";
import { LIVE_STATUSES } from "./booking-display";

/**
 * رزروهای دنیای استاد را در همان مرز صفحه جدا می‌کند.
 *
 * داشتن پروفایل استاد نقش تک‌تک رزروها را تعیین نمی‌کند؛ یک حساب دو‌نقشه
 * می‌تواند هم‌زمان در یک کلاس هنرجو و در کلاس دیگری استاد باشد.
 */
export function splitTeacherBookings(bookings: readonly BookingDetail[]): {
  upcoming: BookingDetail[];
  past: BookingDetail[];
} {
  const teacherBookings = bookings.filter((booking) => booking.role === "TEACHER");

  return {
    upcoming: teacherBookings
      .filter((booking) => LIVE_STATUSES.includes(booking.status))
      .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt)),
    past: teacherBookings
      .filter((booking) => !LIVE_STATUSES.includes(booking.status))
      .sort((a, b) => b.scheduledAt.localeCompare(a.scheduledAt)),
  };
}
