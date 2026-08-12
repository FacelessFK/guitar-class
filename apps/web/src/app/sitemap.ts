import type { MetadataRoute } from "next";

import { getInstruments, getPostSlugs, getTeachers } from "@/lib/api";

const siteUrl = (): string =>
  process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

/**
 * نقشه‌ی سایت — فقط صفحات عمومی.
 *
 * مسیرهای پشت لاگین (`/dashboard`، `/room`، `/admin`) عمداً اینجا
 * نیستند و در `robots.ts` هم صریحاً بسته شده‌اند.
 *
 * `priority` روی صفحات ساز بالاتر است چون هدف اصلی سئوی پروژه همان‌هاست.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();

  const [instruments, teachers, posts] = await Promise.all([
    getInstruments(),
    getTeachers(),
    getPostSlugs(),
  ]);

  return [
    {
      url: base,
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${base}/teachers`,
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      url: `${base}/blog`,
      changeFrequency: "weekly",
      priority: 0.6,
    },
    {
      url: `${base}/rules`,
      changeFrequency: "yearly",
      priority: 0.3,
    },
    ...instruments.map((instrument) => ({
      url: `${base}/instruments/${instrument.slug}`,
      changeFrequency: "weekly" as const,
      priority: 0.9,
    })),
    ...teachers.map((teacher) => ({
      url: `${base}/teachers/${teacher.slug}`,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    })),
    /**
     * نوشته‌ها `lastModified` واقعی دارند، برخلاف بقیه‌ی مسیرها.
     *
     * برای صفحه‌ای که محتوایش عوض می‌شود این مهم است: خزنده از روی همین
     * تصمیم می‌گیرد صفحه را دوباره بخواند یا نه، و نوشته‌ی اصلاح‌شده‌ای
     * که تاریخش عوض نشود می‌تواند ماه‌ها با نسخه‌ی قدیمی ایندکس بماند.
     *
     * اسلاگ فارسی است و باید کدگذاری شود؛ نقشه‌ی سایتِ خام با
     * کاراکترهای غیر ASCII معتبر نیست.
     */
    ...posts.map((post) => ({
      url: `${base}/blog/${encodeURIComponent(post.slug)}`,
      lastModified: new Date(post.updatedAt),
      changeFrequency: "monthly" as const,
      priority: 0.6,
    })),
  ];
}
