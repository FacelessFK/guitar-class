"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { Avatar } from "@/components/avatar";
import { EmptyState, Skeleton } from "@/components/ui";
import { errorMessage } from "@/lib/api-client";
import {
  getTeacherProfile,
  updateTeacherProfile,
  type TeacherProfile,
} from "@/lib/app-api";
import { faNumber, formatDuration, formatToman } from "@/lib/format";
import { useSession } from "@/lib/session";

interface ProfileForm {
  headline: string;
  bio: string;
  yearsExperience: string;
  introVideoUrl: string;
  slug: string;
}

function formFromProfile(profile: TeacherProfile): ProfileForm {
  return {
    headline: profile.headline,
    bio: profile.bio ?? "",
    yearsExperience: String(profile.yearsExperience),
    introVideoUrl: profile.introVideoUrl ?? "",
    slug: profile.slug,
  };
}

export default function TeacherProfilePage() {
  const { user } = useSession();
  const [profile, setProfile] = useState<TeacherProfile | null>(null);
  const [form, setForm] = useState<ProfileForm>({
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
      setForm(formFromProfile(next));
      setError(null);
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const dirty = useMemo(() => {
    if (!profile) return false;
    return (
      form.headline.trim() !== profile.headline ||
      form.bio.trim() !== (profile.bio ?? "") ||
      Number(form.yearsExperience) !== profile.yearsExperience ||
      form.introVideoUrl.trim() !== (profile.introVideoUrl ?? "") ||
      form.slug.trim() !== profile.slug
    );
  }, [form, profile]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!profile) return;

    setError(null);
    setSaved(false);
    setSaving(true);

    const changes: Parameters<typeof updateTeacherProfile>[0] = {};
    if (form.headline.trim() !== profile.headline) changes.headline = form.headline.trim();
    if (form.bio.trim() !== (profile.bio ?? "")) changes.bio = form.bio.trim() || null;
    if (Number(form.yearsExperience) !== profile.yearsExperience) {
      changes.yearsExperience = Number(form.yearsExperience);
    }
    if (form.introVideoUrl.trim() !== (profile.introVideoUrl ?? "")) {
      changes.introVideoUrl = form.introVideoUrl.trim() || null;
    }
    if (form.slug.trim() !== profile.slug) changes.slug = form.slug.trim();

    if (Object.keys(changes).length === 0) {
      setSaving(false);
      setSaved(true);
      return;
    }

    try {
      const updated = await updateTeacherProfile(changes);
      setProfile(updated);
      setForm(formFromProfile(updated));
      setSaved(true);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setSaving(false);
    }
  }

  function discard() {
    if (!profile) return;
    setForm(formFromProfile(profile));
    setSaved(false);
    setError(null);
  }

  if (!profile) {
    return (
      <div className="mx-auto max-w-[1000px] px-4.5 pt-6 pb-19 md:px-6 md:pt-9 md:pb-26">
        {error ? (
          <div className="flex flex-wrap items-center gap-4">
            <p className="alert-error flex-1">{error}</p>
            <button type="button" className="btn-quiet" onClick={() => void load()}>
              تلاش دوباره
            </button>
          </div>
        ) : (
          <ProfileSkeleton />
        )}
      </div>
    );
  }

  const canViewPublic =
    profile.status === "APPROVED" && profile.offerings.some((offering) => offering.isActive);
  const previewUrl = safeHttpUrl(form.introVideoUrl);

  return (
    <div className="mx-auto max-w-[1000px] px-4.5 pt-6 pb-5 md:px-6 md:pt-9 md:pb-26">
      <div className="flex items-center gap-2 text-[13px] text-meta">
        <Link href="/teacher" className="text-meta hover:text-ink">پنل استاد</Link>
        <span>←</span>
        <span className="text-ink-2">پروفایل مدرس</span>
      </div>

      <header className="mt-4.5 flex flex-col items-start justify-between gap-4 md:flex-row md:items-end md:gap-6">
        <div>
          <h1 className="text-[clamp(25px,3vw,32px)] font-semibold tracking-[-0.02em] text-ink">
            پروفایل مدرس
          </h1>
          <p className="mt-2.5 max-w-[52ch] text-[15.5px] leading-[1.95] text-ink-2 text-pretty">
            اطلاعاتی را ویرایش کن که هنرجوها پیش از رزرو کلاس می‌بینند.
          </p>
        </div>
        {canViewPublic ? (
          <Link href={`/teachers/${profile.slug}`} className="inline-flex min-h-11 items-center text-sm">
            دیدن پروفایل عمومی ←
          </Link>
        ) : null}
      </header>

      <ProfileStatus profile={profile} />

      {error ? <p className="alert-error mt-6">{error}</p> : null}

      <form onSubmit={(event) => void handleSubmit(event)} onChange={() => setSaved(false)}>
        <ProfileRow
          title="عکس پروفایل"
          description="این عکس متعلق به حساب کاربری توست و در همه بخش‌های هوگه یکسان نمایش داده می‌شود."
          first
        >
          <div className="flex flex-col items-start gap-4 sm:flex-row sm:gap-5">
            <Avatar
              name={user?.fullName ?? ""}
              url={user?.avatarUrl}
              alt="عکس فعلی پروفایل"
              className="h-[165px] w-[132px] shrink-0 rounded-control bg-well shadow-[inset_0_0_0_1px_var(--color-divider)]"
              textClassName="text-xl"
            />
            <div className="pt-1">
              <Link href="/profile" className="btn-quiet">
                {user?.avatarUrl ? "تغییر عکس در حساب کاربری" : "افزودن عکس در حساب کاربری"}
              </Link>
              <p className="mt-3 max-w-[46ch] text-[13px] leading-[1.9] text-meta">
                عکس اینجا جداگانه بارگذاری نمی‌شود تا بین حساب کاربری و
                پروفایل مدرس دو نسخه متفاوت ساخته نشود.
              </p>
            </div>
          </div>
        </ProfileRow>

        <ProfileRow title="معرفی کوتاه" description="این جمله زیر نام تو در فهرست استادها و پروفایل عمومی نمایش داده می‌شود.">
          <label className="label" htmlFor="headline">عنوان معرفی</label>
          <input
            id="headline"
            className="input"
            value={form.headline}
            onChange={(event) => setForm({ ...form, headline: event.target.value })}
            maxLength={160}
            required
          />
          <p dir="ltr" className="field-hint text-end">{faNumber(form.headline.length)} / {faNumber(160)}</p>
        </ProfileRow>

        <ProfileRow title="درباره من" description="کمی درباره تجربه، مسیر موسیقی و رویکردت به آموزش بنویس.">
          <textarea
            id="bio"
            className="input min-h-48"
            value={form.bio}
            onChange={(event) => setForm({ ...form, bio: event.target.value })}
            maxLength={4000}
          />
          <div className="mt-1.5 flex items-center justify-between gap-3 text-[12.5px] text-meta">
            <span>در پروفایل عمومی نمایش داده می‌شود.</span>
            <span dir="ltr">{faNumber(form.bio.length)} / {faNumber(4000)}</span>
          </div>
        </ProfileRow>

        <ProfileRow title="سابقه تدریس" description="این عدد در پروفایل عمومی نمایش داده می‌شود.">
          <label className="label" htmlFor="years">سال‌های سابقه</label>
          <div className="relative max-w-56">
            <input
              id="years"
              className="input pe-14"
              type="number"
              inputMode="numeric"
              min={0}
              max={80}
              required
              value={form.yearsExperience}
              onChange={(event) => setForm({ ...form, yearsExperience: event.target.value })}
            />
            <span className="pointer-events-none absolute start-auto end-4 top-1/2 -translate-y-1/2 text-[13.5px] text-meta">سال</span>
          </div>
        </ProfileRow>

        <ProfileRow title="نشانی صفحه عمومی" description="نشانی کوتاه و یکتای پروفایل تو در هوگه.">
          <label className="label" htmlFor="slug">شناسه نشانی</label>
          <div className="flex min-w-0 items-stretch" dir="ltr">
            <span className="hidden items-center rounded-s-control bg-surface px-3 text-[13px] text-meta shadow-[inset_0_0_0_1px_var(--color-divider)] sm:flex">
              hyggemode.com/teachers/
            </span>
            <input
              id="slug"
              className="input min-w-0 rounded-s-none text-start"
              dir="ltr"
              value={form.slug}
              onChange={(event) => setForm({ ...form, slug: event.target.value })}
              required
            />
          </div>
        </ProfileRow>

        <ProfileRow title="ویدیوی معرفی" description="در بخش ویدیوی پروفایل عمومی نمایش داده می‌شود.">
          {previewUrl ? (
            <video
              src={previewUrl}
              controls
              preload="metadata"
              className="mb-4 aspect-video w-full max-w-[460px] rounded-control bg-well shadow-[inset_0_0_0_1px_var(--color-divider)]"
            />
          ) : (
            <div className="mb-4 max-w-[52ch]">
              <p className="text-[15px] text-ink">هنوز ویدیوی قابل پیش‌نمایشی ثبت نشده است.</p>
              <p className="mt-1.5 text-[13.5px] leading-[1.9] text-meta">
                یک نشانی مستقیم http یا https وارد کن. هوگه در حال حاضر بارگذاری
                یا پردازش ویدیو ندارد.
              </p>
            </div>
          )}
          <label className="label" htmlFor="intro">نشانی ویدیو</label>
          <input
            id="intro"
            className="input"
            dir="ltr"
            type="url"
            maxLength={500}
            placeholder="https://…"
            value={form.introVideoUrl}
            onChange={(event) => setForm({ ...form, introVideoUrl: event.target.value })}
          />
          <p className="field-hint">برای پاک کردن ویدیو، نشانی را خالی و تغییرات را ذخیره کن.</p>
        </ProfileRow>

        <ProfileRow title="سرویس‌های تدریس" description="ساز، قیمت و مدت کلاس‌ها توسط ادمین مدیریت می‌شوند و اینجا فقط خواندنی‌اند.">
          {profile.offerings.length === 0 ? (
            <EmptyState quiet title="هنوز سرویسی برایت تعریف نشده است.">
              تا وقتی سرویس فعال نداشته باشی، پروفایل در فهرست عمومی نمایش داده
              نمی‌شود. برای پیگیری با پشتیبانی تماس بگیر.
            </EmptyState>
          ) : (
            <ul>
              {profile.offerings.map((offering) => (
                <li key={offering.id} className="flex flex-wrap items-center justify-between gap-x-5 gap-y-1 border-b border-divider/70 py-3.5 text-sm">
                  <span className="text-ink-2">{offering.instrumentName}</span>
                  <span className="text-meta">
                    {formatToman(offering.price)} تومان · {formatDuration(offering.durationMinutes)}
                    {offering.isActive ? "" : " · غیرفعال"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </ProfileRow>

        <div className="sticky bottom-0 z-10 -mx-4.5 mt-8 flex flex-col-reverse items-stretch gap-2.5 border-t border-divider bg-[color-mix(in_srgb,var(--color-bg)_94%,transparent)] px-4.5 py-3 backdrop-blur-[10px] sm:static sm:mx-0 sm:flex-row sm:items-center sm:justify-between sm:bg-transparent sm:px-0 sm:pt-7 sm:pb-0 sm:backdrop-blur-none">
          <div className="min-h-6 text-center text-[13.5px] sm:text-start">
            {saving ? <span className="text-meta">در حال ذخیره…</span> : null}
            {!saving && saved ? <span className="text-ok">تغییرات ذخیره شد.</span> : null}
            {!saving && !saved && dirty ? <span className="text-ink-2">تغییرات ذخیره‌نشده داری.</span> : null}
          </div>
          <div className="flex items-center gap-3">
            {dirty ? (
              <button type="button" className="btn-ghost min-h-12" onClick={discard}>انصراف</button>
            ) : null}
            <button type="submit" className="btn-primary min-h-12 flex-1 sm:flex-none" disabled={saving || !dirty}>
              {saving ? "کمی صبر کنید…" : "ذخیره تغییرات"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

function ProfileStatus({ profile }: { profile: TeacherProfile }) {
  const activeOffering = profile.offerings.some((offering) => offering.isActive);
  const content = {
    APPROVED: activeOffering
      ? { title: "پروفایل فعال است", body: "هنرجوها می‌توانند پروفایل تو را ببینند و کلاس رزرو کنند.", edge: "border-ok", dot: "bg-ok" }
      : { title: "پروفایل تأیید شده، اما سرویس فعالی ندارد", body: "برای نمایش عمومی، ادمین باید دست‌کم یک سرویس تدریس فعال کند.", edge: "border-wood", dot: "bg-wood-light" },
    PENDING: { title: "پروفایل در انتظار تأیید است", body: "تا پایان بررسی در فهرست عمومی دیده نمی‌شوی و رزرو تازه‌ای انجام نمی‌شود.", edge: "border-wood", dot: "bg-wood-light" },
    SUSPENDED: { title: "پروفایل مدرس معلق است", body: "نمایش عمومی و رزروهای تازه متوقف شده‌اند. برای پیگیری با پشتیبانی تماس بگیر.", edge: "border-error", dot: "bg-error" },
  }[profile.status];

  return (
    <section className={`mt-7 border-s ${content.edge} ps-3.5 md:mt-8`}>
      <div className="flex items-center gap-2.5 text-[15px] text-ink">
        <span className={`size-1.75 rounded-full ${content.dot}`} />
        <span>{content.title}</span>
      </div>
      <p className="mt-1.5 text-[13.5px] leading-[1.9] text-meta">{content.body}</p>
    </section>
  );
}

function ProfileRow({ title, description, first = false, children }: { title: string; description: string; first?: boolean; children: React.ReactNode }) {
  return (
    <section className={`${first ? "mt-9" : "mt-7"} grid gap-3.5 border-t border-divider pt-7 min-[901px]:grid-cols-[260px_1fr] min-[901px]:gap-7`}>
      <div>
        <h2 className="text-[17px] font-semibold text-ink">{title}</h2>
        <p className="mt-1 text-[13px] leading-[1.85] text-meta text-pretty">{description}</p>
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

function safeHttpUrl(value: string): string | null {
  const trimmed = value.trim();
  return /^https?:\/\//i.test(trimmed) ? trimmed : null;
}

function ProfileSkeleton() {
  return (
    <div aria-label="در حال بارگذاری پروفایل مدرس">
      <Skeleton className="h-4 w-52" />
      <Skeleton className="mt-5 h-9 w-48" delay={1} />
      <Skeleton className="mt-3 h-4 w-full max-w-md" delay={2} />
      <div className="mt-9 grid gap-4 border-t border-divider pt-7 min-[901px]:grid-cols-[260px_1fr]">
        <div><Skeleton className="h-5 w-28" /><Skeleton className="mt-3 h-3.5 w-48 max-w-full" delay={1} /></div>
        <div className="flex gap-5"><Skeleton className="h-[165px] w-[132px] shrink-0" /><Skeleton className="mt-2 h-12 w-52 max-w-[45%]" delay={2} /></div>
      </div>
      {Array.from({ length: 3 }, (_, index) => (
        <div key={index} className="mt-7 grid gap-4 border-t border-divider pt-7 min-[901px]:grid-cols-[260px_1fr]">
          <Skeleton className="h-5 w-32" delay={(index % 3) as 0 | 1 | 2} />
          <Skeleton className="h-12 w-full" delay={((index + 1) % 3) as 0 | 1 | 2} />
        </div>
      ))}
    </div>
  );
}
