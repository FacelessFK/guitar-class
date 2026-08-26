import Link from "next/link";

import { cx } from "@/lib/cx";
import { Spinner } from "@/components/ui/spinner";

/**
 * دکمه.
 *
 * سه سطح کنش دیزاین — و ترتیبشان معنا دارد:
 *
 *   `primary`  پرِ عاجی. سنگین‌ترین کنش صفحه و **در هر صفحه فقط یکی**.
 *   `outline`  لبه‌ی بنفش. کنش دعوت‌کننده‌ی درجه‌دو (معارفه‌ی رایگان،
 *              ارسال تمرین، دادن بازخورد).
 *   `quiet`    لبه‌ی divider. کنشِ خنثی (بازگشت، افزودن فایل).
 *
 * به‌علاوه‌ی `ghost` (کنشِ متنی بی‌قاب) و `danger` (لغو و حذف).
 *
 * ظاهر از کلاس‌های `globals.css` می‌آید نه از این فایل: هیچ رنگی اینجا
 * نوشته نمی‌شود و عوض کردن جهت بصری هیچ `.tsx` را دست نمی‌زند.
 */
const VARIANT = {
  primary: "btn-primary",
  outline: "btn-outline",
  quiet: "btn-quiet",
  ghost: "btn-ghost",
  danger: "btn-danger",
} as const;

/**
 * اندازه‌ها از دیزاین درآمده‌اند، نه از یک مقیاس دلخواه:
 * `sm` کنشِ درون‌ردیفی، `md` کنشِ کارت و فرم، `lg` کنشِ قهرمانِ صفحه.
 */
const SIZE = {
  sm: "px-4 py-2 text-[13.5px]",
  md: "",
  lg: "px-8 py-4 text-base",
} as const;

type Shared = {
  variant?: keyof typeof VARIANT;
  size?: keyof typeof SIZE;
  /** تمام‌عرض — در ستون کنار و روی موبایل */
  block?: boolean;
  className?: string;
};

function classes({ variant = "primary", size = "md", block, className }: Shared) {
  return cx(
    VARIANT[variant],
    SIZE[size],
    block && "w-full",
    // `ghost` قاب ندارد، پس تمام‌عرض کردنش بی‌معنی است و متن را وسط
    // می‌اندازد؛ همان‌جا که هست چپ‌چین می‌ماند
    variant === "ghost" && block && "justify-start",
    className,
  );
}

export function Button({
  children,
  busy,
  busyLabel = "کمی صبر کنید…",
  variant,
  size,
  block,
  className,
  ...rest
}: Shared &
  React.ButtonHTMLAttributes<HTMLButtonElement> & {
    /**
     * در حال ارسال. متن با اسپینر عوض می‌شود و دکمه غیرفعال — نه فقط
     * برای بازخورد: بدون غیرفعال شدن، دو کلیک پشت هم دو رزرو می‌سازد.
     */
    busy?: boolean;
    busyLabel?: string;
  }) {
  return (
    <button
      type="button"
      {...rest}
      disabled={rest.disabled || busy}
      className={classes({ variant, size, block, className })}
    >
      {busy ? (
        <>
          <Spinner onIvory={(variant ?? "primary") === "primary"} />
          <span>{busyLabel}</span>
        </>
      ) : (
        children
      )}
    </button>
  );
}

/**
 * همان دکمه، ولی ناوبری.
 *
 * جدا از `Button` است چون `<a>` و `<button>` معنای متفاوتی برای
 * صفحه‌خوان و برای کلیدِ میانیِ ماوس دارند؛ یکی کردنشان با پراپ `as`
 * فقط این تفاوت را پنهان می‌کرد.
 */
export function ButtonLink({
  children,
  href,
  variant,
  size,
  block,
  className,
  ...rest
}: Shared & Omit<React.ComponentProps<typeof Link>, "className">) {
  return (
    <Link
      href={href}
      {...rest}
      className={classes({ variant, size, block, className })}
    >
      {children}
    </Link>
  );
}
