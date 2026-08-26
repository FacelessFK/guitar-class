import { cx } from "@/lib/cx";

/**
 * علامتِ بخش — موتیف «سیم ساز».
 *
 * خط کوتاهی که پیش از برچسب هر بخش می‌آید و در هر ۲۳ صفحه‌ی دیزاین
 * تکرار می‌شود. بازبینی دیزاین (بند B-05) قطعی کرده که علامتِ بخش
 * **چوبی** است و بنفش برای وضعیت و تعامل می‌ماند؛ `divider` هم برای
 * بخش‌های فرعی و آرام است («گذشته» در داشبورد، «انجام‌شده‌ها» در
 * تمرین‌ها).
 *
 * چون خط است نه متن، `wood` و `violet` (و نه `wood-light` و
 * `violet-strong`) درست‌اند — همان قاعده‌ی توکن‌ها، از سمت درست.
 */
const TONE = {
  wood: "bg-wood",
  violet: "bg-violet",
  divider: "bg-divider",
} as const;

/**
 * علامتِ سرصفحه محو می‌شود، علامتِ بخش توپر است.
 *
 * تفاوتِ عمدیِ دیزاین: بالای هر صفحه‌ی عمومی خطِ ۴۰ پیکسلیِ گرادیانی
 * می‌آید و درونِ صفحه خطِ کوتاهِ توپر. اولی «شروعِ صفحه» را اعلام
 * می‌کند و دومی «شروعِ بخش» را.
 */
const FADE = {
  wood: "[background:linear-gradient(to_left,transparent,var(--color-wood))]",
  violet: "[background:linear-gradient(to_left,transparent,var(--color-violet))]",
  divider: "[background:linear-gradient(to_left,transparent,var(--color-divider))]",
} as const;

/** عرض‌های واقعیِ دیزاین. عدد دلخواه اضافه نکن — یکی از این‌ها را بردار. */
const WIDTH = {
  xs: "w-3", // ۱۲px — قیمت کارت ساز، ردیف بازگشتی
  sm: "w-4", // ۱۶px — کارت‌های ستون کنار
  md: "w-5", // ۲۰px — برچسب بخش در صفحات پشت لاگین
  lg: "w-7", // ۲۸px — برچسب بخش در صفحات عمومی
  xl: "w-11", // ۴۴px — بالای حالت خالی
  hero: "w-10", // ۴۰px — برچسبِ سرصفحه
  full: "w-18", // ۷۲px — علامتِ محوشونده‌ی پیش از تیتر بسته
} as const;

export function Mark({
  tone = "wood",
  width = "lg",
  fade,
  className,
}: {
  tone?: keyof typeof TONE;
  width?: keyof typeof WIDTH;
  /** گرادیانِ محوشونده به‌جای خطِ توپر — علامتِ سرصفحه */
  fade?: boolean;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cx(
        "block h-px shrink-0",
        fade ? FADE[tone] : TONE[tone],
        WIDTH[width],
        className,
      )}
    />
  );
}

/**
 * برچسب بخش: علامت + متنِ ریزِ با فاصله‌ی حروف.
 *
 * اندازه و رنگِ متن ثابت است (۱۳px، `meta`) و در دیزاین هیچ‌جا عوض
 * نمی‌شود — پس پراپ نگرفت. عنوانِ خودِ بخش جدا و زیر این می‌آید.
 */
export function SectionMark({
  children,
  tone = "wood",
  width = "lg",
  fade,
  hero,
  className,
}: {
  children: React.ReactNode;
  tone?: keyof typeof TONE;
  width?: keyof typeof WIDTH;
  fade?: boolean;
  /** برچسبِ سرصفحه: خطِ محوشونده‌ی ۴۰ پیکسلی و فاصله‌ی حروفِ بازتر */
  hero?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cx(
        "flex items-center text-[13px]",
        hero ? "gap-3.5 tracking-[0.1em]" : "gap-3 tracking-[0.08em]",
        // یک کلاسِ رنگ و نه دو تا: با روی‌هم گذاشتنِ `text-meta` و
        // `text-wood-light` برنده به ترتیبِ تولیدِ CSS بستگی داشت، نه به
        // ترتیبِ رشته — و آن ترتیب تضمینی نیست
        hero && tone === "wood" ? "text-wood-light" : "text-meta",
        className,
      )}
    >
      <Mark
        tone={tone}
        width={hero ? "hero" : width}
        fade={fade ?? hero}
      />
      <span>{children}</span>
    </div>
  );
}
