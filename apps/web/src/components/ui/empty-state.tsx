import { cx } from "@/lib/cx";

import { Mark } from "@/components/ui/mark";

/**
 * حالت خالی.
 *
 * سیزده حالت خالی در نُه صفحه‌ی دیزاین وجود دارد و بازبینی خودِ دیزاین
 * می‌گوید همه یک شکل‌اند و همین باید قالبِ حالت‌های جامانده هم باشد:
 * **خط چوبی، یک سطر، یک کنش — نه بیشتر**.
 *
 * `quiet` برای حالت‌هایی است که خبرِ بد نیستند و نباید سنگین دیده شوند
 * («تمرینی منتظر بازخورد نیست») — علامت چوبی برداشته می‌شود و عنوان
 * کوچک‌تر است.
 */
export function EmptyState({
  title,
  children,
  action,
  quiet,
  className,
}: {
  title: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
  quiet?: boolean;
  className?: string;
}) {
  return (
    <div className={cx("max-w-[46ch]", className)}>
      {!quiet && <Mark width="xl" className="mb-5" />}
      <p
        className={cx(
          "text-ink",
          quiet ? "text-[15.5px]" : "text-lg font-semibold leading-[1.6]",
        )}
      >
        {title}
      </p>
      {children && (
        <p className="mt-2.5 text-[15px] leading-[1.95] text-ink-2 text-pretty">
          {children}
        </p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
