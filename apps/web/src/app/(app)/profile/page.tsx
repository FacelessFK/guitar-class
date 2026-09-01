"use client";

import { PASSWORD_POLICY, passwordProblemMessage } from "@music/shared";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { Avatar } from "@/components/avatar";
import { Button } from "@/components/ui/button";
import { Field, TextInput } from "@/components/ui/field";
import {
  CheckIcon,
  LockIcon,
  PencilIcon,
  TrashIcon,
} from "@/components/ui/icons";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError, errorMessage } from "@/lib/api-client";
import { changeOwnPassword, updateOwnProfile, uploadFile } from "@/lib/app-api";
import { faNumber } from "@/lib/format";
import { prepareAvatar } from "@/lib/image";
import { ownPasswordPayload } from "@/lib/profile-password";
import { useSession } from "@/lib/session";

type PasswordErrors = Partial<Record<"current" | "next" | "confirm" | "form", string>>;

/** Account profile: supported identity fields plus the Phase 5A password contract. */
export default function ProfilePage() {
  const { user, reload } = useSession();
  const [fullName, setFullName] = useState("");
  const [nameBusy, setNameBusy] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [nameSaved, setNameSaved] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [avatarSaved, setAvatarSaved] = useState(false);
  const avatarInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (user) setFullName(user.fullName);
  }, [user]);

  async function saveName() {
    const name = fullName.trim();
    if (name.length < 2) {
      setNameError("نام و نام خانوادگی را وارد کن.");
      return;
    }

    setNameBusy(true);
    setNameError(null);
    setNameSaved(false);
    try {
      await updateOwnProfile({ fullName: name });
      await reload();
      setNameSaved(true);
    } catch (caught) {
      setNameError(errorMessage(caught));
    } finally {
      setNameBusy(false);
    }
  }

  async function handleAvatar(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setAvatarBusy(true);
    setAvatarError(null);
    setAvatarSaved(false);
    try {
      const objectKey = await uploadFile(await prepareAvatar(file), "AVATAR");
      await updateOwnProfile({ avatarObjectKey: objectKey });
      await reload();
      setAvatarSaved(true);
    } catch (caught) {
      setAvatarError(errorMessage(caught));
    } finally {
      setAvatarBusy(false);
      if (avatarInput.current) avatarInput.current.value = "";
    }
  }

  async function removeAvatar() {
    setAvatarBusy(true);
    setAvatarError(null);
    setAvatarSaved(false);
    try {
      await updateOwnProfile({ avatarObjectKey: null });
      await reload();
      setAvatarSaved(true);
    } catch (caught) {
      setAvatarError(errorMessage(caught));
    } finally {
      setAvatarBusy(false);
    }
  }

  if (!user) return <ProfileSkeleton />;

  const nameChanged = fullName.trim() !== user.fullName;

  return (
    <div className="mx-auto max-w-[860px] px-4.5 pt-6 pb-19 md:px-6 md:pt-9 md:pb-26">
      <header>
        <div className="flex items-center gap-2.5 text-[13px] tracking-[0.08em] text-meta">
          <span className="h-px w-5 bg-wood" />
          <span>حساب من</span>
        </div>
        <h1 className="mt-3.5 text-[clamp(25px,3vw,32px)] font-semibold tracking-[-0.02em] text-ink">
          حساب کاربری
        </h1>
        <p className="mt-2.5 max-w-[52ch] text-[15.5px] leading-[1.95] text-ink-2">
          اطلاعات شخصی و تنظیمات حسابت را اینجا مدیریت کن.
        </p>
      </header>

      <section className="mt-8 flex flex-col items-start gap-5 border-b border-divider pb-8 sm:flex-row sm:items-center md:mt-10 md:gap-5.5 md:pb-10">
        <Avatar
          name={user.fullName}
          url={user.avatarUrl}
          alt="عکس پروفایل شما"
          className="size-[82px] shrink-0 rounded-full shadow-[inset_0_0_0_1px_var(--color-divider)]"
          textClassName="text-[21px]"
        />
        <div className="min-w-0 flex-1">
          <h2 className="text-[19px] font-semibold tracking-[-0.01em] text-ink">
            {user.fullName}
          </h2>
          <p dir="ltr" className="mt-1 text-start text-sm text-meta">
            {user.phone}
          </p>
          <div className="mt-3.5 flex flex-wrap items-center gap-3.5">
            <input
              ref={avatarInput}
              className="sr-only"
              type="file"
              accept="image/*"
              disabled={avatarBusy}
              onChange={(event) => void handleAvatar(event)}
            />
            <Button
              variant="quiet"
              size="sm"
              busy={avatarBusy}
              busyLabel="در حال بارگذاری…"
              onClick={() => avatarInput.current?.click()}
            >
              <PencilIcon size={15} />
              تغییر عکس
            </Button>
            {user.avatarUrl ? (
              <button
                type="button"
                disabled={avatarBusy}
                onClick={() => void removeAvatar()}
                className="inline-flex min-h-11 items-center gap-1.5 text-[13.5px] text-wood-light transition hover:text-ink disabled:opacity-50"
              >
                <TrashIcon size={14} />
                حذف عکس
              </button>
            ) : null}
          </div>
          {avatarError ? <p className="mt-3 text-[13.5px] text-error">{avatarError}</p> : null}
          {avatarSaved ? <SavedLine className="mt-3" text="عکس پروفایل به‌روز شد." /> : null}
        </div>
      </section>

      <section className="pt-9 md:pt-11">
        <SectionLabel>اطلاعات شخصی</SectionLabel>
        <div className="mt-4.5 max-w-[420px] space-y-4.5">
          <Field
            label="نام و نام خانوادگی"
            htmlFor="full-name"
            error={nameError}
            hint="استاد شما همین نام را می‌بیند."
          >
            <TextInput
              id="full-name"
              value={fullName}
              maxLength={120}
              disabled={nameBusy}
              invalid={Boolean(nameError)}
              onChange={(event) => {
                setFullName(event.target.value);
                setNameError(null);
                setNameSaved(false);
              }}
            />
          </Field>

          <Field label="شماره موبایل" aside="شناسه حساب">
            <div className="flex min-h-[50px] items-center justify-between gap-3 rounded-control bg-surface-2/55 px-3.5 text-ink-2 shadow-[inset_0_0_0_1px_var(--color-divider)]">
              <span dir="ltr" className="text-[15px]">
                {user.phone}
              </span>
              <LockIcon size={15} className="text-meta" />
            </div>
            <p className="field-hint">شماره قابل تغییر نیست — با همین وارد حساب می‌شوی.</p>
          </Field>
        </div>
        <div className="mt-5.5 flex flex-wrap items-center gap-4">
          <Button
            busy={nameBusy}
            busyLabel="در حال ذخیره…"
            disabled={!nameChanged || fullName.trim().length < 2}
            onClick={() => void saveName()}
          >
            ذخیره تغییرات
          </Button>
          {nameSaved ? <SavedLine text="تغییرات ذخیره شد." /> : null}
          {!nameChanged && !nameSaved ? (
            <span className="text-[13px] text-meta">تغییری برای ذخیره نیست.</span>
          ) : null}
        </div>
      </section>

      <PasswordSection hasPassword={user.hasPassword} onChanged={reload} phone={user.phone} />

      <section className="mt-9 border-t border-divider pt-9 md:mt-11 md:pt-11">
        <SectionLabel>تنظیمات</SectionLabel>
        <div className="mt-4 flex items-center justify-between gap-4 border-b border-divider-soft py-4">
          <div>
            <p className="text-[15px] text-ink">اعلان‌ها</p>
            <p className="mt-1 text-[13.5px] text-meta">اعلان‌های کلاس‌ها و تمرین‌ها</p>
          </div>
          <Link href="/notifications" className="min-h-11 shrink-0 py-2 text-[13.5px]">
            دیدن اعلان‌ها
          </Link>
        </div>
      </section>
    </div>
  );
}

