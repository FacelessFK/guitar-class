"use client";

import { useState } from "react";

import { errorMessage } from "@/lib/api-client";
import { submitReview } from "@/lib/app-api";

/**
 * فرمِ امتیاز و نظرِ هنرجو به استاد، پای یک جلسه‌ی تمام‌شده.
 *
 * فقط وقتی رندر می‌شود که `canReview` رزرو درست باشد — پس اینجا دیگر
 * شرطِ «تمام‌شده و بی‌نظر» تکرار نمی‌شود؛ آن یک بار سمت سرور سنجیده شده.
 *
 * پس از ثبت، فرم جای خود را به یک پیامِ تشکر می‌دهد و برنمی‌گردد: نظر
 * یک بار برای هر جلسه است و نشان دادنِ دوباره‌ی فرم فقط به خطای «قبلاً
 * ثبت شده» می‌رسید.
 */
export function ReviewForm({
  bookingId,
  teacherName,
}: {
  bookingId: string;
  teacherName: string;
}) {
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (rating < 1) {
      setError("لطفاً امتیازتان را با ستاره‌ها مشخص کنید.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await submitReview({
        bookingId,
        rating,
        comment: comment.trim() || undefined,
      });
      setDone(true);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <section className="card mt-8 bg-surface-muted">
        <h2 className="font-bold">نظرتان ثبت شد</h2>
        <p className="mt-2 text-sm text-ink-muted">
          ممنون که تجربه‌تان را نوشتید؛ به هنرجوهای بعدی کمک می‌کند.
        </p>
      </section>
    );
  }

  // نمایشِ ستاره‌ها: با موس روی هرکدام، آن و پایینی‌ها پر می‌شوند
  const shown = hover || rating;

  return (
    <section className="card mt-8">
      <h2 className="font-bold">به کلاس با {teacherName} امتیاز بدهید</h2>
      <p className="mt-2 text-sm text-ink-muted">
        این نظر در صفحه‌ی عمومی استاد دیده می‌شود.
      </p>

      {error ? <p className="alert-error mt-4">{error}</p> : null}

      <div
        className="mt-4 flex items-center gap-1"
        dir="ltr"
        onMouseLeave={() => setHover(0)}
      >
        {[1, 2, 3, 4, 5].map((value) => (
          <button
            key={value}
            type="button"
            disabled={busy}
            onClick={() => setRating(value)}
            onMouseEnter={() => setHover(value)}
            aria-label={`${value} ستاره`}
            aria-pressed={rating === value}
            className={
              value <= shown ? "text-accent-strong" : "text-border"
            }
          >
            <svg className="size-8" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M12 2.5l2.9 5.9 6.5.95-4.7 4.58 1.11 6.47L12 17.9l-5.81 3.06 1.11-6.47L2.6 9.9l6.5-.95L12 2.5z" />
            </svg>
          </button>
        ))}
      </div>

      <textarea
        className="input mt-4"
        rows={3}
        maxLength={2000}
        disabled={busy}
        value={comment}
        placeholder="اگر دوست دارید، چند جمله درباره‌ی کلاس بنویسید (اختیاری)."
        onChange={(event) => setComment(event.target.value)}
      />

      <button
        type="button"
        onClick={() => void save()}
        disabled={busy || rating < 1}
        className="btn-primary mt-4"
      >
        {busy ? "در حال ثبت…" : "ثبت نظر"}
      </button>
    </section>
  );
}
