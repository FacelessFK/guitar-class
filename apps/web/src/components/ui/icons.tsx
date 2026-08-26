/**
 * آیکون‌ها.
 *
 * دیزاین Phosphor را انتخاب کرده و مسیرهایش را inline داخل هر صفحه
 * گذاشته بود. اینجا همان مسیرها یک جا جمع شده‌اند — بسته‌ی
 * `@phosphor-icons/react` نصب نشد چون کل محصول به حدود دوازده آیکون
 * نیاز دارد و آن بسته یک درخت چندهزارتایی می‌آورد که ترشیکینگ هم
 * کاملاً از پسش برنمی‌آید.
 *
 * همه `fill="currentColor"` و `aria-hidden` هستند: آیکون‌های این محصول
 * همیشه کنار متن می‌آیند یا دکمه‌شان `aria-label` دارد، پس تکرارشان
 * برای صفحه‌خوان نویز است.
 *
 * با هر فاز آیکون‌های تازه به همین فایل اضافه می‌شوند.
 */
type IconProps = {
  size?: number;
  className?: string;
};

function Svg({
  size = 18,
  className,
  children,
}: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 256 256"
      fill="currentColor"
      aria-hidden="true"
      className={className}
    >
      {children}
    </svg>
  );
}

export function BellIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M221.8 175.9c-5.6-9.6-13.8-36.7-13.8-71.9a80 80 0 0 0-160 0c0 35.2-8.3 62.3-13.9 71.9A16 16 0 0 0 48 200h40.2a40 40 0 0 0 79.6 0H208a16 16 0 0 0 13.8-24.1M128 216a24 24 0 0 1-23.4-16h46.8a24 24 0 0 1-23.4 16" />
    </Svg>
  );
}

export function ChevronDownIcon(props: IconProps) {
  return (
    <Svg size={12} {...props}>
      <path d="M213.7 101.7l-80 80a8 8 0 0 1-11.4 0l-80-80A8 8 0 0 1 48 88h160a8 8 0 0 1 5.7 13.7" />
    </Svg>
  );
}

export function SignOutIcon(props: IconProps) {
  return (
    <Svg size={16} {...props}>
      <path d="M112 216a8 8 0 0 1-8 8H48a16 16 0 0 1-16-16V48a16 16 0 0 1 16-16h56a8 8 0 0 1 0 16H48v160h56a8 8 0 0 1 8 8m109.7-93.7-40-40a8 8 0 0 0-11.4 11.4L196.7 120H104a8 8 0 0 0 0 16h92.7l-26.4 26.3a8 8 0 0 0 11.4 11.4l40-40a8 8 0 0 0 0-11.4" />
    </Svg>
  );
}

export function CalendarIcon(props: IconProps) {
  return (
    <Svg size={14} {...props}>
      <path d="M208 32h-24v-8a8 8 0 0 0-16 0v8H88v-8a8 8 0 0 0-16 0v8H48a16 16 0 0 0-16 16v160a16 16 0 0 0 16 16h160a16 16 0 0 0 16-16V48a16 16 0 0 0-16-16m0 176H48V96h160z" />
    </Svg>
  );
}

export function ClockIcon(props: IconProps) {
  return (
    <Svg size={14} {...props}>
      <path d="M128 24a104 104 0 1 0 104 104A104.1 104.1 0 0 0 128 24m56 112h-56a8 8 0 0 1-8-8V72a8 8 0 0 1 16 0v48h48a8 8 0 0 1 0 16" />
    </Svg>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <Svg size={13} {...props}>
      <path d="M104 192a8 8 0 0 1-5.7-2.3l-56-56a8 8 0 0 1 11.4-11.4L104 172.7 210.3 66.3a8 8 0 0 1 11.4 11.4l-112 112A8 8 0 0 1 104 192" />
    </Svg>
  );
}
