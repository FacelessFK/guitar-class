import type { PracticeItem } from "./app-api";

export type PracticeSectionKey = "ACTIVE" | "WAITING" | "FEEDBACK" | "COMPLETED";

export interface PracticeSection {
  key: PracticeSectionKey;
  label: string;
  items: PracticeItem[];
}

/**
 * Manual completion and the submission lifecycle are deliberately orthogonal.
 * `completedAt` wins only for placement in history; clearing it reveals the
 * assignment's real ASSIGNED/SUBMITTED/REVIEWED state again.
 */
export function practiceSectionFor(item: PracticeItem): PracticeSectionKey {
  if (item.completedAt) return "COMPLETED";

  switch (item.status) {
    case "ASSIGNED":
      return "ACTIVE";
    case "SUBMITTED":
      return "WAITING";
    case "REVIEWED":
      return "FEEDBACK";
  }
}

const SECTION_META: ReadonlyArray<{ key: PracticeSectionKey; label: string }> = [
  { key: "ACTIVE", label: "برای تمرین" },
  { key: "WAITING", label: "منتظر بازخورد" },
  { key: "FEEDBACK", label: "بازخورد گرفته" },
  { key: "COMPLETED", label: "انجام‌شده‌ها" },
];

export function buildPracticeSections(items: readonly PracticeItem[]): PracticeSection[] {
  const students = items.filter((item) => item.role === "STUDENT");

  return SECTION_META.map(({ key, label }) => ({
    key,
    label,
    items: students.filter((item) => practiceSectionFor(item) === key),
  })).filter((section) => section.items.length > 0);
}

export function practiceStateLabel(item: PracticeItem): string {
  if (item.completedAt) {
    if (item.status === "REVIEWED") return "بازخورد گرفته · انجام‌شده";
    if (item.status === "SUBMITTED") return "ارسال‌شده · انجام‌شده";
    return "انجام‌شده";
  }

  if (item.status === "REVIEWED") return "بازخورد گرفته";
  if (item.status === "SUBMITTED") return "ارسال شد";
  return "انجام نشده";
}
