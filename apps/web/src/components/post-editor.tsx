"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { errorMessage } from "@/lib/api-client";
import {
  createPost,
  getInstruments,
  updatePost,
  uploadFile,
  type AdminPostDetail,
  type Instrument,
  type PostStatus,
} from "@/lib/app-api";

/**
 * ویرایشگر نوشته — یکی برای ساخت و ویرایش.
 *
 * دو نسخه‌ی جدا یعنی هر فیلد تازه‌ای دو بار اضافه شود و اولین فراموشی،
 * فیلدی بسازد که فقط در یکی از دو مسیر قابل تنظیم است.
 *
 * متن مارک‌داون است و در یک `textarea` نوشته می‌شود، نه ویرایشگر غنی.
 * ویرایشگر غنی HTML تولید می‌کند و آن HTML بعداً منبع حقیقت می‌شود —
 * قالبش را نمی‌شود عوض کرد، پاک‌سازی‌اش سخت است، و انتقالش به هر جای
 * دیگری یعنی از نو نوشتن. مارک‌داون متن ساده می‌ماند.
 */
export function PostEditor({ post }: { post?: AdminPostDetail }) {
  const router = useRouter();

  const [slug, setSlug] = useState(post?.slug ?? "");
  const [title, setTitle] = useState(post?.title ?? "");
  const [excerpt, setExcerpt] = useState(post?.excerpt ?? "");
  const [content, setContent] = useState(post?.content ?? "");
  const [instrumentId, setInstrumentId] = useState(post?.instrumentId ?? "");
  const [status, setStatus] = useState<PostStatus>(post?.status ?? "DRAFT");
  const [coverUrl, setCoverUrl] = useState(post?.coverUrl ?? null);

  const [instruments, setInstruments] = useState<Instrument[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const coverInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getInstruments()
      .then(setInstruments)
      // فهرست سازها اختیاری است؛ نبودنش نباید جلوی نوشتن را بگیرد
      .catch(() => setInstruments([]));
  }, []);

  async function save(nextStatus: PostStatus) {
    setBusy(true);
    setError(null);

    const body = {
      slug: slug.trim(),
      title: title.trim(),
      excerpt: excerpt.trim(),
      content: content.trim(),
      instrumentId: instrumentId || null,
      status: nextStatus,
    };

    try {
      if (post) {
        await updatePost(post.id, body);
        setStatus(nextStatus);
        router.refresh();
      } else {
        const created = await createPost(body);
        // بعد از ساخت به صفحه‌ی ویرایشِ همان نوشته می‌رود، نه به فهرست:
        // تصویر شاخص شناسه‌ی نوشته را لازم دارد
        router.replace(`/admin/posts/${created.id}`);
      }
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  /**
   * تصویر شاخص جدا از بقیه‌ی فرم ذخیره می‌شود.
   *
   * بلیت آپلود یک‌بارمصرف است و به کاربر گره خورده؛ نگه داشتنش تا
   * «ذخیره» یعنی اگر کاربر فرم را رها کند، فایل آپلودشده در باکت یتیم
   * بماند. با ذخیره‌ی بلافاصله، حذف تصویر قبلی هم همان لحظه انجام
   * می‌شود.
   */
  async function handleCover(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file || !post) return;

    setBusy(true);
    setError(null);

    try {
      const coverObjectKey = await uploadFile(file, "POST_COVER");
      const updated = await updatePost(post.id, { coverObjectKey });
      setCoverUrl(updated.coverUrl);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
      if (coverInput.current) coverInput.current.value = "";
    }
  }

  async function removeCover() {
    if (!post) return;

    setBusy(true);
    setError(null);
    try {
      const updated = await updatePost(post.id, { coverObjectKey: null });
      setCoverUrl(updated.coverUrl);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  const complete =
    slug.trim().length > 0 &&
    title.trim().length > 0 &&
    excerpt.trim().length > 0 &&
    content.trim().length > 0;

  return (
    <div className="mx-auto max-w-3xl px-5 py-12">
      <h1 className="text-2xl font-bold">
        {post ? "ویرایش نوشته" : "نوشته‌ی تازه"}
      </h1>

      {error ? <p className="alert-error mt-6">{error}</p> : null}

      <div className="mt-8 space-y-6">
        <div>
          <label className="label" htmlFor="title">
            عنوان
          </label>
          <input
            id="title"
            className="input"
            value={title}
            maxLength={200}
            disabled={busy}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="چطور گیتار کلاسیک را از صفر شروع کنیم"
          />
        </div>

        <div>
          <label className="label" htmlFor="slug">
            نشانی
          </label>
          <input
            id="slug"
            className="input"
            value={slug}
            maxLength={200}
            disabled={busy}
            onChange={(event) => setSlug(event.target.value)}
            placeholder="شروع-گیتار-کلاسیک"
          />
          {/*
            اسلاگ فارسی عمدی است — سند معماری می‌خواهدش. هشدارِ عوض
            کردن هم عمدی است: نشانی نوشته همان چیزی است که ماه‌ها طول
            کشیده تا در گوگل رتبه بگیرد.
          */}
          <p className="mt-2 text-xs text-ink-muted">
            فارسی مجاز است. بدون اسلش، نقطه و فاصله.
            {post?.status === "PUBLISHED"
              ? " عوض کردن نشانی، رتبه‌ی گوگل و لینک‌های بیرونی را از بین می‌برد."
              : null}
          </p>
        </div>

        <div>
          <label className="label" htmlFor="excerpt">
            خلاصه
          </label>
          <textarea
            id="excerpt"
            className="input min-h-20"
            value={excerpt}
            maxLength={500}
            disabled={busy}
            onChange={(event) => setExcerpt(event.target.value)}
          />
          <p className="mt-2 text-xs text-ink-muted">
            همین متن در فهرست و در نتیجه‌ی گوگل دیده می‌شود. یک تا دو جمله.
          </p>
        </div>

        <div>
          <label className="label" htmlFor="instrument">
            ساز مرتبط
          </label>
          <select
            id="instrument"
            className="input"
            value={instrumentId}
            disabled={busy}
            onChange={(event) => setInstrumentId(event.target.value)}
          >
            <option value="">—</option>
            {instruments.map((instrument) => (
              <option key={instrument.id} value={instrument.id}>
                {instrument.nameFa}
              </option>
            ))}
          </select>
          <p className="mt-2 text-xs text-ink-muted">
            نوشته و صفحه‌ی ساز به هم لینک می‌شوند؛ صفحه‌ی ساز مهم‌ترین
            دارایی سئوی پروژه است.
          </p>
        </div>

        <div>
          <label className="label" htmlFor="content">
            متن (مارک‌داون)
          </label>
          <textarea
            id="content"
            className="input min-h-96 font-mono text-sm"
            value={content}
            disabled={busy}
            onChange={(event) => setContent(event.target.value)}
            placeholder={"## سرفصل\n\nمتن پاراگراف.\n\n- نکته‌ی اول\n- نکته‌ی دوم"}
          />
        </div>

        {post ? (
          <div>
            <p className="label">تصویر شاخص</p>

            {coverUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- نشانی از باکت می‌آید و دامنه‌اش با محیط عوض می‌شود
              <img
                src={coverUrl}
                alt=""
                className="mb-3 max-h-48 rounded-lg object-cover"
              />
            ) : null}

            <input
              ref={coverInput}
              className="input"
              type="file"
              accept="image/*"
              disabled={busy}
              onChange={(event) => void handleCover(event)}
            />

            {coverUrl ? (
              <button
                type="button"
                className="btn-danger mt-3"
                disabled={busy}
                onClick={() => void removeCover()}
              >
                برداشتن تصویر
              </button>
            ) : null}
          </div>
        ) : (
          <p className="alert-info">
            تصویر شاخص پس از ذخیره‌ی اولین نسخه اضافه می‌شود.
          </p>
        )}

        <div className="flex flex-wrap gap-3 border-t border-border pt-6">
          <button
            type="button"
            className="btn-secondary"
            disabled={busy || !complete}
            onClick={() => void save("DRAFT")}
          >
            {status === "PUBLISHED" ? "برگرداندن به پیش‌نویس" : "ذخیره‌ی پیش‌نویس"}
          </button>

          <button
            type="button"
            className="btn-primary"
            disabled={busy || !complete}
            onClick={() => void save("PUBLISHED")}
          >
            {status === "PUBLISHED" ? "ذخیره و انتشار" : "انتشار"}
          </button>

          {busy ? <span className="self-center text-sm text-ink-muted">در حال ذخیره…</span> : null}
        </div>
      </div>
    </div>
  );
}
