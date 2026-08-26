"use client";

import { useRef } from "react";

import { cx } from "@/lib/cx";

/**
 * ورودی کد شش‌رقمیِ پیامکی.
 *
 * چهار رفتاری که بدونشان این کنترل روی موبایل آزاردهنده است و هر چهار
 * در دیزاین هست:
 *
 * ۱. **چسباندن پخش می‌شود.** کاربر کد را از پیامک کپی می‌کند و در خانه‌ی
 *    اول می‌چسباند؛ باید در شش خانه پخش شود نه اینکه پنج رقمش دور برود.
 * ۲. **Backspace روی خانه‌ی خالی به عقب می‌رود.** بدون این، پاک کردن
 *    رقم اشتباه یعنی دستی کلیک کردن روی خانه‌ی قبلی.
 * ۳. **`autoComplete="one-time-code"`** تا سافاری و کروم کد را از پیامک
 *    خودشان پیشنهاد دهند.
 * ۴. **`dir="ltr"`** روی ردیف. کد عدد است و در RTL خانه‌ها برعکس پر
 *    می‌شدند.
 *
 * `value` یک رشته‌ی حداکثر شش‌کاراکتری است، نه آرایه: حالتِ صفحه ساده‌تر
 * می‌ماند و «کامل بودن» فقط `value.length === 6` است.
 */
const CELLS = [0, 1, 2, 3, 4, 5] as const;

export function OtpInput({
  value,
  onChange,
  invalid,
  autoFocus,
  id = "hg-code",
  label,
}: {
  value: string;
  onChange: (next: string) => void;
  invalid?: boolean;
  autoFocus?: boolean;
  id?: string;
  /** برای `aria-label` گروه — متنِ دیده‌شدنی جدا بالای این می‌آید */
  label?: string;
}) {
  const refs = useRef<Array<HTMLInputElement | null>>([]);

  function setCell(index: number, raw: string) {
    const digits = raw.replace(/\D/g, "");
    const chars = value.padEnd(6, " ").split("");

    if (digits.length > 1) {
      // چسباندن: از همین خانه به بعد پخش شود
      digits
        .slice(0, 6 - index)
        .split("")
        .forEach((d, k) => {
          chars[index + k] = d;
        });
      const next = chars.join("").trimEnd().slice(0, 6);
      onChange(next);
      refs.current[Math.min(5, index + digits.length)]?.focus();
      return;
    }

    if (digits) {
      chars[index] = digits;
      onChange(chars.join("").trimEnd().slice(0, 6));
      refs.current[Math.min(5, index + 1)]?.focus();
      return;
    }

    // پاک کردن همین خانه
    chars[index] = " ";
    onChange(chars.join("").trimEnd().slice(0, 6));
  }

  return (
    <div
      id={`${id}-row`}
      role="group"
      aria-label={label}
      dir="ltr"
      className="flex gap-[clamp(5px,1.6vw,8px)]"
    >
      {CELLS.map((i) => (
        <input
          key={i}
          id={`${id}-${i}`}
          ref={(node) => {
            refs.current[i] = node;
          }}
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={1}
          autoFocus={autoFocus && i === 0}
          aria-invalid={invalid || undefined}
          value={value[i] ?? ""}
          onChange={(e) => setCell(i, e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Backspace" && !value[i] && i > 0) {
              refs.current[i - 1]?.focus();
            }
          }}
          className={cx(
            "h-13 min-w-0 flex-1 rounded-control border-0 bg-surface-2 p-0 text-center text-[clamp(16px,4.4vw,19px)] text-ink transition-shadow duration-200",
            invalid
              ? "shadow-[inset_0_0_0_1px_var(--color-error)]"
              : "shadow-[inset_0_0_0_1px_var(--color-divider)] focus:shadow-[inset_0_0_0_1px_var(--color-violet)] focus:outline-none",
          )}
        />
      ))}
    </div>
  );
}
