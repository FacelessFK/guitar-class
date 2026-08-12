"use client";

import { use, useEffect, useState } from "react";

import { PostEditor } from "@/components/post-editor";
import { errorMessage } from "@/lib/api-client";
import { getAdminPost, type AdminPostDetail } from "@/lib/app-api";

/**
 * ویرایش یک نوشته.
 *
 * نوشته پیش از رندر ویرایشگر خوانده می‌شود و نه داخل خودش: `PostEditor`
 * مقادیر اولیه را در `useState` می‌گذارد، و اگر داده بعداً برسد آن
 * مقادیر دیگر عوض نمی‌شوند و فرم خالی می‌ماند.
 */
export default function EditPostPage({
  params,
}: {
  params: Promise<{ postId: string }>;
}) {
  const { postId } = use(params);

  const [post, setPost] = useState<AdminPostDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getAdminPost(postId)
      .then(setPost)
      .catch((caught: unknown) => setError(errorMessage(caught)));
  }, [postId]);

  if (error) {
    return (
      <div className="mx-auto max-w-3xl px-5 py-12">
        <p className="alert-error">{error}</p>
      </div>
    );
  }

  if (!post) {
    return (
      <div className="mx-auto max-w-3xl px-5 py-12">
        <p className="text-sm text-ink-muted">در حال بارگذاری…</p>
      </div>
    );
  }

  return <PostEditor post={post} />;
}
