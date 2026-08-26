import { cx } from "@/lib/cx";

/**
 * کارت.
 *
 * دو شعاع دارد و این عمدی است: دیزاین در صفحات عمومی ۱۴ پیکسل و در
 * صفحات پشت لاگین ۱۲ پیکسل می‌گذارد. بازبینی دیزاین (بند B-06) یکی
 * کردنشان را پیشنهاد داده بود ولی فایل‌های نهایی همین دو را دارند و
 * فایل‌ها منبع حقیقت‌اند.
 *
 * `emph` لبه را روشن‌تر می‌کند — برای جلسه‌ای که اتاقش آماده است یا
 * منتظر پرداخت. روی زمینه‌ی تاریک، تأکید با روشنیِ لبه ساخته می‌شود نه
 * با سایه.
 *
 * `hollow` فقط لبه است بدون سطح؛ کارت‌های فرعیِ ستون کنار این شکل‌اند.
 */
export function Card({
  children,
  world = "app",
  emph,
  hollow,
  padded = true,
  className,
  ...rest
}: React.HTMLAttributes<HTMLDivElement> & {
  world?: "site" | "app";
  emph?: boolean;
  hollow?: boolean;
  /** برای کارتی که خودش پنل‌های تودرتو دارد و پدینگ را خودش می‌چیند */
  padded?: boolean;
}) {
  return (
    <div
      {...rest}
      className={cx(
        hollow ? "card-hollow" : "card-app",
        world === "site" && "rounded-card",
        emph && "card-emph",
        padded && "p-5",
        className,
      )}
    >
      {children}
    </div>
  );
}
