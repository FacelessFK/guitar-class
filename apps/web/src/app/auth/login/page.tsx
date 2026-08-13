"use client";

import type { Route } from "next";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { isValidIranianMobile } from "@music/shared";

import { ApiError, apiFetch, errorMessage } from "@/lib/api-client";
import { faDigits, faNumber } from "@/lib/format";
import { useSession } from "@/lib/session";
import { startSession } from "@/lib/session-store";

/**
 * ورود با شماره‌ی موبایل و کد پیامکی.
 *
 * دو مرحله دارد و مرحله‌ی سومی به نام «ثبت‌نام» ندارد: اگر شماره تازه
 * باشد، همان‌جا نام پرسیده می‌شود و حساب ساخته می‌شود. API هم همین‌طور
 * کار می‌کند — ثبت‌نام و ورود یک مسیرند.
 *
 * فرم نام از اول نشان داده نمی‌شود چون بیشتر ورودها تکراری‌اند و
 * پرسیدن نام از کاربر قدیمی گیج‌کننده است. API تا وقتی کد را نبیند
 * هم نمی‌گوید شماره ثبت شده یا نه (جلوگیری از پیمایش شماره‌ها)، پس
 * تنها راه درست همین است: بپرس، و اگر گفت نام لازم است، آن‌وقت بپرس.
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

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { status } = useSession();

  const [step, setStep] = useState<Step>("PHONE");
  const [phone, setPhone] = useState("");
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
        با شماره‌ی موبایل وارد شوید. اگر حساب ندارید، همین‌جا ساخته می‌شود.
      </p>

      <form
        className="mt-8 space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
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
            disabled={step === "CODE"}
            onChange={(event) => setPhone(event.target.value)}
          />
        </div>

        {step === "CODE" ? (
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
          disabled={pending || (step === "CODE" && code.length < 6)}
        >
          {pending ? "کمی صبر کنید…" : step === "PHONE" ? "دریافت کد" : "ورود"}
        </button>
      </form>

      {step === "CODE" ? (
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

/**
 * مقصد پس از ورود.
 *
 * فقط مسیر داخلی پذیرفته می‌شود. بدون این بررسی، لینکی مثل
 * `/auth/login?next=https://example.com` صفحه‌ی ورودِ سایت خودمان را به
 * پرش به دامنه‌ی مهاجم تبدیل می‌کند — و کاربری که همین حالا اعتماد کرده
 * و رمزش را زده، آن صفحه را ادامه‌ی همین سایت می‌بیند.
 *
 * `//host` هم رد می‌شود: با اسلش شروع می‌شود ولی مرورگر آن را آدرس
 * مطلقِ پروتکل‌نسبی می‌خواند.
 */
function safeDestination(next: string | null): Route {
  if (next && next.startsWith("/") && !next.startsWith("//")) {
    return next as Route;
  }

  return "/dashboard";
}
