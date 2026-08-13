import type { Metadata } from "next";
import Link from "next/link";

import { getPosts, type PostSummary } from "@/lib/api";
import { formatJalaliDate } from "@/lib/format";

/**
 * ⚠️ عدد باید **عینی** نوشته شود — Next تنظیمات سگمنت را ایستا می‌خواند
 * و ثابتِ import‌شده را با «Invalid segment configuration export» رد
 * می‌کند. هم‌تایش در `lib/api.ts` است (`CATALOG_REVALIDATE_SECONDS`).
 */
export const revalidate = 3600;

const title = "مقاله‌های آموزش موسیقی";
const description =
  "راهنماها و نکته‌های تمرین برای هنرجویان ساز، از انتخاب ساز تا تمرین روزانه.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/blog" },
  openGraph: { title, description, type: "website" },
};

/**
 * فهرست نوشته‌ها.
 *
 * فاز ۱ سند معماری انتشار محتوا را از همه‌چیز واجب‌تر می‌داند چون سئو
 * سه تا شش ماه طول می‌کشد. این صفحه نقطه‌ی ورودِ آن محتواست و مهم‌تر از
 * آن، جایی که موتور جست‌وجو همه‌ی نوشته‌ها را از یک صفحه پیدا می‌کند.
 */
export default async function BlogIndexPage() {
  const posts = await getPosts();

  return (
    <article className="mx-auto max-w-3xl px-5 py-12 sm:py-16">
      <h1 className="font-display text-4xl leading-[1.5] sm:text-5xl sm:leading-[1.45]">
        {title}
      </h1>
      <p className="mt-4 text-lg leading-9 text-ink-soft">{description}</p>

      {posts.length === 0 ? (
        <p className="mt-12 text-ink-muted">هنوز نوشته‌ای منتشر نشده است.</p>
      ) : (
        <ul className="mt-10 divide-y divide-border border-y border-border">
          {posts.map((post) => (
            <li key={post.id} className="py-6">
              <PostCard post={post} />
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}

function PostCard({ post }: { post: PostSummary }) {
  return (
    <article>
      <h2 className="text-xl font-bold">
        <Link href={`/blog/${post.slug}`} className="transition-colors hover:text-accent">
          {post.title}
        </Link>
      </h2>

      <p className="mt-2 leading-8 text-ink-muted">{post.excerpt}</p>

      <p className="mt-3 text-sm text-ink-muted">
        {post.publishedAt ? (
          <time dateTime={post.publishedAt}>
            {formatJalaliDate(post.publishedAt.slice(0, 10))}
          </time>
        ) : null}

        {/*
          پیوند به صفحه‌ی ساز، نه فقط برچسب. صفحه‌های ساز مهم‌ترین دارایی
          سئوی پروژه‌اند و هر پیوند از یک نوشته، اعتبار را همان‌جا می‌برد.
        */}
        {post.instrumentSlug ? (
          <>
            {" · "}
            <Link
              href={`/instruments/${post.instrumentSlug}`}
              className="text-accent underline"
            >
              {post.instrumentName}
            </Link>
          </>
        ) : null}
      </p>
    </article>
  );
}
