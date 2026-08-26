import { cx } from "@/lib/cx";

/**
 * اسپینرِ دکمه.
 *
 * حلقه‌ای که یک‌چهارمش رنگ دارد. روی دکمه‌ی عاجی رنگش ذغالی است و
 * روی بقیه بنفش — با یک رنگِ ثابت، روی یکی از دو زمینه ناپدید می‌شد.
 */
export function Spinner({
  onIvory = false,
  className,
}: {
  onIvory?: boolean;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cx(
        "size-3 shrink-0 rounded-full border-[1.5px] animate-spin-btn",
        onIvory
          ? "border-on-ivory/30 border-t-on-ivory"
          : "border-violet/30 border-t-violet-strong",
        className,
      )}
    />
  );
}
