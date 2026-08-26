import Link from "next/link";

/**
 * پابرگ عمومی.
 *
 * چهار ستون که با `auto-fit` روی موبایل یکی می‌شوند، و دو خط
 * محوشونده — یکی بالای کل پابرگ و یکی بالای سطر کپی‌رایت.
 *
 * «قوانین و سیاست لغو» تنها افزودنیِ ما به پابرگ تأییدشده است. دلیلش:
 * متن رزرو، داشبورد و سوالات متداول سیاست لغو را به‌عنوان دلیل اعتماد
 * نقل می‌کنند و در دیزاین هیچ‌جا لینک نشده بود (بازبینی، بند C-06).
 */
const COLUMNS = [
  {
    title: "دسترسی سریع",
    links: [
      { href: "/teachers", label: "استادها" },
      { href: "/instruments", label: "سازها" },
      { href: "/how-it-works", label: "نحوه کار" },
    ],
  },
  {
    title: "یادگیری",
    links: [
      { href: "/blog", label: "مقاله‌ها" },
      { href: "/faq", label: "سوالات متداول" },
    ],
  },
  {
    title: "هوگه",
    links: [
      { href: "/about", label: "درباره هوگه" },
      { href: "/rules", label: "قوانین و سیاست لغو" },
      { href: "/auth/login", label: "ورود / ثبت‌نام" },
    ],
  },
] as const;

export function PublicFooter() {
  return (
    <footer className="rule-top mt-auto">
      <div className="mx-auto grid max-w-[1160px] gap-6.5 px-4.5 py-9 [grid-template-columns:repeat(auto-fit,minmax(240px,1fr))] md:gap-8 md:px-6 md:py-11">
        <div className="max-w-[34ch]">
          <p className="mb-2.5 text-[22px] font-bold text-ink">هوگه</p>
          <p className="text-[15px] leading-[1.9] text-ink-2">
            یادگیری موسیقی به شیوه‌ی حرفه‌ای و دلنشین — کلاس خصوصی آنلاین،
            یک‌به‌یک و زنده.
          </p>
        </div>

        {COLUMNS.map((col) => (
          <nav key={col.title} className="flex flex-col gap-2.5 text-[15px]">
            <p className="text-[13px] tracking-[0.08em] text-meta">{col.title}</p>
            {col.links.map((link) => (
              <Link key={link.href} href={link.href} className="py-1.75 md:py-0">
                {link.label}
              </Link>
            ))}
          </nav>
        ))}
      </div>

      <div className="rule-top">
        <p className="mx-auto max-w-[1160px] px-4.5 py-4 text-xs text-meta md:px-6">
          © هوگه — تمامی حقوق محفوظ است.
        </p>
      </div>
    </footer>
  );
}
