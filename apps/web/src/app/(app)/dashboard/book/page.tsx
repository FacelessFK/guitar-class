"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import {
  BUSINESS_RULES,
  addDaysToDateKey,
  parseTimeToMinutes,
  tehranDateKey,
} from "@music/shared";

import { SlotBoard } from "@/components/slot-board";
import { errorMessage } from "@/lib/api-client";
import {
  bookPackage,
  bookSingle,
  bookTrial,
  getCredit,
  getInstruments,
  getSlots,
  getTeachers,
  previewPackage,
  startCheckout,
  type Instrument,
  type Offering,
  type PackagePreview,
  type Slot,
  type Teacher,
} from "@/lib/app-api";
import {
  faDigits,
  faNumber,
  formatDuration,
  formatJalaliDayMonth,
  formatToman,
} from "@/lib/format";
import { useSession } from "@/lib/session";

/**
 * جریان رزرو.
 *
 * چهار انتخاب پشت سر هم: ساز، استاد، نوع جلسه، ساعت. هر انتخاب،
 * انتخاب‌های بعدی را باطل می‌کند — عوض کردن ساز وقتی استادی انتخاب
 * شده یعنی آن استاد دیگر معتبر نیست، و نگه داشتنش یعنی رزرو گیتار
 * برای استاد سنتور.
 *
 * همه‌ی مراحل در یک صفحه‌اند نه در چهار مسیر جدا: کاربر باید بتواند
 * برگردد و ساز را عوض کند بدون اینکه از اول شروع کند.
 */
export default function BookPage() {
  return (
    <Suspense fallback={<p className="mx-auto max-w-3xl px-5 py-12">در حال بارگذاری…</p>}>
      <BookingFlow />
    </Suspense>
  );
}

type SessionType = "TRIAL" | "SINGLE" | "PACKAGE";

/** بازه‌ای که هر بار اسلات‌هایش خوانده می‌شود. */
const WINDOW_DAYS = 14;

