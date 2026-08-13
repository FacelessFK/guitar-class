"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { isValidIranianMobile } from "@music/shared";

import { safeDestination } from "@/lib/auth-destination";
import { ApiError, apiFetch, errorMessage } from "@/lib/api-client";
import { faDigits, faNumber } from "@/lib/format";
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
    <Suspense fallback={<p className="text-sm text-ink-muted">در حال بارگذاری…</p>}>
      <LoginForm />
    </Suspense>
  );
}

type Step = "PHONE" | "CODE";
type Mode = "PASSWORD" | "OTP";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { status } = useSession();

  const [mode, setMode] = useState<Mode>("PASSWORD");
  const [step, setStep] = useState<Step>("PHONE");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [fullName, setFullName] = useState("");
  const [needsName, setNeedsName] = useState(false);
  const [devCode, setDevCode] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const destination = safeDestination(searchParams.get("next"));

  // کسی که از قبل نشست دارد نباید دوباره کد بگیرد
  useEffect(() => {
    if (status === "authenticated") router.replace(destination);
  }, [status, router, destination]);

  useEffect(() => {
    if (resendIn <= 0) return;

    const timer = setInterval(() => setResendIn((value) => value - 1), 1000);
    return () => clearInterval(timer);
  }, [resendIn]);

  async function requestCode(): Promise<void> {
    if (!isValidIranianMobile(phone)) {
      setError("شماره‌ی موبایل معتبر نیست. مثل ۰۹۱۲۱۲۳۴۵۶۷ وارد کنید.");
      return;
    }

    setPending(true);
    setError(null);

    try {
      const result = await apiFetch<{ retryAfterSeconds: number; devCode?: string }>(
        "/auth/otp/request",
        { method: "POST", body: { phone }, anonymous: true },
      );

      setStep("CODE");
      setResendIn(result.retryAfterSeconds);
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
          setResendIn(retry);
        }

        /**
         * پیام «چند ثانیه صبر کنید» نشان داده نمی‌شود.
         *
         * دقیقاً همان چیزی را می‌گوید که شمارش معکوسِ کنار دکمه
         * می‌گوید، فقط با ارقام لاتین و با عددی که از لحظه‌ی نوشته
         * شدن ثابت می‌ماند. سقفِ ساعتی فرق دارد و پیامش لازم است،
         * چون شمارش معکوس به‌تنهایی نمی‌گوید چرا این‌قدر طولانی است.
         */
        if (caught.code === "COOLDOWN") {
          setError(null);
          return;
        }
      }

      setError(errorMessage(caught));
    } finally {
      setPending(false);
    }
  }

  async function loginWithPassword(): Promise<void> {
    if (!isValidIranianMobile(phone)) {
      setError("شماره‌ی موبایل معتبر نیست. مثل ۰۹۱۲۱۲۳۴۵۶۷ وارد کنید.");
      return;
    }

    setPending(true);
    setError(null);

    try {
      const tokens = await apiFetch<{ accessToken: string }>("/auth/login", {
        method: "POST",
        anonymous: true,
        body: { phone, password },
      });

      await startSession(tokens);
      router.replace(destination);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setPending(false);
    }
  }

  async function verifyCode(): Promise<void> {
    setPending(true);
    setError(null);

    try {
      // توکن تازه‌سازی در بدنه نمی‌آید؛ API آن را در کوکی httpOnly
      // می‌نشاند و جاوااسکریپت اصلاً نمی‌بیندش
      const tokens = await apiFetch<{ accessToken: string }>(
        "/auth/otp/verify",
        {
          method: "POST",
          anonymous: true,
          body: {
            phone,
            code,
            ...(fullName.trim() ? { fullName: fullName.trim() } : {}),
          },
        },
      );

      await startSession(tokens);
      router.replace(destination);
    } catch (caught) {
      if (caught instanceof ApiError && caught.code === "FULL_NAME_REQUIRED") {
        // شماره تازه است. کد سوخته نشده و همین کد با نام دوباره
        // فرستاده می‌شود.
        setNeedsName(true);
        setError("این شماره تازه است. نام و نام خانوادگی‌تان را هم بنویسید.");
      } else {
        setError(errorMessage(caught));
      }
    } finally {
      setPending(false);
    }
  }

  if (status === "loading" || status === "authenticated") {
    return <p className="text-sm text-ink-muted">در حال بارگذاری…</p>;
  }

  return (
    <div className="w-full max-w-sm">
      <h1 className="text-2xl font-bold">ورود به حساب</h1>
      <p className="mt-2 text-sm text-ink-muted">
        {mode === "PASSWORD"
          ? "با شماره‌ی موبایل و رمز عبورتان وارد شوید."
          : "کد ورود برایتان پیامک می‌شود. اگر حساب ندارید، همین‌جا ساخته می‌شود."}
      </p>

      <div className="mt-6 flex gap-2 text-sm">
        {(
          [
            ["PASSWORD", "با رمز عبور"],
            ["OTP", "با کد پیامکی"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            className={
              mode === value
                ? "rounded-lg border border-accent bg-accent/10 px-3 py-1.5 text-accent"
                : "rounded-lg border border-border px-3 py-1.5 text-ink-muted"
            }
            onClick={() => {
              setMode(value);
              setStep("PHONE");
              setCode("");
              setNeedsName(false);
              setError(null);
            }}
          >
            {label}
          </button>
        ))}
      </div>

      <form
        className="mt-6 space-y-4"
        onSubmit={(event) => {
          event.preventDefault();

          if (mode === "PASSWORD") {
            void loginWithPassword();
            return;
          }

          void (step === "PHONE" ? requestCode() : verifyCode());
        }}
      >
        <div>
          <label className="label" htmlFor="phone">
            شماره‌ی موبایل
          </label>
          <input
            id="phone"
            className="input"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            dir="ltr"
            placeholder="09121234567"
            value={phone}
            disabled={mode === "OTP" && step === "CODE"}
            onChange={(event) => setPhone(event.target.value)}
          />
        </div>

        {mode === "PASSWORD" ? (
          <div>
            <label className="label" htmlFor="password">
              رمز عبور
            </label>
            <input
              id="password"
              className="input"
              type="password"
              autoComplete="current-password"
              dir="ltr"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>
        ) : null}

        {mode === "OTP" && step === "CODE" ? (
          <>
            <div>
              <label className="label" htmlFor="code">
                کد شش‌رقمی پیامک‌شده
              </label>
              <input
                id="code"
                className="input text-center tracking-[0.5em]"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                dir="ltr"
                maxLength={6}
                value={code}
                onChange={(event) =>
                  setCode(event.target.value.replace(/\D/g, "").slice(0, 6))
                }
              />
            </div>

            {needsName ? (
              <div>
                <label className="label" htmlFor="fullName">
                  نام و نام خانوادگی
                </label>
                <input
                  id="fullName"
                  className="input"
                  type="text"
                  autoComplete="name"
                  value={fullName}
                  onChange={(event) => setFullName(event.target.value)}
                />
              </div>
            ) : null}

            {devCode ? (
              <p className="alert-info">
                حالت توسعه — کد ورود: <span dir="ltr">{faDigits(devCode)}</span>
              </p>
            ) : null}
          </>
        ) : null}

        {error ? <p className="alert-error">{error}</p> : null}

        <button
          type="submit"
          className="btn-primary w-full"
          disabled={
            pending ||
            (mode === "PASSWORD" && password.length === 0) ||
            (mode === "OTP" && step === "CODE" && code.length < 6)
          }
        >
          {pending
            ? "کمی صبر کنید…"
            : mode === "PASSWORD" || step === "CODE"
              ? "ورود"
              : "دریافت کد"}
        </button>
      </form>

      {mode === "PASSWORD" ? (
        <p className="mt-6 text-sm text-ink-muted">
          حساب ندارید؟{" "}
          <Link className="underline" href="/auth/register">
            ثبت‌نام کنید
          </Link>
        </p>
      ) : null}

      {mode === "OTP" && step === "CODE" ? (
        <div className="mt-6 flex items-center justify-between text-sm text-ink-muted">
          <button
            type="button"
            className="underline"
            onClick={() => {
              setStep("PHONE");
              setCode("");
              setNeedsName(false);
              setError(null);
            }}
          >
            تغییر شماره
          </button>

          <button
            type="button"
            className="underline disabled:no-underline"
            disabled={resendIn > 0 || pending}
            onClick={() => void requestCode()}
          >
            {/*
              سقف ساعتی می‌تواند تا یک ساعت باشد و «۳۵۹۹ ثانیه» عددی
              است که کسی نمی‌خواندش
            */}
            {resendIn > 0 ? `ارسال دوباره تا ${formatWait(resendIn)}` : "ارسال دوباره‌ی کد"}
          </button>
        </div>
      ) : null}
    </div>
  );
}

/** «۲۶ ثانیه» یا «۵ دقیقه» */
function formatWait(seconds: number): string {
  return seconds < 60
    ? `${faNumber(seconds)} ثانیه`
    : `${faNumber(Math.ceil(seconds / 60))} دقیقه`;
}

