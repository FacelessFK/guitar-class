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

export function ChatIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M128 24a104 104 0 0 0-91 154.9l-9.8 34.2a16 16 0 0 0 19.8 19.8l34.3-9.8A104 104 0 1 0 128 24m0 192a88 88 0 0 1-44.3-12 8 8 0 0 0-6.2-.7l-34.2 9.8 9.8-34.2a8 8 0 0 0-.7-6.2A88 88 0 1 1 128 216M84 116a12 12 0 1 0 12 12 12 12 0 0 0-12-12m44 0a12 12 0 1 0 12 12 12 12 0 0 0-12-12m44 0a12 12 0 1 0 12 12 12 12 0 0 0-12-12" />
    </Svg>
  );
}

export function CreditCardIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M224 48H32a16 16 0 0 0-16 16v128a16 16 0 0 0 16 16h192a16 16 0 0 0 16-16V64a16 16 0 0 0-16-16m0 16v24H32V64zm0 128H32v-88h192zm-16-24a8 8 0 0 1-8 8h-32a8 8 0 0 1 0-16h32a8 8 0 0 1 8 8" />
    </Svg>
  );
}

export function VideoIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M251.8 73a8 8 0 0 0-8.1.3l-40.3 25.6A16 16 0 0 0 188 80H32a16 16 0 0 0-16 16v96a16 16 0 0 0 16 16h156a16 16 0 0 0 15.4-18.9l40.3 25.6a8 8 0 0 0 12.3-6.7V80a8 8 0 0 0-4.2-7M188 192H32V96h156zm52 13.4-36-22.8v-53.2l36-22.8z" />
    </Svg>
  );
}

export function LockIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M208 80h-28V56a52 52 0 0 0-104 0v24H48a16 16 0 0 0-16 16v112a16 16 0 0 0 16 16h160a16 16 0 0 0 16-16V96a16 16 0 0 0-16-16M92 56a36 36 0 0 1 72 0v24H92Zm116 152H48V96h160z" />
    </Svg>
  );
}

export function PencilIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M227.3 76.7 179.3 28.7a16 16 0 0 0-22.6 0l-120 120A15.9 15.9 0 0 0 32 160v48a16 16 0 0 0 16 16h48a15.9 15.9 0 0 0 11.3-4.7l120-120a16 16 0 0 0 0-22.6M96 208H48v-48l88-88 48 48Z" />
    </Svg>
  );
}

export function TrashIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M216 48h-36V36a20 20 0 0 0-20-20H96a20 20 0 0 0-20 20v12H40a8 8 0 0 0 0 16h8v144a16 16 0 0 0 16 16h128a16 16 0 0 0 16-16V64h8a8 8 0 0 0 0-16M92 36a4 4 0 0 1 4-4h64a4 4 0 0 1 4 4v12H92Zm100 172H64V64h128Z" />
    </Svg>
  );
}

export function EyeIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M247.3 124.8c-.4-.8-8.9-19.6-27.7-38.5C194.5 61.3 162.8 48 128 48S61.5 61.3 36.4 86.3C17.6 105.2 9 124 8.7 124.8a8 8 0 0 0 0 6.5c.3.7 8.9 19.5 27.7 38.4 25.1 25 56.8 38.3 91.6 38.3s66.5-13.3 91.6-38.3c18.8-18.9 27.4-37.7 27.7-38.4a8 8 0 0 0 0-6.5M128 192c-30.8 0-57.7-11.2-79.9-33.3A130.6 130.6 0 0 1 25 128c3.6-6.8 20.5-36 55.6-52.7a48 48 0 0 0 94.8 0c35.1 16.7 52 46 55.6 52.7-8.4 15.8-40.1 64-103 64" />
    </Svg>
  );
}

export function EyeSlashIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M53.9 34.6a8 8 0 0 0-11.8 10.8l19.2 21.1C25 88.8 9.4 123.2 8.7 124.8a8 8 0 0 0 0 6.5c.3.7 8.8 19.5 27.6 38.4 25.1 25 56.8 38.3 91.7 38.3a123 123 0 0 0 50.1-10.1l22 24.2a8 8 0 1 0 11.8-10.8zM128 192c-30.8 0-57.7-11.2-79.9-33.3A128.3 128.3 0 0 1 25 128c4.7-8.8 19.3-33 46.9-48.4l20.9 23a48 48 0 0 0 63.3 69.7l15.2 16.7A103 103 0 0 1 128 192m119.3-60.7c-.4.9-11 24.3-33.9 45.3a8 8 0 1 1-10.8-11.8A130.6 130.6 0 0 0 231 128c-6-11.2-23.6-38.2-53.3-51.8A79.7 79.7 0 0 0 128 64a91 91 0 0 0-19.6 2.1 8 8 0 0 1-3.5-15.6A107 107 0 0 1 128 48c34.9 0 66.6 13.3 91.7 38.3 18.8 18.9 27.3 37.7 27.6 38.4a8 8 0 0 1 0 6.6" />
    </Svg>
  );
}
