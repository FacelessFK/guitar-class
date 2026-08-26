import { cx } from "@/lib/cx";

/**
 * نشانگر مرحله — گونه‌ی «نقطه و خط».
 *
 * صفحه‌ی رزرو. روی دسکتاپ پنج ستون که هر کدام نقطه + خط + شماره +
 * برچسب دارد؛ زیر ۷۶۸ پیکسل کل این با پنج نوارِ نازک و یک شمارنده‌ی
 * «قدم ۳ از ۵» عوض می‌شود. دلیلِ این تعویض در دیزاین روشن است: پنج
 * برچسب فارسی در ۳۷۵ پیکسل روی هم می‌افتند.
 *
 * `current` یک‌بنیان است (۱ تا n) چون در متنِ شمارنده هم همان عدد
 * می‌آید و تبدیل رفت‌وبرگشتی جای اشتباه می‌گذاشت.
 */
const FA_DIGITS = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"] as const;

/**
 * ارقام فارسی.
 *
 * دوباره‌نویسیِ کوچکِ کاری که `lib/format.ts` برای تاریخ و مبلغ می‌کند،
 * ولی آن‌ها همه ورودیِ دامنه می‌گیرند و این‌جا فقط شمارنده‌ی UI است.
 */
export function faDigits(input: string | number): string {
  return String(input).replace(/\d/g, (d) => FA_DIGITS[Number(d)]!);
}

export function Stepper({
  steps,
  current,
  className,
}: {
  /** برچسبِ هر مرحله — «ساز»، «استاد»، … */
  steps: readonly string[];
  /** یک‌بنیان */
  current: number;
  className?: string;
}) {
  const state = (n: number) =>
    n < current ? "done" : n === current ? "current" : "next";

  return (
    <div className={className}>
      {/* دسکتاپ */}
      <div className="hidden items-start pb-1 md:flex">
        {steps.map((label, i) => {
          const n = i + 1;
          const s = state(n);
          return (
            <div key={label} className="flex min-w-21 flex-1 flex-col gap-2.5">
              <div className="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className={cx(
                    "size-[9px] shrink-0 rounded-full",
                    s === "current"
                      ? "bg-violet-strong"
                      : s === "done"
                        ? "bg-[color-mix(in_srgb,var(--color-ivory)_55%,transparent)]"
                        : "bg-divider",
                  )}
                />
                <span
                  aria-hidden="true"
                  className={cx(
                    "h-px flex-1",
                    s === "next"
                      ? "bg-divider"
                      : "bg-[color-mix(in_srgb,var(--color-violet)_45%,transparent)]",
                    n === steps.length && "opacity-0",
                  )}
                />
              </div>
              <div>
                <div
                  className={cx(
                    "text-[12.5px]",
                    s === "next" ? "text-meta" : "text-ink-2",
                  )}
                >
                  {faDigits(String(n).padStart(2, "0"))}
                </div>
                <div
                  className={cx(
                    "mt-0.5 text-sm",
                    s === "current"
                      ? "text-violet-strong"
                      : s === "done"
                        ? "text-ink-2"
                        : "text-meta",
                  )}
                >
                  {label}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* موبایل */}
      <div className="md:hidden">
        <div aria-hidden="true" className="flex items-center gap-[5px]">
          {steps.map((label, i) => {
            const s = state(i + 1);
            return (
              <span
                key={label}
                className={cx(
                  "h-0.5 flex-1 rounded-[1px]",
                  s === "current"
                    ? "bg-violet-strong"
                    : s === "done"
                      ? "bg-[color-mix(in_srgb,var(--color-ivory)_30%,transparent)]"
                      : "bg-divider",
                )}
              />
            );
          })}
        </div>
        <div className="mt-2.5 flex items-baseline gap-2">
          <span className="text-[12.5px] text-meta">
            {`قدم ${faDigits(current)} از ${faDigits(steps.length)}`}
          </span>
          <span className="text-[14.5px] text-violet-strong">
            {steps[current - 1]}
          </span>
        </div>
      </div>
    </div>
  );
}

/**
 * نشانگر مرحله — گونه‌ی «دایره‌ی شماره‌دار».
 *
 * درخواست تدریس. مرحله‌ی گذشته ✓ می‌شود و **قابل کلیک** است (کاربر
 * می‌تواند برگردد و ویرایش کند)؛ مرحله‌ی جلوتر نه. همین تفاوت دلیل جدا
 * بودن این دو گونه است: نشانگر رزرو صرفاً نمایشی است.
 */
export function StepTrail({
  steps,
  current,
  onGo,
  className,
}: {
  steps: ReadonlyArray<{ label: string; num: string }>;
  /** صفر‌بنیان — مثل خودِ ویزارد */
  current: number;
  onGo?: (index: number) => void;
  className?: string;
}) {
  return (
    <ol className={cx("m-0 flex list-none flex-wrap gap-x-2 gap-y-4 p-0", className)}>
      {steps.map((step, i) => {
        const done = i < current;
        const on = i === current;
        const reachable = i <= current;
        return (
          <li key={step.label} className="flex flex-1 items-center gap-3">
            {i > 0 && (
              <span
                aria-hidden="true"
                className={cx(
                  "hidden h-px flex-1 md:block",
                  i <= current
                    ? "bg-[color-mix(in_srgb,var(--color-violet)_55%,transparent)]"
                    : "bg-divider",
                )}
              />
            )}
            <button
              type="button"
              disabled={!reachable || !onGo}
              aria-current={on ? "step" : undefined}
              onClick={() => onGo?.(i)}
              className={cx(
                "flex items-center gap-2.5 border-0 bg-transparent p-0 text-start",
                reachable && onGo ? "cursor-pointer" : "cursor-default",
              )}
            >
              <span
                aria-hidden="true"
                className={cx(
                  "grid size-8 shrink-0 place-items-center rounded-full text-[13px]",
                  on
                    ? "bg-violet text-on-ivory shadow-[inset_0_0_0_1px_var(--color-violet)]"
                    : done
                      ? "bg-violet-surface text-violet-strong shadow-[inset_0_0_0_1px_var(--color-violet-border)]"
                      : "text-meta shadow-[inset_0_0_0_1px_var(--color-divider)]",
                )}
              >
                {done ? "✓" : step.num}
              </span>
              <span
                className={cx(
                  "text-sm whitespace-nowrap",
                  on ? "text-ink" : done ? "text-ink-2" : "text-meta",
                )}
              >
                {step.label}
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
