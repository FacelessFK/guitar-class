"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import {
  PASSWORD_POLICY,
  isValidIranianMobile,
  passwordProblemMessage,
} from "@music/shared";

import { safeDestination } from "@/lib/auth-destination";
import { ApiError, apiFetch, errorMessage } from "@/lib/api-client";
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
    <Suspense fallback={<p className="text-sm text-ink-muted">در حال بارگذاری…</p>}>
      <RegisterForm />
    </Suspense>
  );
}

function RegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { status } = useSession();

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const destination = safeDestination(searchParams.get("next"));

  useEffect(() => {
    if (status === "authenticated") router.replace(destination);
  }, [status, router, destination]);

  async function submit(): Promise<void> {
    if (fullName.trim().length < 2) {
      setError("نام و نام خانوادگی را بنویسید.");
      return;
    }

    if (!isValidIranianMobile(phone)) {
      setError("شماره‌ی موبایل معتبر نیست. مثل ۰۹۱۲۱۲۳۴۵۶۷ وارد کنید.");
      return;
    }

    // همان تابعی که سرور هم با آن می‌سنجد. اگر اینجا کپیِ دستیِ قاعده
    // بود، اولین باری که سیاست عوض می‌شد، فرم چیزی را می‌پذیرفت که API
    // ردش می‌کند.
    const passwordProblem = passwordProblemMessage(password);

    if (passwordProblem) {
      setError(passwordProblem);
      return;
    }

    setPending(true);
    setError(null);

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
        setError("این شماره از قبل حساب دارد. از صفحه‌ی ورود وارد شوید.");
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
      <h1 className="text-2xl font-bold">ساخت حساب</h1>
      <p className="mt-2 text-sm text-ink-muted">
        با شماره‌ی موبایل و یک رمز عبور ثبت‌نام کنید.
      </p>

      <form
        className="mt-8 space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
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
            onChange={(event) => setPhone(event.target.value)}
          />
        </div>

        <div>
          <label className="label" htmlFor="password">
            رمز عبور
          </label>
          <input
            id="password"
            className="input"
            type="password"
            // به مرورگر می‌گوید این رمزِ تازه است، نه رمزِ ذخیره‌شده —
            // پیشنهاد رمز قوی و ذخیره‌ی درست به همین بند است
            autoComplete="new-password"
            dir="ltr"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <p className="mt-1 text-xs text-ink-muted">
            دست‌کم {faNumber(PASSWORD_POLICY.MIN_LENGTH)} کاراکتر.
          </p>
        </div>

        {error ? <p className="alert-error">{error}</p> : null}

        <button type="submit" className="btn-primary w-full" disabled={pending}>
          {pending ? "کمی صبر کنید…" : "ساخت حساب"}
        </button>
      </form>

      <p className="mt-6 text-sm text-ink-muted">
        حساب دارید؟{" "}
        <Link className="underline" href="/auth/login">
          وارد شوید
        </Link>
      </p>
    </div>
  );
}
