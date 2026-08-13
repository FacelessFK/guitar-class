"use client";

import { useCallback, useEffect, useState } from "react";

import { errorMessage } from "@/lib/api-client";
import {
  getTeacherProfile,
  updateTeacherProfile,
  type TeacherProfile,
} from "@/lib/app-api";
import { formatDuration, formatToman } from "@/lib/format";

/**
 * پروفایل استاد — همان چیزی که در صفحه‌ی عمومی دیده می‌شود.
 *
 * فقط فیلدهای عوض‌شده فرستاده می‌شوند، نه کل فرم: در API نبودنِ یک کلید
 * یعنی «دست نزن» و `null` یعنی «پاکش کن». فرستادن همه‌چیز در هر ذخیره،
 * دو کاربر هم‌زمان را به بازنویسی کار همدیگر می‌رساند و ضمناً معنای
 * «پاک کردن» را از بین می‌برد.
 *
 * قیمت و مدت کلاس اینجا **خواندنی** است. آن‌ها روی `offerings` می‌نشینند
 * و تنظیمشان کار ادمین است؛ نشان داده می‌شوند چون استاد باید بداند
 * چه چیزی به اسمش فروخته می‌شود.
 */
export default function TeacherProfilePage() {
  const [profile, setProfile] = useState<TeacherProfile | null>(null);
  const [form, setForm] = useState({
    headline: "",
    bio: "",
    yearsExperience: "",
    introVideoUrl: "",
    slug: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const next = await getTeacherProfile();
      setProfile(next);
      setForm({
        headline: next.headline,
        bio: next.bio ?? "",
        yearsExperience: String(next.yearsExperience),
        introVideoUrl: next.introVideoUrl ?? "",
        slug: next.slug,
      });
      setError(null);
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!profile) return;

    setError(null);
    setSaved(false);
    setSaving(true);

    /**
     * تفاوت‌گیری با مقدارِ خوانده‌شده از سرور.
     *
     * فیلد متنی‌ای که خالی شده `null` می‌فرستد نه رشته‌ی خالی — وگرنه
     * صفحه‌ی عمومی به‌جای «متن ندارد»، متنِ خالی رندر می‌کند و بخشِ
     * بی‌محتوا نشان می‌دهد.
     */
    const changes: Parameters<typeof updateTeacherProfile>[0] = {};

    if (form.headline.trim() !== profile.headline) {
      changes.headline = form.headline.trim();
    }
    if (form.bio.trim() !== (profile.bio ?? "")) {
      changes.bio = form.bio.trim() || null;
    }
    if (Number(form.yearsExperience) !== profile.yearsExperience) {
      changes.yearsExperience = Number(form.yearsExperience);
    }
    if (form.introVideoUrl.trim() !== (profile.introVideoUrl ?? "")) {
      changes.introVideoUrl = form.introVideoUrl.trim() || null;
    }
    if (form.slug.trim() !== profile.slug) {
      changes.slug = form.slug.trim();
    }

    if (Object.keys(changes).length === 0) {
      setSaving(false);
      setSaved(true);
      return;
    }

    try {
      const updated = await updateTeacherProfile(changes);
      setProfile(updated);
      setSaved(true);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setSaving(false);
    }
  }

  if (profile === null) {
    return (
      <div className="mx-auto max-w-3xl px-5 py-12">
        {error ? (
          <p className="alert-error">{error}</p>
        ) : (
          <p className="text-sm text-ink-muted">در حال بارگذاری…</p>
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-5 py-12">
      <h1 className="font-display text-2xl leading-snug">پروفایل من</h1>
      <p className="mt-3 text-sm text-ink-muted">
        این‌ها همان چیزهایی هستند که بازدیدکننده در صفحه‌ی عمومی شما می‌بیند.
      </p>

      {error ? <p className="alert-error mt-6">{error}</p> : null}
      {saved ? <p className="alert-info mt-6">تغییرات ذخیره شد.</p> : null}

      <form
        onSubmit={(event) => void handleSubmit(event)}
        onChange={() => setSaved(false)}
        className="mt-8 space-y-5"
      >
        <div>
          <label className="label" htmlFor="headline">
            معرفی کوتاه
          </label>
          <input
            id="headline"
            className="input"
            value={form.headline}
            onChange={(event) => setForm({ ...form, headline: event.target.value })}
            maxLength={160}
            required
          />
        </div>

        <div>
          <label className="label" htmlFor="bio">
            درباره‌ی من
          </label>
          <textarea
            id="bio"
            className="input min-h-40"
            value={form.bio}
            onChange={(event) => setForm({ ...form, bio: event.target.value })}
          />
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="years">
              سال سابقه
            </label>
            <input
              id="years"
              className="input"
              type="number"
              inputMode="numeric"
              min={0}
              max={80}
              value={form.yearsExperience}
              onChange={(event) =>
                setForm({ ...form, yearsExperience: event.target.value })
              }
            />
          </div>

          <div>
            <label className="label" htmlFor="slug">
              نشانی صفحه
            </label>
            <input
              id="slug"
              className="input"
              dir="ltr"
              value={form.slug}
              onChange={(event) => setForm({ ...form, slug: event.target.value })}
            />
          </div>
        </div>

        {/*
          ویدیوی معارفه جدا و با توضیح می‌آید، نه به‌عنوان یکی از فیلدهای
          فرم: سند معماری آن را مؤثرترین عامل روی نرخ تبدیل می‌داند و
          استادی که نداند چرا مهم است، خالی ردش می‌کند.
        */}
        <div className="rounded-lg border border-border bg-surface-muted p-4">
          <label className="label" htmlFor="intro">
            ویدیوی معارفه
          </label>
          <input
            id="intro"
            className="input"
            dir="ltr"
            value={form.introVideoUrl}
            onChange={(event) =>
              setForm({ ...form, introVideoUrl: event.target.value })
            }
            placeholder="https://…"
          />
          <p className="mt-2 text-xs text-ink-muted">
            یک ویدیوی کوتاه که خودتان و سبک تدریستان را معرفی می‌کنید. بیشترین
            اثر را روی تصمیم هنرجو دارد — بیشتر از متن و سابقه. نشانی باید با
            http:// یا https:// شروع شود.
          </p>
        </div>

        <button type="submit" className="btn-primary" disabled={saving}>
          {saving ? "در حال ذخیره…" : "ذخیره"}
        </button>
      </form>

      <section className="mt-12">
        <h2 className="text-lg font-bold">سرویس‌های شما</h2>
        <p className="mt-2 text-sm text-ink-muted">
          قیمت و مدت کلاس را ادمین تنظیم می‌کند. اگر می‌خواهید تغییری بدهید،
          با پشتیبانی تماس بگیرید.
        </p>

        {profile.offerings.length === 0 ? (
          <p className="alert-info mt-4">
            هنوز سرویسی برایتان تعریف نشده. تا وقتی سرویس نداشته باشید، در فهرست
            عمومی نمی‌آیید — حتی اگر پروفایلتان تأیید شده باشد.
          </p>
        ) : (
          <ul className="mt-4 space-y-2">
            {profile.offerings.map((offering) => (
              <li
                key={offering.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border px-4 py-3 text-sm"
              >
                <span>{offering.instrumentName}</span>
                <span className="text-ink-muted">
                  {formatToman(offering.price)} تومان ·{" "}
                  {formatDuration(offering.durationMinutes)}
                  {offering.isActive ? "" : " · غیرفعال"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
