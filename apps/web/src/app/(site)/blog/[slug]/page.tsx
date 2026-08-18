import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { getPost, getPostSlugs, type PostSummary } from "@/lib/api";
import { faNumber, formatJalaliDate } from "@/lib/format";
import { readingMinutes, renderMarkdown } from "@/lib/markdown";

/**
 * ⚠️ عدد باید **عینی** نوشته شود — Next تنظیمات سگمنت را ایستا می‌خواند.
 * هم‌تایش در `lib/api.ts` است (`CATALOG_REVALIDATE_SECONDS`).
 */
export const revalidate = 3600;

/** نوشته‌ی تازه‌ای که هنوز بیلد نشده باید کار کند، نه ۴۰۴. */
export const dynamicParams = true;

export async function generateStaticParams(): Promise<{ slug: string }[]> {
  const slugs = await getPostSlugs();
  return slugs.map((row) => ({ slug: row.slug }));
}

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const { post } = await getPost(slug);

  if (!post) return {};

  return {
    title: post.title,
    description: post.excerpt,
    alternates: { canonical: `/blog/${post.slug}` },
    openGraph: {
      title: post.title,
      description: post.excerpt,
      type: "article",
      publishedTime: post.publishedAt ?? undefined,
      modifiedTime: post.updatedAt,
      ...(post.coverUrl ? { images: [post.coverUrl] } : {}),
    },
  };
}

export default async function BlogPostPage({ params }: PageProps) {
  const { slug } = await params;
  const { post, related } = await getPost(slug);

  if (!post) notFound();

  const html = renderMarkdown(post.content);

  return (
    <>
      <ArticleJsonLd
        title={post.title}
        description={post.excerpt}
        authorName={post.authorName}
        publishedAt={post.publishedAt}
        updatedAt={post.updatedAt}
        coverUrl={post.coverUrl}
        slug={post.slug}
      />

      <article className="mx-auto max-w-3xl px-5 py-16">
        <h1 className="text-3xl font-bold sm:text-4xl">{post.title}</h1>

        <p className="mt-4 text-sm text-ink-muted">
          {post.authorName}
          {post.publishedAt ? (
            <>
              {" · "}
              <time dateTime={post.publishedAt}>
                {formatJalaliDate(post.publishedAt.slice(0, 10))}
              </time>
            </>
          ) : null}
          {` · ${faNumber(readingMinutes(post.content))} دقیقه مطالعه`}
        </p>

        {post.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- نشانی از باکت می‌آید و دامنه‌اش با محیط عوض می‌شود؛ next/image پیکربندی دامنه می‌خواهد
          <img
            src={post.coverUrl}
            alt=""
            className="mt-8 w-full rounded-lg object-cover"
          />
        ) : null}

        {/*
          محتوا فقط از پنل ادمین می‌آید و ادمین از قبل به داده‌ی مالی
          دسترسی دارد، پس HTML دلخواه چیزی به دسترسی‌اش اضافه نمی‌کند.
          اگر روزی نوشتن به نویسنده‌ی بیرونی باز شود، این تصمیم باید
          بازبینی شود — جزئیاتش در `lib/markdown.ts`.
        */}
        <div className="prose-fa mt-8" dangerouslySetInnerHTML={{ __html: html }} />

        {post.instrumentSlug ? (
          <p className="mt-12 rounded-lg bg-surface-muted p-4 text-sm">
            می‌خواهید {post.instrumentName} یاد بگیرید؟{" "}
            <Link
              href={`/instruments/${post.instrumentSlug}`}
              className="text-accent-strong underline"
            >
              کلاس آنلاین {post.instrumentName}
            </Link>{" "}
            — جلسه‌ی معارفه‌ی اول رایگان است.
          </p>
        ) : null}

        {related.length > 0 ? (
          <section className="mt-12 border-t border-border pt-8">
            <h2 className="text-lg font-bold">بیشتر بخوانید</h2>
            <ul className="mt-4 space-y-3">
              {related.map((item: PostSummary) => (
                <li key={item.id}>
                  <Link href={`/blog/${item.slug}`} className="text-accent-strong underline">
                    {item.title}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </article>
    </>
  );
}

/**
 * اسکیمای `Article` برای نتایج غنی گوگل.
 *
 * `dangerouslySetInnerHTML` تنها راه تزریق JSON-LD است؛ محتوایش از
 * `JSON.stringify` می‌آید و ورودی خام داخلش نمی‌رود.
 */
function ArticleJsonLd({
  title,
  description,
  authorName,
  publishedAt,
  updatedAt,
  coverUrl,
  slug,
}: {
  title: string;
  description: string;
  authorName: string;
  publishedAt: string | null;
  updatedAt: string;
  coverUrl: string | null;
  slug: string;
}) {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

  const schema = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: title,
    description,
    inLanguage: "fa-IR",
    author: { "@type": "Person", name: authorName },
    // تاریخ انتشار همان لحظه‌ی منتشر شدن است، نه ساخته شدن — و
    // ویرایش‌های بعدی جابه‌جایش نمی‌کنند
    ...(publishedAt ? { datePublished: publishedAt } : {}),
    dateModified: updatedAt,
    ...(coverUrl ? { image: coverUrl } : {}),
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": `${siteUrl}/blog/${slug}`,
    },
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}
