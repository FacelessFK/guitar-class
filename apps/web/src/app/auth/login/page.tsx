"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { isValidIranianMobile } from "@music/shared";

import { AuthCard } from "@/components/auth/auth-card";
import {
  Button,
  EyeIcon,
  EyeSlashIcon,
  Field,
  InlineNotice,
  OtpInput,
  Tabs,
  TextInput,
} from "@/components/ui";
import { useCountdown } from "@/hooks/use-countdown";
import { ApiError, apiFetch, errorMessage } from "@/lib/api-client";
import { safeDestination } from "@/lib/auth-destination";
import { cx } from "@/lib/cx";
import { faDigits } from "@/lib/format";
import { useSession } from "@/lib/session";
import { startSession } from "@/lib/session-store";

/**
 * ورود — با رمز عبور یا با کد پیامکی.
 *
 * **مسیر کد پیامکی دو مرحله دارد و مرحله‌ی سومی به نام «ثبت‌نام»
 * ندارد:** اگر شماره تازه باشد، همان‌جا نام پرسیده می‌شود و حساب ساخته
 * می‌شود. فرم نام از اول نشان داده نمی‌شود چون بیشتر ورودها تکراری‌اند
 * و پرسیدن نام از کاربر قدیمی گیج‌کننده است. API هم تا وقتی کد را
 * نبیند نمی‌گوید شماره ثبت شده یا نه (جلوگیری از پیمایش شماره‌ها)، پس
 * تنها راه درست همین است: بپرس، و اگر گفت نام لازم است، آن‌وقت بپرس.
 *
 * دیزاین این حالت را **خطا نمی‌داند**: تیتر می‌شود «یک قدم دیگر…» و
 * توضیحش به لید می‌رود، نه به کادر خطا.
 *
 * مسیر رمز عبور صفحه‌ی ثبت‌نام جدا دارد، چون آنجا رمز **ساخته** می‌شود
 * و یک فرمِ دو‌منظوره به راهی برای عوض کردن رمزِ حسابِ دیگری تبدیل
 * می‌شد.
 *
 * پیش‌فرض روی رمز عبور است چون تا وقتی خط پیامکی فعال نشده، کد ورود
 * فقط در لاگ سرور می‌نشیند و از دست کاربر کاری برنمی‌آید.
 */
export default function LoginPage() {
  return (
    // `useSearchParams` بدون این مرز، بیلد ایستا را با خطای
    // «should be wrapped in a suspense boundary» رد می‌کند
    <Suspense fallback={<AuthLoading />}>
      <LoginForm />
    </Suspense>
  );
}

function AuthLoading() {
  return <p className="text-sm text-meta">در حال بارگذاری…</p>;
}

type Step = "PHONE" | "CODE";
type Mode = "PASSWORD" | "OTP";
type FieldErrors = Partial<Record<"phone" | "password" | "code" | "name", string>>;

