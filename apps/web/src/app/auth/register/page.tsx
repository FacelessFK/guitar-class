"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import {
  PASSWORD_POLICY,
  isValidIranianMobile,
  passwordProblemMessage,
} from "@music/shared";

import { AuthCard } from "@/components/auth/auth-card";
import {
  Button,
  EyeIcon,
  EyeSlashIcon,
  Field,
  InlineNotice,
  TextInput,
} from "@/components/ui";
import { ApiError, apiFetch, errorMessage } from "@/lib/api-client";
import { safeDestination } from "@/lib/auth-destination";
import { faNumber } from "@/lib/format";
import { useSession } from "@/lib/session";
import { startSession } from "@/lib/session-store";

/**
 * ثبت‌نام با رمز عبور.
 *
 * صفحه‌ی جدایی از ورود است، برخلاف مسیر کد پیامکی که ثبت‌نام و ورود را
 * یکی می‌کند. دلیلش این است که اینجا **رمز ساخته می‌شود**: نمی‌شود
 * فرمی داشت که هم «رمزت را بزن» باشد و هم «یک رمز انتخاب کن»، چون
 * کاربر تا وقتی نتیجه را نبیند نمی‌داند کدامش را انجام داده — و اگر
 * حساب از قبل وجود داشته باشد، آن فرم به یک راه ساده برای عوض کردن رمزِ
 * دیگری تبدیل می‌شود.
 */
export default function RegisterPage() {
  return (
    <Suspense fallback={<p className="text-sm text-meta">در حال بارگذاری…</p>}>
      <RegisterForm />
    </Suspense>
  );
}

type FieldErrors = Partial<Record<"name" | "phone" | "password", string>>;

function RegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { status } = useSession();

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [reveal, setReveal] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const destination = safeDestination(searchParams.get("next"));

  useEffect(() => {
    if (status === "authenticated") router.replace(destination);
  }, [status, router, destination]);

  async function submit(): Promise<void> {
    const next: FieldErrors = {};

    if (fullName.trim().length < 2) next.name = "نام و نام خانوادگی را بنویس.";
    if (!isValidIranianMobile(phone)) next.phone = "شماره موبایل معتبر نیست.";

    /*
     * همان تابعی که سرور هم با آن می‌سنجد. اگر اینجا کپیِ دستیِ قاعده
     * بود، اولین باری که سیاست عوض می‌شد، فرم چیزی را می‌پذیرفت که API
     * ردش می‌کند.
     */
    const passwordProblem = passwordProblemMessage(password);
    if (passwordProblem) next.password = passwordProblem;

    if (Object.keys(next).length > 0) {
      setErrors(next);
      return;
    }

    setPending(true);
    setErrors({});
    setFormError(null);

    try {
      // توکن تازه‌سازی در بدنه نمی‌آید؛ در کوکی httpOnly می‌نشیند
      const tokens = await apiFetch<{ accessToken: string }>("/auth/register", {
        method: "POST",
        anonymous: true,
        body: { fullName: fullName.trim(), phone, password },
      });

      await startSession(tokens);
      router.replace(destination);
    } catch (caught) {
      if (caught instanceof ApiError && caught.code === "PHONE_ALREADY_REGISTERED") {
        setErrors({ phone: "این شماره از قبل حساب دارد. از صفحه‌ی ورود وارد شو." });
      } else {
        setFormError(errorMessage(caught));
      }
    } finally {
      setPending(false);
    }
  }

  if (status === "loading" || status === "authenticated") {
    return <p className="text-sm text-meta">در حال بارگذاری…</p>;
  }

  return (
    <AuthCard
      heading="ساخت حساب"
      lede="با شماره موبایل و یک رمز عبور ثبت‌نام کن."
      switchLede="حساب داری؟"
      switchHref="/auth/login"
      switchCta="وارد شو"
    >
      <form
        className="mt-6.5 flex flex-col gap-4.5"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <Field label="نام و نام خانوادگی" htmlFor="fullName" error={errors.name}>
          <TextInput
            id="fullName"
            type="text"
            autoComplete="name"
            placeholder="مثلاً علی محمدی"
            invalid={!!errors.name}
            value={fullName}
            onChange={(event) => {
              setFullName(event.target.value);
              setErrors((prev) => ({ ...prev, name: undefined }));
            }}
          />
        </Field>

        <Field label="شماره موبایل" htmlFor="phone" error={errors.phone}>
          <TextInput
            id="phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            dir="ltr"
            placeholder="09121234567"
            invalid={!!errors.phone}
            value={phone}
            onChange={(event) => {
              setPhone(event.target.value);
              setErrors((prev) => ({ ...prev, phone: undefined }));
            }}
          />
        </Field>

        <Field
          label="رمز عبور"
          htmlFor="password"
          error={errors.password}
          hint={`دست‌کم ${faNumber(PASSWORD_POLICY.MIN_LENGTH)} کاراکتر`}
        >
          <div className="relative">
            <TextInput
              id="password"
              // به مرورگر می‌گوید این رمزِ تازه است، نه رمزِ ذخیره‌شده —
              // پیشنهاد رمز قوی و ذخیره‌ی درست به همین بند است
              type={reveal ? "text" : "password"}
              autoComplete="new-password"
              dir="ltr"
              className="pr-11 pl-3.5"
              invalid={!!errors.password}
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
                setErrors((prev) => ({ ...prev, password: undefined }));
              }}
            />
            <button
              type="button"
              onClick={() => setReveal(!reveal)}
              aria-label={reveal ? "پنهان کردن رمز عبور" : "نمایش رمز عبور"}
              aria-pressed={reveal}
              className="absolute top-1/2 right-3 grid size-6 -translate-y-1/2 cursor-pointer place-items-center border-0 bg-transparent p-0 text-meta transition-colors hover:text-ink-2"
            >
              {reveal ? <EyeSlashIcon /> : <EyeIcon />}
            </button>
          </div>
        </Field>

        {formError ? <InlineNotice tone="error">{formError}</InlineNotice> : null}

        <Button
          type="submit"
          block
          busy={pending}
          className="mt-1 h-13 text-base"
        >
          ساخت حساب
        </Button>
      </form>
    </AuthCard>
  );
}
