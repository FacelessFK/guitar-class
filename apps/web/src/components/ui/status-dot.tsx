import { cx } from "@/lib/cx";

/**
 * نقطه‌ی وضعیت + برچسبش.
 *
 * نقشه‌ی رنگ‌ها یک جا تعریف می‌شود چون همان وضعیت‌ها در داشبورد هنرجو،
 * پنل استاد، نتیجه‌ی پرداخت و درآمدها تکرار می‌شوند و در دیزاین هم
 * همه‌جا یک رنگ داشتند. جدا نوشتنشان یعنی «تأییدشده» در یک صفحه سبز و
 * در صفحه‌ی دیگر خاکستری شود.
 *
 * `ok` سبزِ کم‌اشباع است، `wait` چوبیِ روشن (نه زرد — پالت زرد ندارد)،
 * `live` بنفش، و `off` خاکستریِ فراداده.
 */
const TONE = {
  ok: "bg-ok",
  wait: "bg-wood-light",
  live: "bg-violet-strong",
  off: "bg-meta",
  error: "bg-error",
} as const;

const TEXT = {
  ok: "text-ok",
  wait: "text-wood-light",
  live: "text-violet-strong",
  off: "text-meta",
  error: "text-error",
} as const;

export type StatusTone = keyof typeof TONE;

export function StatusDot({
  tone,
  children,
  size = "md",
  className,
}: {
  tone: StatusTone;
  children: React.ReactNode;
  /** `sm` در ردیف‌های فشرده‌ی فهرست، `md` در کارت */
  size?: "sm" | "md";
  className?: string;
}) {
  return (
    <span
      className={cx(
        "flex items-center gap-2 whitespace-nowrap text-[13.5px]",
        TEXT[tone],
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cx(
          "shrink-0 rounded-full",
          size === "sm" ? "size-[5px]" : "size-1.5",
          TONE[tone],
        )}
      />
      <span>{children}</span>
    </span>
  );
}