const MODE_TABS = [
  { value: "PASSWORD" as const, label: "رمز عبور" },
  { value: "OTP" as const, label: "کد پیامکی" },
];

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { status } = useSession();

  const [mode, setMode] = useState<Mode>("PASSWORD");
  const [step, setStep] = useState<Step>("PHONE");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [reveal, setReveal] = useState(false);
  const [code, setCode] = useState("");
  const [fullName, setFullName] = useState("");
  const [needsName, setNeedsName] = useState(false);
  const [devCode, setDevCode] = useState<string | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  /*
   * شمارنده «آزاد» است و با `reset` جلو می‌افتد، نه با پراپ: محدودسازی
   * نرخ می‌تواند دو بار پشت هم همان عدد را برگرداند و شمارنده‌ی
   * پراپ‌محور در آن حالت دوباره شروع نمی‌شد.
   */
  const resend = useCountdown(0);
  const destination = safeDestination(searchParams.get("next"));

  // کسی که از قبل نشست دارد نباید دوباره کد بگیرد
  useEffect(() => {
    if (status === "authenticated") router.replace(destination);
  }, [status, router, destination]);

  const codeStep = mode === "OTP" && step === "CODE";

  function clearErrors() {
    setErrors({});
    setFormError(null);
  }

  async function requestCode(): Promise<void> {
    if (!isValidIranianMobile(phone)) {
      setErrors({ phone: "شماره موبایل معتبر نیست." });
      return;
    }

    setPending(true);
    clearErrors();

    try {
      const result = await apiFetch<{ retryAfterSeconds: number; devCode?: string }>(
        "/auth/otp/request",
        { method: "POST", body: { phone }, anonymous: true },
      );

      setStep("CODE");
      resend.reset(result.retryAfterSeconds);
      // در توسعه پیامک جعلی است و کد در پاسخ می‌آید؛ در تولید
      // این فیلد اصلاً وجود ندارد
      setDevCode(result.devCode ?? null);
    } catch (caught) {
      // محدودسازی نرخ `retryAfterSeconds` می‌دهد — شمارش معکوس را
      // با همان می‌نشانیم تا کاربر بداند چقدر باید صبر کند
      if (caught instanceof ApiError) {
        const retry = caught.body.retryAfterSeconds;
        if (typeof retry === "number") {
          setStep("CODE");
          resend.reset(retry);
        }

        /**
         * پیام «چند ثانیه صبر کنید» نشان داده نمی‌شود.
         *
         * دقیقاً همان چیزی را می‌گوید که شمارش معکوسِ کنار دکمه
         * می‌گوید، فقط با ارقام لاتین و با عددی که از لحظه‌ی نوشته
         * شدن ثابت می‌ماند. سقفِ ساعتی فرق دارد و پیامش لازم است،
         * چون شمارش معکوس به‌تنهایی نمی‌گوید چرا این‌قدر طولانی است.
         */
        if (caught.code === "COOLDOWN") return;
      }

      setFormError(errorMessage(caught));
    } finally {
      setPending(false);
    }
  }

  async function loginWithPassword(): Promise<void> {
    const next: FieldErrors = {};
    if (!isValidIranianMobile(phone)) next.phone = "شماره موبایل معتبر نیست.";
    if (!password) next.password = "رمز عبور را وارد کن.";

    if (Object.keys(next).length > 0) {
      setErrors(next);
      return;
    }

    setPending(true);
    clearErrors();

    try {
      const tokens = await apiFetch<{ accessToken: string }>("/auth/login", {
        method: "POST",
        anonymous: true,
        body: { phone, password },
      });

      await startSession(tokens);
      router.replace(destination);
    } catch (caught) {
      setFormError(errorMessage(caught));
    } finally {
      setPending(false);
    }
  }

  async function verifyCode(): Promise<void> {
    if (code.length < 6) {
      setErrors({ code: "کد ۶ رقمی را کامل وارد کن." });
      return;
    }

    if (needsName && !fullName.trim()) {
      setErrors({ name: "برای ساخت حساب، نام و نام خانوادگی لازم است." });
      return;
    }

    setPending(true);
    clearErrors();

    try {
      // توکن تازه‌سازی در بدنه نمی‌آید؛ API آن را در کوکی httpOnly
      // می‌نشاند و جاوااسکریپت اصلاً نمی‌بیندش
      const tokens = await apiFetch<{ accessToken: string }>("/auth/otp/verify", {
        method: "POST",
        anonymous: true,
        body: {
          phone,
          code,
          ...(fullName.trim() ? { fullName: fullName.trim() } : {}),
        },
      });

      await startSession(tokens);
      router.replace(destination);
    } catch (caught) {
      if (caught instanceof ApiError && caught.code === "FULL_NAME_REQUIRED") {
        // شماره تازه است. کد سوخته نشده و همین کد با نام دوباره
        // فرستاده می‌شود. دیزاین این را در لید می‌گوید نه در خطا.
        setNeedsName(true);
      } else {
        setFormError(errorMessage(caught));
      }
    } finally {
      setPending(false);
    }
  }

  if (status === "loading" || status === "authenticated") {
    return <AuthLoading />;
  }

  return (
    <AuthCard
      heading={
        codeStep
          ? needsName
            ? "یک قدم دیگر…"
            : "کد پیامک‌شده را وارد کن"
          : "ورود به حساب"
      }
      lede={
        codeStep ? (
          needsName ? (
            "این شماره تازه است. برای ساخت حساب، نام و نام خانوادگی‌ات را هم بنویس."
          ) : (
            <>
              <span>کد ۶ رقمی به </span>
              <bdi dir="ltr" className="[unicode-bidi:isolate]">
                {maskPhone(phone)}
              </bdi>
              <span> ارسال شد.</span>
            </>
          )
        ) : mode === "PASSWORD" ? (
          "با شماره موبایل و رمز عبورت وارد شو."
        ) : (
          "کد ورود برایت پیامک می‌شود. اگر حساب نداشته باشی، همین‌جا ساخته می‌شود."
        )
      }
      switchLede={codeStep ? undefined : "حساب نداری؟"}
      switchHref={codeStep ? undefined : "/auth/register"}
      switchCta={codeStep ? undefined : "ساخت حساب"}
    >
      {!codeStep ? (
        <Tabs
          dense
          underline="wide"
          className="mt-6.5"
          items={MODE_TABS}
          active={mode}
          onSelect={(value) => {
            setMode(value);
            setStep("PHONE");
            setCode("");
            setNeedsName(false);
            if (value === "OTP") setPassword("");
            clearErrors();
          }}
        />
      ) : null}

      <form
        className="mt-6.5 flex flex-col gap-4.5"
        onSubmit={(event) => {
          event.preventDefault();

          if (mode === "PASSWORD") {
            void loginWithPassword();
            return;
          }

          void (step === "PHONE" ? requestCode() : verifyCode());
        }}
      >
        {needsName ? (
          <Field label="نام و نام خانوادگی" htmlFor="fullName" error={errors.name}>
            <TextInput
              id="fullName"
              type="text"
              autoComplete="name"
              placeholder="مثلاً علی محمدی"
              invalid={!!errors.name}
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
            />
          </Field>
        ) : null}

        {!codeStep ? (
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
        ) : null}

        {mode === "PASSWORD" ? (
          <Field label="رمز عبور" htmlFor="password" error={errors.password}>
            <div className="relative">
              <TextInput
                id="password"
                type={reveal ? "text" : "password"}
                autoComplete="current-password"
                dir="ltr"
                className="pr-11 pl-3.5"
                invalid={!!errors.password}
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value);
                  setErrors((prev) => ({ ...prev, password: undefined }));
                }}
              />
              {/*
                جای دکمه **فیزیکی** است نه منطقی: ورودی `dir="ltr"` است
                و متن رمز از چپ شروع می‌شود، پس چشم آیکون را سمت راستِ
                فیزیکی می‌خواهد — همان‌جایی که دیزاین گذاشته.
              */}
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
        ) : null}

        {codeStep ? (
          <Field
            label="کد شش‌رقمی پیامک‌شده"
            htmlFor="hg-code-0"
            error={errors.code}
          >
            <OtpInput
              value={code}
              onChange={(next) => {
                setCode(next);
                setErrors((prev) => ({ ...prev, code: undefined }));
              }}
              invalid={!!errors.code}
              label="کد شش‌رقمی پیامک‌شده"
              autoFocus
            />
          </Field>
        ) : null}

        {devCode && codeStep ? (
          <InlineNotice>
            حالت توسعه — کد ورود:{" "}
            <bdi dir="ltr" className="text-ink">
              {faDigits(devCode)}
            </bdi>
          </InlineNotice>
        ) : null}

        {formError ? <InlineNotice tone="error">{formError}</InlineNotice> : null}

        <Button
          type="submit"
          block
          busy={pending}
          className="mt-1 h-13 text-base"
          disabled={
            (mode === "PASSWORD" && password.length === 0) ||
            (mode === "OTP" && step === "PHONE" && phone.length < 11) ||
            (codeStep && code.length < 6)
          }
        >
          {mode === "PASSWORD"
            ? "ورود"
            : step === "PHONE"
              ? "دریافت کد"
              : needsName
                ? "ساخت حساب و ادامه"
                : "ورود"}
        </Button>
      </form>

      {codeStep ? (
        <div className="mt-5 flex items-center justify-between gap-3 text-sm">
          <button
            type="button"
            className="cursor-pointer border-0 bg-transparent p-0 text-violet-strong transition-colors hover:text-ink"
            onClick={() => {
              setStep("PHONE");
              setCode("");
              setNeedsName(false);
              setDevCode(null);
              resend.reset(0);
              clearErrors();
            }}
          >
            تغییر شماره
          </button>

          <button
            type="button"
            disabled={!resend.done || pending}
            onClick={() => void requestCode()}
            className={cx(
              "border-0 bg-transparent p-0 transition-colors",
              resend.done
                ? "cursor-pointer text-violet-strong hover:text-ink"
                : "cursor-default text-meta",
            )}
          >
            {resend.done
              ? "ارسال دوباره کد"
              : `ارسال دوباره تا ${resend.clock}`}
          </button>
        </div>
      ) : null}
    </AuthCard>
  );
}

/**
 * `0912•••4567` با ارقام فارسی.
 *
 * لید مرحله‌ی کد باید بگوید کد به کجا رفت، بی‌آنکه کل شماره را روی
 * صفحه‌ی مشترک یا اسکرین‌شات بگذارد.
 */
function maskPhone(input: string): string {
  if (input.length < 11) return faDigits(input);
  return faDigits(`${input.slice(0, 4)}•••${input.slice(7)}`);
}
