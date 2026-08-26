import { cx } from "@/lib/cx";

/**
 * پیامِ با لبه‌ی کناری.
 *
 * پرتکرارترین الگوی متنیِ دیزاین — بیش از پانزده جا: «هدفون سیمی حتماً
 * وصل باشد»، «بخشی از یک بسته است»، «هنرجو هنوز پرداخت نکرده»،
 * توضیح لغو، مهلت پرداخت.
 *
 * رنگِ لبه معنا دارد و دلبخواه نیست:
 *   `info`  بنفش — اطلاعِ خنثی و وضعیتِ سیستم
 *   `wood`  چوبی — چیزی که کاربر باید حواسش باشد ولی خطا نیست
 *   `error` قرمز — خطا
 *   `quiet` divider — پانویسِ کم‌اهمیت
 */
const TONE = {
  info: "",
  wood: "notice-wood",
  error: "notice-error",
  quiet: "notice-quiet",
} as const;

export function InlineNotice({
  children,
  tone = "info",
  className,
}: {
  children: React.ReactNode;
  tone?: keyof typeof TONE;
  className?: string;
}) {
  return (
    <p className={cx("notice", TONE[tone], className)}>{children}</p>
  );
}
