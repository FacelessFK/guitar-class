import type { TeacherStatus } from "@/lib/app-api";

/**
 * وضعیت تأیید استاد.
 *
 * در پنل ادمین و پنل استاد هر دو استفاده می‌شود، ولی متن‌ها یکی نیستند:
 * آنجا خطاب به خودِ استاد است («تا تأیید نشوید دیده نمی‌شوید») و اینجا
 * فقط برچسبِ حالت. پس این نسخه کوتاه است و توضیح ندارد.
 */
export function TeacherStatusBadge({ status }: { status: TeacherStatus }) {
  switch (status) {
    case "APPROVED":
      return <span className="badge badge-ok">تأییدشده</span>;
    case "PENDING":
      return <span className="badge badge-wait">در انتظار تأیید</span>;
    case "SUSPENDED":
      return <span className="badge badge-off">معلق</span>;
  }
}
