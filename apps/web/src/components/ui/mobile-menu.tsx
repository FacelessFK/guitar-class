import Link from "next/link";

import { cx } from "@/lib/cx";

/**
 * منوی موبایل.
 *
 * `<details>` است نه استیتِ React — و این تصمیم مهمی است: پوسته‌ی
 * عمومی باید کامپوننت سروری بماند تا صفحات SSG جاوااسکریپت اضافه
 * نگیرند. باز و بسته شدن، کیبورد و صفحه‌خوان همه مجانی از خودِ HTML
 * می‌آید.
 *
 * دکمه‌ی همبرگری سه خط را با `box-shadow` می‌سازد نه سه `<span>`:
 * همان کاری که دیزاین می‌کند و یک عنصر کمتر.
 */
export function MobileMenu({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <details className={cx("relative md:hidden", className)}>
      <summary
        aria-label={label}
        className="grid size-11 cursor-pointer place-items-center rounded-control text-ink shadow-[inset_0_0_0_1px_var(--color-divider)]"
      >
        <span
          aria-hidden="true"
          className="block h-px w-[18px] bg-current shadow-[0_-5px_0_currentColor,0_5px_0_currentColor]"
        />
      </summary>

      <div className="absolute top-[calc(100%+12px)] end-0 z-40 flex w-[min(80vw,264px)] flex-col rounded-card bg-surface p-2.5 shadow-menu">
        {children}
      </div>
    </details>
  );
}

/**
 * آیتم منوی موبایل.
 *
 * حالت فعال با پرِ `surface-2` مشخص می‌شود نه با خط زیرین — در منوی
 * عمودی خط زیرین با جداکننده اشتباه گرفته می‌شود. پوسته‌ی عمومی به‌جای
 * پر، لبه‌ی بنفشِ سمتِ شروع می‌گذارد؛ هر دو در دیزاین هست.
 */
export function MobileMenuLink({
  href,
  children,
  active,
  tone = "default",
  edge,
}: {
  href: React.ComponentProps<typeof Link>["href"];
  children: React.ReactNode;
  active?: boolean;
  /** `violet` برای «ورود»، `quiet` برای «خروج» */
  tone?: "default" | "violet" | "quiet";
  /** لبه‌ی بنفشِ سمتِ شروع به‌جای پر — شکلِ پوسته‌ی عمومی */
  edge?: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cx(
        "rounded-control px-3.5 py-3 text-[15.5px]",
        active
          ? edge
            ? "text-ink shadow-[inset_2px_0_0_var(--color-violet)]"
            : "bg-surface-2 text-ink"
          : tone === "violet"
            ? "text-violet-strong"
            : tone === "quiet"
              ? "text-meta"
              : "text-ink-2",
      )}
    >
      {children}
    </Link>
  );
}

/**
 * آیتمِ کنشیِ منوی موبایل.
 *
 * «خروج» لینک نیست — یک کنش است که نشست را پاک می‌کند. با `<a href>`
 * نوشتنش یعنی کلیک وسطِ ماوس و پیش‌واکشیِ مرورگر هم آن را صدا بزنند.
 */
export function MobileMenuButton({
  children,
  tone = "quiet",
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  tone?: "default" | "violet" | "quiet";
}) {
  return (
    <button
      type="button"
      {...rest}
      className={cx(
        "cursor-pointer rounded-control border-0 bg-transparent px-3.5 py-3 text-start text-[15.5px]",
        tone === "violet"
          ? "text-violet-strong"
          : tone === "quiet"
            ? "text-meta"
            : "text-ink-2",
      )}
    >
      {children}
    </button>
  );
}

/** جداکنندهٔ درون منو — توپر، چون داخل یک پنل است نه خطِ آزاد */
export function MobileMenuRule() {
  return <span aria-hidden="true" className="mx-3.5 my-2 h-px bg-divider" />;
}