function PasswordSection({
  hasPassword,
  onChanged,
  phone,
}: {
  hasPassword: boolean;
  onChanged: () => Promise<void>;
  phone: string;
}) {
  const [open, setOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [errors, setErrors] = useState<PasswordErrors>({});
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [savedFirstPassword, setSavedFirstPassword] = useState(false);

  function close() {
    setOpen(false);
    setCurrentPassword("");
    setNewPassword("");
    setConfirmation("");
    setErrors({});
  }

  async function save() {
    const nextErrors: PasswordErrors = {};
    if (hasPassword && !currentPassword) nextErrors.current = "رمز عبور فعلی را وارد کن.";
    const passwordError = passwordProblemMessage(newPassword);
    if (passwordError) nextErrors.next = passwordError;
    if (confirmation !== newPassword) {
      nextErrors.confirm = "تکرار رمز با رمز جدید یکسان نیست.";
    }
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    setBusy(true);
    setErrors({});
    setSaved(false);
    try {
      const wasFirstPassword = !hasPassword;
      await changeOwnPassword(
        ownPasswordPayload(hasPassword, currentPassword, newPassword),
      );
      await onChanged();
      close();
      setSavedFirstPassword(wasFirstPassword);
      setSaved(true);
    } catch (caught) {
      if (caught instanceof ApiError) {
        if (
          caught.code === "CURRENT_PASSWORD_REQUIRED" ||
          caught.code === "INVALID_CURRENT_PASSWORD"
        ) {
          setErrors({ current: caught.message });
        } else if (caught.code === "WEAK_PASSWORD") {
          setErrors({ next: caught.message });
        } else {
          setErrors({ form: errorMessage(caught) });
        }
      } else {
        setErrors({ form: errorMessage(caught) });
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-9 border-t border-divider pt-9 md:mt-11 md:pt-11">
      <SectionLabel>ورود و امنیت</SectionLabel>
      <div className="mt-4">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-divider-soft py-4">
          <div>
            <p className="text-[15px] text-ink">شماره موبایل</p>
            <p dir="ltr" className="mt-1 text-start text-[13.5px] text-meta">
              {phone}
            </p>
          </div>
          <span className="text-[13px] text-meta">با این شماره وارد می‌شوی</span>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-divider-soft py-4">
          <div>
            <p className="text-[15px] text-ink">رمز عبور</p>
            <p className="mt-1 text-[13.5px] text-meta">
              {hasPassword ? "برای ورود با رمز فعال است" : "هنوز رمزی برای حسابت نساخته‌ای"}
            </p>
          </div>
          <button
            type="button"
            className="btn-ghost min-h-11 shrink-0"
            onClick={() => {
              setOpen((value) => !value);
              setSaved(false);
              setErrors({});
            }}
          >
            {open ? "بستن" : hasPassword ? "تغییر رمز عبور" : "ساختن رمز عبور"}
          </button>
        </div>

        {open ? (
          <div className="mt-5 animate-fade rounded-panel bg-surface-2 p-4 shadow-[inset_0_0_0_1px_var(--color-divider)] md:p-5">
            {!hasPassword ? (
              <p className="notice mb-5">
                یک رمز برای ورودهای بعدی بساز. همچنان می‌توانی با کد یک‌بارمصرف وارد شوی.
              </p>
            ) : null}
            {errors.form ? <p className="alert-error mb-4">{errors.form}</p> : null}
            <div className="grid gap-4 md:grid-cols-2">
              {hasPassword ? (
                <Field
                  className="md:col-span-2 md:max-w-[420px]"
                  label="رمز عبور فعلی"
                  htmlFor="current-password"
                  error={errors.current}
                >
                  <TextInput
                    id="current-password"
                    type="password"
                    dir="ltr"
                    autoComplete="current-password"
                    value={currentPassword}
                    invalid={Boolean(errors.current)}
                    disabled={busy}
                    onChange={(event) => {
                      setCurrentPassword(event.target.value);
                      setErrors((current) => ({ ...current, current: undefined, form: undefined }));
                    }}
                  />
                </Field>
              ) : null}
              <Field
                label={hasPassword ? "رمز عبور جدید" : "رمز عبور"}
                htmlFor="new-password"
                error={errors.next}
                hint={`دست‌کم ${faNumber(PASSWORD_POLICY.MIN_LENGTH)} کاراکتر`}
              >
                <TextInput
                  id="new-password"
                  type="password"
                  dir="ltr"
                  autoComplete="new-password"
                  value={newPassword}
                  maxLength={PASSWORD_POLICY.MAX_LENGTH}
                  invalid={Boolean(errors.next)}
                  disabled={busy}
                  onChange={(event) => {
                    setNewPassword(event.target.value);
                    setErrors((current) => ({ ...current, next: undefined, form: undefined }));
                  }}
                />
              </Field>
              <Field
                label="تکرار رمز عبور جدید"
                htmlFor="confirm-password"
                error={errors.confirm}
              >
                <TextInput
                  id="confirm-password"
                  type="password"
                  dir="ltr"
                  autoComplete="new-password"
                  value={confirmation}
                  maxLength={PASSWORD_POLICY.MAX_LENGTH}
                  invalid={Boolean(errors.confirm)}
                  disabled={busy}
                  onChange={(event) => {
                    setConfirmation(event.target.value);
                    setErrors((current) => ({ ...current, confirm: undefined, form: undefined }));
                  }}
                />
              </Field>
            </div>
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <Button busy={busy} busyLabel="در حال ذخیره…" onClick={() => void save()}>
                ذخیره رمز جدید
              </Button>
              <button type="button" className="btn-ghost min-h-11 text-meta" onClick={close}>
                انصراف
              </button>
            </div>
          </div>
        ) : null}

        {saved ? (
          <SavedLine
            className="mt-3.5"
            text={savedFirstPassword ? "رمز عبور برای حسابت فعال شد." : "رمز عبور جدید ذخیره شد."}
          />
        ) : null}
      </div>
    </section>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="flex items-center gap-3 text-[13px] font-medium tracking-[0.08em] text-meta">
      <span className="h-px w-4 bg-wood" />
      {children}
    </h2>
  );
}

function SavedLine({ text, className = "" }: { text: string; className?: string }) {
  return (
    <span className={`flex items-center gap-2 text-[13.5px] text-ok ${className}`}>
      <CheckIcon size={15} />
      {text}
    </span>
  );
}

function ProfileSkeleton() {
  return (
    <div
      className="mx-auto max-w-[860px] px-4.5 pt-6 pb-19 md:px-6 md:pt-9 md:pb-26"
      aria-label="در حال بارگذاری حساب کاربری"
    >
      <Skeleton className="h-4 w-24" />
      <Skeleton className="mt-4 h-10 w-44" delay={1} />
      <Skeleton className="mt-3 h-5 w-72 max-w-full" delay={2} />
      <div className="mt-10 flex items-center gap-5 border-b border-divider pb-10">
        <Skeleton className="size-[82px] shrink-0 rounded-full" />
        <div className="flex-1">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="mt-2 h-4 w-28" delay={1} />
          <Skeleton className="mt-4 h-10 w-28" delay={2} />
        </div>
      </div>
      <Skeleton className="mt-10 h-4 w-28" />
      <Skeleton className="mt-5 h-[50px] w-[420px] max-w-full" delay={1} />
      <Skeleton className="mt-4 h-[50px] w-[420px] max-w-full" delay={2} />
    </div>
  );
}
