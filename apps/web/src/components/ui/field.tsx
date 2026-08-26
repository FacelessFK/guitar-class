import { cx } from "@/lib/cx";

/**
 * فیلد فرم: برچسب، ورودی، راهنما، خطا.
 *
 * چیدمانش ثابت است چون در دیزاین همه‌جا یکی است: برچسب ۱۴px بالای
 * ورودی، راهنمای ۱۲.۵px زیرش، و خطا **جای راهنما** می‌نشیند نه زیرش —
 * دو سطر شدنشان کادر را در لحظه‌ی خطا تکان می‌داد.
 *
 * شمارنده‌ی کاراکتر (`count`) هم‌سطح راهنما و در سرِ دیگرِ سطر می‌آید؛
 * همان چیزی که پروفایل مدرس و درخواست تدریس نشان می‌دهند.
 */
export function Field({
  label,
  htmlFor,
  hint,
  error,
  count,
  aside,
  children,
  className,
}: {
  label?: string;
  htmlFor?: string;
  hint?: string;
  error?: string | null;
  /** مثل «۴۸ / ۹۰» — همیشه با ارقام فارسی و `dir=ltr` */
  count?: string;
  /** متنِ ریزِ سرِ دیگرِ سطرِ برچسب، مثل «شناسه حساب» */
  aside?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      {(label || aside) && (
        <div className="mb-2 flex items-baseline justify-between gap-3">
          {label && (
            <label htmlFor={htmlFor} className="label mb-0">
              {label}
            </label>
          )}
          {aside && <span className="text-[12.5px] text-meta">{aside}</span>}
        </div>
      )}

      {children}

      {(error || hint || count) && (
        <div className="flex items-baseline justify-between gap-3">
          {error ? (
            <p className="field-error">{error}</p>
          ) : hint ? (
            <p className="field-hint">{hint}</p>
          ) : (
            <span />
          )}
          {count && (
            <span dir="ltr" className="field-hint shrink-0">
              {count}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * ورودی متنی.
 *
 * `invalid` جدا از `aria-invalid` گرفته نمی‌شود — یکی است: حلقه‌ی قرمز
 * و اعلامِ صفحه‌خوان باید همیشه با هم بیایند.
 */
export function TextInput({
  invalid,
  className,
  ...rest
}: React.InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) {
  return (
    <input
      {...rest}
      aria-invalid={invalid || undefined}
      className={cx("input", invalid && "input-error", className)}
    />
  );
}

export function Textarea({
  invalid,
  className,
  ...rest
}: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }) {
  return (
    <textarea
      {...rest}
      aria-invalid={invalid || undefined}
      className={cx("input", invalid && "input-error", className)}
    />
  );
}

/**
 * انتخابگر.
 *
 * `appearance-none` لازم است تا فلشِ نیتیو برداشته شود، و شورونِ خودمان
 * جایش می‌آید. `color-scheme: dark` روی `:root` باعث می‌شود لیستِ بازشده
 * هم تاریک بیاید — بدون آن، فهرست سفید باز می‌شد.
 */
export function Select({
  children,
  invalid,
  className,
  ...rest
}: React.SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }) {
  return (
    <div className="relative">
      <select
        {...rest}
        aria-invalid={invalid || undefined}
        className={cx(
          "input cursor-pointer appearance-none pe-10",
          invalid && "input-error",
          className,
        )}
      >
        {children}
      </select>
      <svg
        aria-hidden="true"
        viewBox="0 0 256 256"
        fill="currentColor"
        className="pointer-events-none absolute end-3.5 top-1/2 size-3 -translate-y-1/2 text-meta"
      >
        <path d="M213.7 101.7l-80 80a8 8 0 0 1-11.4 0l-80-80A8 8 0 0 1 48 88h160a8 8 0 0 1 5.7 13.7" />
      </svg>
    </div>
  );
}

/**
 * چک‌باکس.
 *
 * `accent-color` بنفش است چون چک‌باکسِ نیتیو نگه داشته شده — بازسازیِ
 * دستی‌اش یعنی از دست دادن رفتار کیبورد و صفحه‌خوانی که مجانی داشتیم.
 * تراز `items-start` است نه `center`: متنِ دو سطری کنار چک‌باکس در
 * وسط‌چین بالا و پایین می‌پرید.
 */
export function Checkbox({
  children,
  className,
  ...rest
}: React.InputHTMLAttributes<HTMLInputElement> & {
  children: React.ReactNode;
}) {
  return (
    <label
      className={cx(
        "flex cursor-pointer items-start gap-2.5 text-[14.5px] leading-[1.7] text-ink",
        className,
      )}
    >
      <input
        type="checkbox"
        {...rest}
        className="mt-1 size-4 shrink-0 accent-violet"
      />
      <span>{children}</span>
    </label>
  );
}
