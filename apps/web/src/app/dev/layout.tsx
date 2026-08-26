import type { Metadata } from "next";

/**
 * شاخه‌ی موقتِ ابزارهای توسعه.
 *
 * بیرون از `(app)` است تا گاردِ ورود نگیرد و بیرون از `(site)` تا
 * پوسته‌ی عمومی رویش نیفتد — گالری باید پریمیتیوها را روی زمینه‌ی خالی
 * نشان دهد نه داخل یک صفحه‌ی واقعی.
 *
 * در پایان فاز ۹ همراه با `dev/ds` حذف می‌شود.
 */
export const metadata: Metadata = {
  title: "سیستم طراحی",
  robots: { index: false, follow: false },
};

export default function DevLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}