function BookingFlow() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useSession();

  const [instruments, setInstruments] = useState<Instrument[] | null>(null);
  const [teachers, setTeachers] = useState<Teacher[] | null>(null);

  const [instrument, setInstrument] = useState<Instrument | null>(null);
  const [teacher, setTeacher] = useState<Teacher | null>(null);
  const [sessionType, setSessionType] = useState<SessionType | null>(null);
  const [slot, setSlot] = useState<Slot | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  /**
   * اعتبار همان اول خوانده می‌شود، نه در مرحله‌ی تأیید.
   *
   * خواندنش موقع تأیید یعنی تیک «استفاده از اعتبار» یک لحظه بعد از
   * دیده شدنِ باقی صفحه ظاهر شود — درست وقتی کاربر دستش روی دکمه است.
   * خطای خواندنش صفحه را نمی‌خواباند: بدون اعتبار هم می‌شود رزرو کرد.
   */
  const [credit, setCredit] = useState<bigint | null>(null);
  const [useCredit, setUseCredit] = useState(true);

  useEffect(() => {
    getCredit()
      .then((result) => setCredit(BigInt(result.balance)))
      .catch(() => setCredit(null));
  }, []);

  const hasCredit = credit !== null && credit > 0n;
  const offering = findOffering(teacher, instrument);

  /**
   * ورود از صفحه‌ی عمومی استاد.
   *
   * لینک «رزرو» کنار هر سرویس، هم ساز و هم استاد را همراه می‌آورد، پس
   * کاربری که از سئو آمده و روی استاد مشخصی تصمیم گرفته، دو مرحله‌ی
   * اول را دوباره طی نمی‌کند. اگر پارامترها به چیزی نخورند بی‌صدا
   * نادیده گرفته می‌شوند و جریان از اول شروع می‌شود.
   */
  const preselectedTeacher = searchParams.get("teacher");
  const preselectedInstrument = searchParams.get("instrument");
  const preselectionApplied = useRef(false);

  useEffect(() => {
    getInstruments()
      .then((result) => {
        setInstruments(result);

        const match = result.find((item) => item.slug === preselectedInstrument);
        if (match) setInstrument(match);
      })
      .catch(() => setInstruments([]));
  }, [preselectedInstrument]);

  // فهرست استادها با هر بار عوض شدن ساز دوباره خوانده می‌شود؛ فیلتر
  // سمت سرور است تا استادی که این ساز را تدریس نمی‌کند اصلاً نیاید
  useEffect(() => {
    if (!instrument) {
      setTeachers(null);
      return;
    }

    let cancelled = false;
    getTeachers(instrument.slug)
      .then((result) => {
        if (cancelled) return;
        setTeachers(result);

        /**
         * پیش‌انتخاب فقط **یک بار** اعمال می‌شود.
         *
         * بدون این نگهبان، هر بار که کاربر ساز را عوض کند و استادِ
         * لینک هم آن ساز را تدریس کند، انتخابش دوباره برمی‌گردد —
         * یعنی صفحه انتخاب کاربر را پس می‌زند.
         */
        if (preselectionApplied.current) return;
        preselectionApplied.current = true;

        const match = result.find((item) => item.slug === preselectedTeacher);
        if (match) setTeacher(match);
      })
      .catch(() => !cancelled && setTeachers([]));

    return () => {
      cancelled = true;
    };
  }, [instrument, preselectedTeacher]);

  /**
   * هر مرحله، مراحل بعد از خودش را پاک می‌کند.
   *
   * بدون این، انتخاب‌های ناسازگار کنار هم می‌مانند: ساعتی که برای
   * استاد قبلی انتخاب شده بود، برای استاد جدید معنایی ندارد ولی روی
   * صفحه باقی می‌ماند و دکمه‌ی تأیید فعال است.
   */
  function chooseInstrument(next: Instrument) {
    setInstrument(next);
    setTeacher(null);
    setSessionType(null);
    setSlot(null);
    setError(null);
  }

  function chooseTeacher(next: Teacher) {
    setTeacher(next);
    setSessionType(null);
    setSlot(null);
    setError(null);
  }

  function chooseSessionType(next: SessionType) {
    setSessionType(next);
    setSlot(null);
    setError(null);
  }

  async function confirm() {
    if (!teacher || !offering || !slot || !sessionType) return;

    setPending(true);
    setError(null);

    const selection = {
      teacherProfileId: teacher.profileId,
      offeringId: offering.id,
      date: slot.date,
      startMinute: parseTimeToMinutes(slot.startTime),
    };

    try {
      if (sessionType === "TRIAL") {
        await bookTrial(selection);
        // معارفه رایگان است و مستقیم `CONFIRMED` می‌شود؛ مرحله‌ی
        // پرداختی وجود ندارد
        router.push("/dashboard");
        return;
      }

      const spendCredit = hasCredit && useCredit;

      const order =
        sessionType === "SINGLE"
          ? await bookSingle(selection).then((booking) =>
              startCheckout({ bookingId: booking.id, useCredit: spendCredit }),
            )
          : await bookPackage({
              teacherProfileId: selection.teacherProfileId,
              offeringId: selection.offeringId,
              firstSessionDate: selection.date,
              startMinute: selection.startMinute,
            }).then((result) =>
              startCheckout({ enrollmentId: result.enrollmentId, useCredit: spendCredit }),
            );

      // اعتبار کل مبلغ را پوشاند و سفارش همان‌جا قطعی شد — درگاهی نبود
      if (order.settled) {
        const outcome = order.unmatched ? "paid_unmatched" : "paid";
        router.push(`/payment/result?order=${order.orderId}&status=${outcome}`);
        return;
      }

      if (!order.redirectUrl) {
        throw new Error("درگاه پرداخت آدرسی برنگرداند.");
      }

      // درگاه بیرون از دامنه‌ی ماست
      window.location.href = order.redirectUrl;
    } catch (caught) {
      setError(errorMessage(caught));
      setPending(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-5 py-12">
      <h1 className="text-2xl font-bold">رزرو کلاس</h1>

      <Step number={1} title="ساز">
        {instruments === null ? (
          <p className="text-sm text-ink-muted">در حال بارگذاری…</p>
        ) : (
          <ChipGroup
            options={instruments.map((item) => ({ key: item.slug, label: item.nameFa }))}
            selected={instrument?.slug ?? null}
            onSelect={(key) => {
              const found = instruments.find((item) => item.slug === key);
              if (found) chooseInstrument(found);
            }}
          />
        )}
      </Step>

      {instrument ? (
        <Step number={2} title="استاد">
          {teachers === null ? (
            <p className="text-sm text-ink-muted">در حال بارگذاری…</p>
          ) : teachers.length === 0 ? (
            <p className="text-sm text-ink-muted">
              فعلاً استادی برای {instrument.nameFa} در دسترس نیست.
            </p>
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2">
              {teachers.map((item) => (
                <li key={item.profileId}>
                  <TeacherOption
                    teacher={item}
                    instrumentSlug={instrument.slug}
                    selected={teacher?.profileId === item.profileId}
                    onSelect={() => chooseTeacher(item)}
                  />
                </li>
              ))}
            </ul>
          )}
        </Step>
      ) : null}

      {teacher && offering ? (
        <Step number={3} title="نوع جلسه">
          <SessionTypePicker
            offering={offering}
            trialUsed={user?.trialUsed ?? true}
            selected={sessionType}
            onSelect={chooseSessionType}
          />
        </Step>
      ) : null}

      {teacher && offering && sessionType ? (
        <Step number={4} title="ساعت">
          <SlotPicker
            offeringId={offering.id}
            teacherProfileId={teacher.profileId}
            trial={sessionType === "TRIAL"}
            selected={slot}
            onSelect={setSlot}
          />
        </Step>
      ) : null}

      {teacher && offering && sessionType && slot ? (
        <Confirmation
          teacher={teacher}
          offering={offering}
          sessionType={sessionType}
          slot={slot}
          pending={pending}
          error={error}
          credit={hasCredit ? credit : null}
          useCredit={useCredit}
          onUseCreditChange={setUseCredit}
          onConfirm={() => void confirm()}
        />
      ) : null}
    </div>
  );
}

/**
 * سرویسِ متناظر با جفتِ (استاد، ساز).
 *
 * قیمت روی استاد نیست، روی این جفت است. `undefined` یعنی این استاد
 * این ساز را تدریس نمی‌کند — که نباید پیش بیاید چون فهرست از سرور
 * فیلتر شده می‌آید، ولی نبودنش نباید به خطای زمان اجرا تبدیل شود.
 */
function findOffering(teacher: Teacher | null, instrument: Instrument | null) {
  if (!teacher || !instrument) return null;
  return (
    teacher.offerings.find((item) => item.instrumentSlug === instrument.slug) ?? null
  );
}

function Step({
  number,
  title,
  children,
}: {
  number: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-10">
      <h2 className="text-lg font-bold">
        <span className="text-ink-muted">{faNumber(number)}. </span>
        {title}
      </h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function ChipGroup({
  options,
  selected,
  onSelect,
}: {
  options: Array<{ key: string; label: string }>;
  selected: string | null;
  onSelect: (key: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => (
        <button
          key={option.key}
          type="button"
          onClick={() => onSelect(option.key)}
          className={
            option.key === selected
              ? "rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-ink"
              : "rounded-lg border border-border px-4 py-2 text-sm hover:border-ink-muted"
          }
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function TeacherOption({
  teacher,
  instrumentSlug,
  selected,
  onSelect,
}: {
  teacher: Teacher;
  instrumentSlug: string;
  selected: boolean;
  onSelect: () => void;
}) {
  const offering = teacher.offerings.find(
    (item) => item.instrumentSlug === instrumentSlug,
  );

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`card w-full text-right ${selected ? "border-accent" : ""}`}
    >
      <h3 className="font-bold">{teacher.fullName}</h3>
      <p className="mt-1 text-sm text-ink-muted">{teacher.headline}</p>
      {offering ? (
        <p className="mt-3 text-sm">
          {formatToman(offering.price)} تومان ·{" "}
          {formatDuration(offering.durationMinutes)}
        </p>
      ) : null}
    </button>
  );
}

function SessionTypePicker({
  offering,
  trialUsed,
  selected,
  onSelect,
}: {
  offering: Offering;
  trialUsed: boolean;
  selected: SessionType | null;
  onSelect: (type: SessionType) => void;
}) {
  const packageTotal = (BigInt(offering.price) * BigInt(BUSINESS_RULES.PACKAGE_SESSION_COUNT)).toString();

  return (
    <ul className="grid gap-4 sm:grid-cols-3">
      <TypeOption
        title="جلسه‌ی معارفه"
        price="رایگان"
        note={
          trialUsed
            ? "قبلاً استفاده کرده‌اید — یک‌بار برای همیشه است"
            : `${faNumber(BUSINESS_RULES.TRIAL_DURATION_MINUTES)} دقیقه آشنایی با استاد`
        }
        disabled={trialUsed}
        selected={selected === "TRIAL"}
        onSelect={() => onSelect("TRIAL")}
      />
      <TypeOption
        title="جلسه‌ی تکی"
        price={`${formatToman(offering.price)} تومان`}
        note={formatDuration(offering.durationMinutes)}
        selected={selected === "SINGLE"}
        onSelect={() => onSelect("SINGLE")}
      />
      <TypeOption
        title="پکیج ماهانه"
        price={`${formatToman(packageTotal)} تومان`}
        note={`${faNumber(BUSINESS_RULES.PACKAGE_SESSION_COUNT)} جلسه، هفته‌ای یکی، همان روز و همان ساعت`}
        selected={selected === "PACKAGE"}
        onSelect={() => onSelect("PACKAGE")}
      />
    </ul>
  );
}

function TypeOption({
  title,
  price,
  note,
  disabled = false,
  selected,
  onSelect,
}: {
  title: string;
  price: string;
  note: string;
  disabled?: boolean;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        disabled={disabled}
        onClick={onSelect}
        className={`card w-full text-right ${selected ? "border-accent" : ""} ${
          disabled ? "opacity-50" : ""
        }`}
      >
        <h3 className="font-bold">{title}</h3>
        <p className="mt-2">{price}</p>
        <p className="mt-1 text-sm text-ink-muted">{note}</p>
      </button>
    </li>
  );
}

/**
 * انتخاب ساعت.
 *
 * اسلات‌ها در دیتابیس ذخیره نمی‌شوند و هر بار محاسبه می‌شوند (سند
 * معماری، بخش ۴.۳)، پس این فهرست همیشه تازه است. بازه‌ی دوهفته‌ای
 * است چون سقف درخواست ۶۲ روز است و رزروِ خیلی دور معنای کسب‌وکاری
 * ندارد؛ دکمه‌ی «دو هفته‌ی بعد» پنجره را جلو می‌برد.
 */
function SlotPicker({
  offeringId,
  teacherProfileId,
  trial,
  selected,
  onSelect,
}: {
  offeringId: string;
  teacherProfileId: string;
  trial: boolean;
  selected: Slot | null;
  onSelect: (slot: Slot) => void;
}) {
  const [offset, setOffset] = useState(0);
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const from = addDaysToDateKey(tehranDateKey(new Date()), offset);
  const to = addDaysToDateKey(from, WINDOW_DAYS - 1);

  const load = useCallback(async () => {
    setSlots(null);
    try {
      setSlots(await getSlots({ offeringId, teacherProfileId, from, to, trial }));
      setError(null);
    } catch (caught) {
      setSlots([]);
      setError(errorMessage(caught));
    }
  }, [offeringId, teacherProfileId, from, to, trial]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div>
      <div className="flex items-center justify-between gap-4 text-sm">
        <span className="text-ink-muted">
          از {formatJalaliDayMonth(from)} تا {formatJalaliDayMonth(to)}
        </span>
        <div className="flex gap-3">
          <button
            type="button"
            className="underline disabled:no-underline disabled:text-ink-muted"
            disabled={offset === 0}
            onClick={() => setOffset((value) => Math.max(0, value - WINDOW_DAYS))}
          >
            دو هفته‌ی قبل
          </button>
          <button
            type="button"
            className="underline"
            onClick={() => setOffset((value) => value + WINDOW_DAYS)}
          >
            دو هفته‌ی بعد
          </button>
        </div>
      </div>

      {error ? <p className="alert-error mt-4">{error}</p> : null}

      {slots === null ? (
        <p className="mt-4 text-sm text-ink-muted">در حال بارگذاری ساعت‌های آزاد…</p>
      ) : slots.length === 0 ? (
        <p className="alert-info mt-4">
          در این دو هفته ساعت آزادی نیست. بازه‌ی بعدی را ببینید یا استاد دیگری
          انتخاب کنید.
        </p>
      ) : (
        <div className="mt-5">
          <SlotBoard slots={slots} selected={selected} onSelect={onSelect} />
        </div>
      )}
    </div>
  );
}

/**
 * تأیید نهایی.
 *
 * برای پکیج، پیش از هر رزروی `package-preview` صدا زده می‌شود: اگر
 * یکی از چهار هفته آزاد نباشد، همان‌جا معلوم می‌شود و کاربر ساعت
 * دیگری انتخاب می‌کند. بدون آن، خطا بعد از رفتن به درگاه می‌آمد.
 */
function Confirmation({
  teacher,
  offering,
  sessionType,
  slot,
  pending,
  error,
  credit,
  useCredit,
  onUseCreditChange,
  onConfirm,
}: {
  teacher: Teacher;
  offering: Offering;
  sessionType: SessionType;
  slot: Slot;
  pending: boolean;
  error: string | null;
  /** موجودی اعتبار به ریال — تهی یعنی اعتباری نیست و گزینه‌ای نشان داده نمی‌شود */
  credit: bigint | null;
  useCredit: boolean;
  onUseCreditChange: (value: boolean) => void;
  onConfirm: () => void;
}) {
  const [preview, setPreview] = useState<PackagePreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  useEffect(() => {
    if (sessionType !== "PACKAGE") {
      setPreview(null);
      return;
    }

    let cancelled = false;
    setPreview(null);
    setPreviewError(null);

    previewPackage({
      offeringId: offering.id,
      teacherProfileId: teacher.profileId,
      firstSessionDate: slot.date,
      startMinute: parseTimeToMinutes(slot.startTime),
    })
      .then((result) => !cancelled && setPreview(result))
      .catch((caught: unknown) => !cancelled && setPreviewError(errorMessage(caught)));

    return () => {
      cancelled = true;
    };
  }, [sessionType, offering.id, teacher.profileId, slot.date, slot.startTime]);

  const price =
    sessionType === "TRIAL"
      ? "رایگان"
      : sessionType === "SINGLE"
        ? `${formatToman(offering.price)} تومان`
        : `${formatToman((BigInt(offering.price) * BigInt(BUSINESS_RULES.PACKAGE_SESSION_COUNT)).toString())} تومان`;

  const packageBlocked = sessionType === "PACKAGE" && preview !== null && !preview.ok;

  return (
    <section className="card mt-10">
      <h2 className="text-lg font-bold">تأیید رزرو</h2>

      <dl className="mt-4 space-y-2 text-sm">
        <Row label="استاد" value={teacher.fullName} />
        <Row label="ساز" value={offering.instrumentName} />
        <Row
          label={sessionType === "PACKAGE" ? "جلسه‌ی اول" : "زمان"}
          value={`${formatJalaliDayMonth(slot.date)} ساعت ${faDigits(slot.startTime)}`}
        />
        <Row label="مبلغ" value={price} />
      </dl>

      {sessionType === "PACKAGE" ? (
        <PackageSessions preview={preview} error={previewError} />
      ) : null}

      {/*
        اعتبار روی جلسه‌ی معارفه نمی‌آید: رایگان است و مرحله‌ی پرداختی
        ندارد، پس تیکی که هیچ اثری ندارد فقط گمراه می‌کند.
      */}
      {sessionType !== "TRIAL" && credit !== null ? (
        <label className="mt-4 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={useCredit}
            onChange={(event) => onUseCreditChange(event.target.checked)}
          />
          <span>
            استفاده از اعتبار ({formatToman(credit.toString())} تومان موجودی)
          </span>
        </label>
      ) : null}

      {sessionType !== "TRIAL" ? (
        <p className="alert-info mt-4">
          بعد از تأیید، {faNumber(BUSINESS_RULES.PAYMENT_HOLD_MINUTES)} دقیقه مهلت
          پرداخت دارید. تا آن موقع این ساعت برای شما نگه داشته می‌شود.
        </p>
      ) : null}

      {error ? <p className="alert-error mt-4">{error}</p> : null}

      <button
        type="button"
        className="btn-primary mt-6"
        disabled={pending || packageBlocked || (sessionType === "PACKAGE" && !preview)}
        onClick={onConfirm}
      >
        {pending
          ? "کمی صبر کنید…"
          : sessionType === "TRIAL"
            ? "رزرو جلسه‌ی رایگان"
            : "تأیید و پرداخت"}
      </button>
    </section>
  );
}

function PackageSessions({
  preview,
  error,
}: {
  preview: PackagePreview | null;
  error: string | null;
}) {
  if (error) return <p className="alert-error mt-4">{error}</p>;
  if (!preview) return <p className="mt-4 text-sm text-ink-muted">در حال بررسی هفته‌ها…</p>;

  if (!preview.ok) {
    return (
      <div className="alert-error mt-4">
        <p>این ساعت در همه‌ی هفته‌ها آزاد نیست:</p>
        <ul className="mt-2 list-inside list-disc">
          {preview.conflicts.map((conflict) => (
            <li key={conflict.date}>
              جلسه‌ی {faNumber(conflict.sessionIndex)} — {formatJalaliDayMonth(conflict.date)}
            </li>
          ))}
        </ul>
        <p className="mt-2">ساعت یا روز دیگری انتخاب کنید.</p>
      </div>
    );
  }

  return (
    <div className="mt-4">
      <p className="text-sm font-medium">جلسات این پکیج:</p>
      <ul className="mt-2 space-y-1 text-sm text-ink-muted">
        {preview.sessions.map((session) => (
          <li key={session.startAt}>
            {formatJalaliDayMonth(session.date)} ساعت {faDigits(session.startTime)}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-ink-muted">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
