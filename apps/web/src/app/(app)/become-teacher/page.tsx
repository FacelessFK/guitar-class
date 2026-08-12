"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { errorMessage } from "@/lib/api-client";
import { applyAsTeacher } from "@/lib/app-api";
import { useSession } from "@/lib/session";

/**
 * درخواست استاد شدن.
 *
 * بیرون از `/teacher/*` است و نه داخلش: آن شاخه ناوبری پنل استاد را
 * دارد و صفحه‌هایش داده‌شان را از اندپوینت‌هایی می‌گیرند که به کاربر
 * بدون پروفایل ۴۰۳ می‌دهند. این صفحه دقیقاً برای همان کاربر است.
 *
 * فرم عمداً کوتاه است. هرچه اینجا پرسیده شود، بین «تصمیم گرفتم» تا
 * «فرستادم» می‌نشیند؛ بقیه‌ی پروفایل — و مهم‌تر از همه ویدیوی معارفه —
 * بعد از ثبت، در «پروفایل من» کامل می‌شود.
 */
export default function BecomeTeacherPage() {
  const { user, reload } = useSession();
  const router = useRouter();

  const [headline, setHeadline] = useState("");
  const [bio, setBio] = useState("");
  const [years, setYears] = useState("");
  const [slug, setSlug] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // کاربری که از قبل پروفایل دارد اینجا کاری ندارد — لینک هم برایش
  // نمایش داده نمی‌شود، ولی آدرس مستقیم همیشه ممکن است
  if (user?.teacherProfileId) {
    return (
      <div className="mx-auto max-w-2xl px-5 py-12">
        <h1 className="text-2xl font-bold">تدریس در پلتفرم</h1>
        <p className="alert-info mt-6">
          شما از قبل پروفایل استاد دارید. وضعیت و اطلاعاتش در پنل استاد است.
        </p>
      </div>
    );
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      await applyAsTeacher({
        headline: headline.trim(),
        ...(bio.trim() ? { bio: bio.trim() } : {}),
        ...(years.trim() ? { yearsExperience: Number(years) } : {}),
        ...(slug.trim() ? { slug: slug.trim() } : {}),
      });

      // نشست باید دوباره خوانده شود، وگرنه پوسته‌ی اپ لینک پنل استاد را
      // نشان نمی‌دهد و کاربر به صفحه‌ای می‌رود که ناوبری‌اش وجود ندارد
      await reload();
      router.replace("/teacher/profile");
    } catch (caught) {
      setError(errorMessage(caught));
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-5 py-12">
      <h1 className="text-2xl font-bold">تدریس در پلتفرم</h1>

      <p className="mt-4 text-sm text-ink-muted">
        درخواستتان را ثبت کنید تا بررسی شود. پس از تأیید، قیمت و مدت کلاس با شما
        توافق و تنظیم می‌شود و صفحه‌ی عمومی‌تان منتشر می‌شود.
      </p>

      {error ? <p className="alert-error mt-6">{error}</p> : null}

      <form onSubmit={(event) => void handleSubmit(event)} className="mt-8 space-y-5">
        <div>
          <label className="label" htmlFor="headline">
            معرفی کوتاه
          </label>
          <input
            id="headline"
            className="input"
            value={headline}
            onChange={(event) => setHeadline(event.target.value)}
            placeholder="مدرس گیتار کلاسیک، ۱۲ سال سابقه"
            maxLength={160}
            required
          />
          <p className="mt-2 text-xs text-ink-muted">
            همان یک خطی که زیر نامتان در فهرست استادها دیده می‌شود.
          </p>
        </div>

        <div>
          <label className="label" htmlFor="bio">
            درباره‌ی شما
          </label>
          <textarea
            id="bio"
            className="input min-h-32"
            value={bio}
            onChange={(event) => setBio(event.target.value)}
            placeholder="تحصیلات، سبک تدریس، سازهایی که کار می‌کنید…"
          />
        </div>

        <div>
          <label className="label" htmlFor="years">
            سال سابقه‌ی تدریس
          </label>
          <input
            id="years"
            className="input"
            type="number"
            inputMode="numeric"
            min={0}
            max={80}
            value={years}
            onChange={(event) => setYears(event.target.value)}
          />
        </div>

        <div>
          <label className="label" htmlFor="slug">
            نشانی صفحه‌تان <span className="text-ink-muted">(اختیاری)</span>
          </label>
          <input
            id="slug"
            className="input"
            dir="ltr"
            value={slug}
            onChange={(event) => setSlug(event.target.value)}
            placeholder="ali-rezaei"
          />
          <p className="mt-2 text-xs text-ink-muted">
            فقط حروف کوچک انگلیسی، رقم و خط تیره. خالی بگذارید تا خودمان یکی
            بسازیم؛ بعداً هم قابل تغییر است.
          </p>
        </div>

        <button type="submit" className="btn-primary" disabled={submitting}>
          {submitting ? "در حال ثبت…" : "ثبت درخواست"}
        </button>
      </form>
    </div>
  );
}
