import type { MetadataRoute } from "next";

const siteUrl = (): string =>
  process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

/**
 * مسیرهای پشت لاگین از ایندکس بیرون‌اند.
 *
 * محتوایشان بدون توکن قابل دیدن نیست، ولی خزنده نباید وقتش را رویشان
 * بگذارد و آدرس اتاق کلاس هم اصلاً نباید در نتایج جست‌وجو ظاهر شود.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/dashboard", "/teacher", "/admin", "/room", "/auth"],
      },
    ],
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
