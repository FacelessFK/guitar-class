"use client";

import { useRef, useState } from "react";

import { errorMessage } from "@/lib/api-client";
import { updateOwnProfile, uploadFile } from "@/lib/app-api";
import { useSession } from "@/lib/session";
import { loadUser } from "@/lib/session-store";

/**
 * پروفایل هنرجو.
 *
 * فقط دو فیلد دارد و همین درست است: شماره‌ی موبایل هویتِ ورود است، نه
 * یک فیلد پروفایل، و عوض کردنش یعنی تصاحب حساب صاحبِ شماره‌ی تازه.
 *
 * جدا از `/teacher/profile` است. آنجا پروفایل *عمومی* استاد است —
 * معرفی، سابقه، ویدیوی معارفه — و فقط استادها دارند؛ این یکی برای هر
 * کاربر واردشده‌ای است.
 */
export default function ProfilePage() {
  const { user } = useSession();

  const [fullName, setFullName] = useState(user?.fullName ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const avatarInput = useRef<HTMLInputElement>(null);

  async function save(body: { fullName?: string; avatarObjectKey?: string | null }) {
    setBusy(true);
    setError(null);
    setSaved(false);

    try {
      await updateOwnProfile(body);
      // پوسته‌ی اپ نام و عکس را از نشست می‌خواند، نه از این صفحه؛
      // بدون این، هدر تا رفرش بعدی مقدار قدیمی را نشان می‌دهد
      await loadUser();
      setSaved(true);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  async function handleAvatar(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setBusy(true);
    setError(null);
    setSaved(false);

    try {
      const objectKey = await uploadFile(file, "AVATAR");
      await updateOwnProfile({ avatarObjectKey: objectKey });
      await loadUser();
      setSaved(true);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
      if (avatarInput.current) avatarInput.current.value = "";
    }
  }

  const nameChanged = fullName.trim() !== (user?.fullName ?? "");

  return (
    <div className="mx-auto max-w-lg px-5 py-12">
      <h1 className="text-2xl font-bold">پروفایل من</h1>

      {error ? <p className="alert-error mt-6">{error}</p> : null}
      {saved && !error ? <p className="alert-info mt-6">ذخیره شد.</p> : null}

      <section className="card mt-8">
        <h2 className="font-medium">عکس پروفایل</h2>

        <div className="mt-4 flex items-center gap-4">
          {user?.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- نشانی از باکت می‌آید و دامنه‌اش با محیط عوض می‌شود
            <img
              src={user.avatarUrl}
              alt="عکس پروفایل شما"
              className="size-16 rounded-full object-cover"
            />
          ) : (
            <div className="flex size-16 items-center justify-center rounded-full bg-surface-muted text-sm text-ink-muted">
              بدون عکس
            </div>
          )}

          <div className="flex-1">
            <input
              id="avatar"
              ref={avatarInput}
              className="input"
              type="file"
              accept="image/*"
              disabled={busy}
              onChange={(event) => void handleAvatar(event)}
            />
            <p className="mt-2 text-xs text-ink-muted">
              تصویر، حداکثر ۵ مگابایت.
            </p>
          </div>
        </div>

        {user?.avatarUrl ? (
          <button
            type="button"
            onClick={() => void save({ avatarObjectKey: null })}
            disabled={busy}
            className="btn-danger mt-4"
          >
            برداشتن عکس
          </button>
        ) : null}
      </section>

      <section className="card mt-4">
        <label className="label" htmlFor="fullName">
          نام و نام خانوادگی
        </label>
        <input
          id="fullName"
          className="input"
          value={fullName}
          maxLength={120}
          disabled={busy}
          onChange={(event) => setFullName(event.target.value)}
        />
        <p className="mt-2 text-xs text-ink-muted">
          استاد شما همین نام را می‌بیند.
        </p>

        <button
          type="button"
          onClick={() => void save({ fullName: fullName.trim() })}
          disabled={busy || !nameChanged || fullName.trim().length < 2}
          className="btn-primary mt-4"
        >
          {busy ? "در حال ذخیره…" : "ذخیره‌ی نام"}
        </button>
      </section>

      <section className="card mt-4">
        <h2 className="font-medium">شماره‌ی موبایل</h2>
        <p className="mt-2 text-sm text-ink-muted" dir="ltr">
          {user?.phone}
        </p>
        <p className="mt-2 text-xs text-ink-muted">
          شماره قابل تغییر نیست — با همین وارد حساب می‌شوید.
        </p>
      </section>
    </div>
  );
}
