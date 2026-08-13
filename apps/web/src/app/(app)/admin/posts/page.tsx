"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { Pager } from "@/components/pager";
import { errorMessage } from "@/lib/api-client";
import {
  ADMIN_PAGE_SIZE,
  deletePost,
  getAdminPosts,
  type AdminPage,
  type AdminPostSummary,
  type PostStatus,
} from "@/lib/app-api";
import { formatJalaliDate } from "@/lib/format";

/**
 * فهرست نوشته‌های بلاگ.
 *
 * فاز ۱ سند معماری انتشار محتوا را از همه‌چیز واجب‌تر می‌داند چون سئو
 * سه تا شش ماه طول می‌کشد. این صفحه برای همین وجود دارد: نوشتن باید
 * بدون دیپلوی و بدون دانستن git ممکن باشد، وگرنه تنها کسی که می‌تواند
 * محتوا منتشر کند همان کسی است که کد را می‌نویسد.
 */

const TABS: Array<{ label: string; value: PostStatus | undefined }> = [
  { label: "همه", value: undefined },
  { label: "منتشرشده", value: "PUBLISHED" },
  { label: "پیش‌نویس", value: "DRAFT" },
];

export default function AdminPostsPage() {
  const [status, setStatus] = useState<PostStatus | undefined>(undefined);
  const [offset, setOffset] = useState(0);
  const [page, setPage] = useState<AdminPage<AdminPostSummary> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setPage(null);
    try {
      setPage(await getAdminPosts({ status, offset, limit: ADMIN_PAGE_SIZE }));
      setError(null);
    } catch (caught) {
      setError(errorMessage(caught));
      setPage({ rows: [], total: 0, limit: ADMIN_PAGE_SIZE, offset: 0 });
    }
  }, [status, offset]);

  useEffect(() => {
    void load();
  }, [load]);

  function changeFilter(value: PostStatus | undefined) {
    setStatus(value);
    setOffset(0);
  }

  async function remove(post: AdminPostSummary) {
    /**
     * تأیید می‌گیرد و اسلاگ را در پیام می‌آورد.
     *
     * حذف نوشته‌ی منتشرشده یعنی یک نشانی که ممکن است ماه‌ها در گوگل
     * ایندکس شده باشد، ۴۰۴ شود — و آن اعتبار برنمی‌گردد.
     */
    const warning =
      post.status === "PUBLISHED"
        ? "\nاین نوشته منتشر شده است؛ نشانی‌اش در گوگل ۴۰۴ می‌شود."
        : "";

    if (!window.confirm(`«${post.title}» حذف شود؟${warning}`)) return;

    setBusyId(post.id);
    setError(null);
    try {
      await deletePost(post.id);
      await load();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusyId(null);
    }
  }

  const posts = page?.rows ?? null;

  return (
    <div className="mx-auto max-w-4xl px-5 py-12">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl leading-snug">بلاگ</h1>
        <Link href="/admin/posts/new" className="btn-primary">
          نوشته‌ی تازه
        </Link>
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        {TABS.map((tab) => (
          <button
            key={tab.label}
            type="button"
            onClick={() => changeFilter(tab.value)}
            className={
              status === tab.value
                ? "rounded-full bg-accent px-4 py-1.5 text-sm text-accent-ink"
                : "rounded-full border border-border px-4 py-1.5 text-sm text-ink-muted"
            }
          >
            {tab.label}
          </button>
        ))}
      </div>

      {error ? <p className="alert-error mt-6">{error}</p> : null}

      {posts === null ? (
        <p className="mt-8 text-sm text-ink-muted">در حال بارگذاری…</p>
      ) : posts.length === 0 ? (
        <p className="alert-info mt-8">نوشته‌ای با این فیلتر پیدا نشد.</p>
      ) : (
        <ul className="mt-8 space-y-3">
          {posts.map((post) => (
            <li key={post.id} className="card">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-medium">{post.title}</p>
                  <p className="mt-1 text-sm text-ink-muted" dir="ltr">
                    /blog/{post.slug}
                  </p>
                </div>

                <span
                  className={
                    post.status === "PUBLISHED" ? "badge badge-ok" : "badge badge-wait"
                  }
                >
                  {post.status === "PUBLISHED" ? "منتشرشده" : "پیش‌نویس"}
                </span>
              </div>

              <p className="mt-3 text-sm text-ink-muted">{post.excerpt}</p>

              <div className="mt-4 flex flex-wrap items-center gap-4 text-sm">
                <Link href={`/admin/posts/${post.id}`} className="text-accent underline">
                  ویرایش
                </Link>

                {/*
                  پیش‌نویس لینک «دیدن» ندارد: مسیر عمومی آن را نمی‌دهد و
                  لینکی که به ۴۰۴ می‌رسد فقط سردرگمی می‌سازد.
                */}
                {post.status === "PUBLISHED" ? (
                  <a
                    href={`/blog/${post.slug}`}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="text-ink-muted underline"
                  >
                    دیدن در سایت
                  </a>
                ) : null}

                <button
                  type="button"
                  onClick={() => void remove(post)}
                  disabled={busyId === post.id}
                  className="text-danger underline"
                >
                  حذف
                </button>

                {post.publishedAt ? (
                  <span className="text-ink-muted">
                    {formatJalaliDate(post.publishedAt.slice(0, 10))}
                  </span>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}

      {page ? (
        <Pager
          total={page.total}
          limit={page.limit}
          offset={page.offset}
          busy={busyId !== null}
          onChange={setOffset}
        />
      ) : null}
    </div>
  );
}
