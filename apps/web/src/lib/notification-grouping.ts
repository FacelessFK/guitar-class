import type { AppNotification } from "./app-api";

export type NotificationGroupKey = "TODAY" | "THIS_WEEK" | "OLDER";

export interface NotificationGroup {
  key: NotificationGroupKey;
  label: string;
  items: AppNotification[];
}

const TEHRAN_DATE = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Tehran",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function tehranDateKey(value: Date | string): string {
  const parts = TEHRAN_DATE.formatToParts(
    typeof value === "string" ? new Date(value) : value,
  );
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((entry) => entry.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function dateNumber(dateKey: string): number {
  return Date.parse(`${dateKey}T00:00:00.000Z`);
}

function startOfIranianWeek(dateKey: string): number {
  const instant = new Date(dateNumber(dateKey));
  const daysSinceSaturday = (instant.getUTCDay() + 1) % 7;
  return instant.getTime() - daysSinceSaturday * 86_400_000;
}

export function notificationGroupFor(
  notification: AppNotification,
  now: Date = new Date(),
): NotificationGroupKey {
  const today = tehranDateKey(now);
  const created = tehranDateKey(notification.createdAt);

  if (created === today) return "TODAY";
  if (dateNumber(created) >= startOfIranianWeek(today)) return "THIS_WEEK";
  return "OLDER";
}

const GROUP_META: ReadonlyArray<{ key: NotificationGroupKey; label: string }> = [
  { key: "TODAY", label: "امروز" },
  { key: "THIS_WEEK", label: "این هفته" },
  { key: "OLDER", label: "قدیمی‌تر" },
];

export function groupNotifications(
  items: readonly AppNotification[],
  now: Date = new Date(),
): NotificationGroup[] {
  return GROUP_META.map(({ key, label }) => ({
    key,
    label,
    items: items.filter((item) => notificationGroupFor(item, now) === key),
  })).filter((group) => group.items.length > 0);
}

export type NotificationCategory = "CLASS" | "PRACTICE" | "PAYMENT" | "OTHER";

export function notificationCategory(type: string): NotificationCategory {
  if (
    ["ASSIGNMENT_CREATED", "SUBMISSION_RECEIVED", "FEEDBACK_RECEIVED", "SESSION_NOTE_ADDED"].includes(
      type,
    )
  ) {
    return "PRACTICE";
  }
  if (type === "PAYOUT_PAID") return "PAYMENT";
  if (["BOOKING_CONFIRMED", "BOOKING_CANCELLED", "SESSION_UNDER_REVIEW"].includes(type)) {
    return "CLASS";
  }
  return "OTHER";
}
