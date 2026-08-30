"use client";

import Link from "next/link";
import type { Route } from "next";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import {
  BUSINESS_RULES,
  addDaysToDateKey,
  parseTimeToMinutes,
  splitPayment,
  tehranDateKey,
  weekdayNameFa,
  weekdayOfDateKey,
} from "@music/shared";

import { Avatar } from "@/components/avatar";
import {
  Button,
  InlineNotice,
  Mark,
  SectionMark,
  Skeleton,
  SkeletonRow,
  Stepper,
} from "@/components/ui";
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
  canReviewSelection,
  readSessionType,
  resolveDeeplinkStep,
  type BookingStep,
  type SessionType,
} from "@/lib/booking-wizard";
import {
  faDigits,
  faNumber,
  formatDuration,
  formatJalaliDayMonth,
  formatJalaliShort,
  formatToman,
} from "@/lib/format";
import { useSession } from "@/lib/session";
import { paymentResultHref } from "@/lib/payment-result";

const STEPS = ["ساز", "استاد", "نوع کلاس", "روز و ساعت", "مرور و تأیید"] as const;
const WINDOW_DAYS = 14;
const MAX_WINDOW_OFFSET = 42;

export default function BookPage() {
  return (
    <Suspense fallback={<BookingSkeleton />}>
      <BookingFlow />
    </Suspense>
  );
}

function BookingSkeleton() {
  return (
    <div className="mx-auto max-w-[1040px] px-4.5 py-8 md:px-6 md:py-12">
      <Skeleton className="h-10 w-44" />
      <Skeleton className="mt-3 h-5 w-64" delay={1} />
      <Skeleton className="mt-10 h-16 w-full" delay={2} />
      <Skeleton className="mt-10 h-56 w-full" />
    </div>
  );
}

function BookingFlow() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, status } = useSession();

  const requestedInstrument = searchParams.get("instrument");
  const requestedTeacher = searchParams.get("teacher");
  const requestedType = readSessionType(searchParams.get("type"));

  const [step, setStep] = useState<BookingStep>(1);
  const [instruments, setInstruments] = useState<Instrument[] | null>(null);
  const [teachers, setTeachers] = useState<Teacher[] | null>(null);
  const [instrument, setInstrument] = useState<Instrument | null>(null);
  const [teacher, setTeacher] = useState<Teacher | null>(null);
  const [sessionType, setSessionType] = useState<SessionType | null>(null);
  const [slot, setSlot] = useState<Slot | null>(null);
  const [packagePreview, setPackagePreview] = useState<PackagePreview | null>(null);
  const [packagePreviewError, setPackagePreviewError] = useState<string | null>(null);
  const [credit, setCredit] = useState<bigint | null>(null);
  const [useCredit, setUseCredit] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const instrumentDeeplinkApplied = useRef(false);
  const teacherDeeplinkApplied = useRef(false);
  const typeDeeplinkApplied = useRef(false);
  const teacherCameFromDeeplink = useRef(false);

  const offering = findOffering(teacher, instrument);
  const trialEligible = status !== "loading" && user?.trialUsed === false;
  const hasCredit = credit !== null && credit > 0n;

  useEffect(() => {
    getCredit()
      .then((result) => setCredit(BigInt(result.balance)))
      .catch(() => setCredit(null));
  }, []);

  useEffect(() => {
    let cancelled = false;

    getInstruments()
      .then((result) => {
        if (cancelled) return;
        setInstruments(result);
        if (instrumentDeeplinkApplied.current) return;
        instrumentDeeplinkApplied.current = true;

        const match = result.find((item) => item.slug === requestedInstrument) ?? null;
        if (!match) {
          teacherDeeplinkApplied.current = true;
          typeDeeplinkApplied.current = true;
          setStep(1);
          return;
        }

        setInstrument(match);
        setStep(2);
      })
      .catch(() => !cancelled && setInstruments([]));

    return () => {
      cancelled = true;
    };
  }, [requestedInstrument]);

  useEffect(() => {
    if (!instrument) {
      setTeachers(null);
      return;
    }

    let cancelled = false;
    setTeachers(null);
    getTeachers(instrument.slug)
      .then((result) => {
        if (cancelled) return;
        setTeachers(result);
        if (teacherDeeplinkApplied.current) return;
        teacherDeeplinkApplied.current = true;

        const match = result.find((item) => item.slug === requestedTeacher) ?? null;
        if (!match) {
          if (requestedTeacher !== null) typeDeeplinkApplied.current = true;
          setStep(2);
          return;
        }

        teacherCameFromDeeplink.current = true;
        setTeacher(match);
      })
      .catch(() => !cancelled && setTeachers([]));

    return () => {
      cancelled = true;
    };
  }, [instrument, requestedTeacher]);

  useEffect(() => {
    if (
      !teacherCameFromDeeplink.current ||
      typeDeeplinkApplied.current ||
      !teacher ||
      !offering
    ) {
      return;
    }
    if (requestedType === "TRIAL" && status === "loading") return;

    typeDeeplinkApplied.current = true;
    const nextStep = resolveDeeplinkStep({
      instrumentValid: true,
      teacherValid: true,
      requestedType,
      trialEligible,
    });

    if (nextStep === 4 && requestedType) setSessionType(requestedType);
    setStep(nextStep);
  }, [offering, requestedType, status, teacher, trialEligible]);

  useEffect(() => {
    if (sessionType !== "PACKAGE" || !slot || !teacher || !offering) {
      setPackagePreview(null);
      setPackagePreviewError(null);
      return;
    }

    let cancelled = false;
    setPackagePreview(null);
    setPackagePreviewError(null);
    previewPackage({
      offeringId: offering.id,
      teacherProfileId: teacher.profileId,
      firstSessionDate: slot.date,
      startMinute: parseTimeToMinutes(slot.startTime),
    })
      .then((result) => !cancelled && setPackagePreview(result))
      .catch(
        (caught: unknown) =>
          !cancelled && setPackagePreviewError(errorMessage(caught)),
      );

    return () => {
      cancelled = true;
    };
  }, [offering, sessionType, slot, teacher]);

  function replaceContext(input: {
    instrument?: Instrument | null;
    teacher?: Teacher | null;
    type?: SessionType | null;
  }) {
    const params = new URLSearchParams();
    if (input.instrument) params.set("instrument", input.instrument.slug);
    if (input.teacher) params.set("teacher", input.teacher.slug);
    if (input.type) params.set("type", input.type.toLowerCase());
    const query = params.toString();
    const href = `/dashboard/book${query ? `?${query}` : ""}` as Route;
    router.replace(href, { scroll: false });
  }

  function chooseInstrument(next: Instrument) {
    const changed = instrument?.id !== next.id;
    setInstrument(next);
    if (changed) {
      setTeacher(null);
      setSessionType(null);
      setSlot(null);
      setPackagePreview(null);
      typeDeeplinkApplied.current = true;
      replaceContext({ instrument: next });
    }
    setError(null);
  }

  function chooseTeacher(next: Teacher) {
    const changed = teacher?.profileId !== next.profileId;
    setTeacher(next);
    if (changed) {
      setSessionType(null);
      setSlot(null);
      setPackagePreview(null);
      const deferredType = !typeDeeplinkApplied.current ? requestedType : null;
      replaceContext({ instrument, teacher: next, type: deferredType });
    }
    setError(null);
  }

  function chooseSessionType(next: SessionType) {
    const changed = sessionType !== next;
    setSessionType(next);
    typeDeeplinkApplied.current = true;
    if (changed) {
      setSlot(null);
      setPackagePreview(null);
      replaceContext({ instrument, teacher, type: next });
    }
    setError(null);
  }

  function continueWizard() {
    if (step === 1 && instrument) {
      setStep(2);
      return;
    }

    if (step === 2 && teacher) {
      if (!typeDeeplinkApplied.current && requestedType) {
        typeDeeplinkApplied.current = true;
        if (requestedType !== "TRIAL" || trialEligible) {
          setSessionType(requestedType);
          replaceContext({ instrument, teacher, type: requestedType });
          setStep(4);
          return;
        }
      }
      setStep(3);
      return;
    }

    if (step === 3 && sessionType) {
      setStep(4);
      return;
    }

    if (
      step === 4 &&
      canReviewSelection({
        sessionType,
        hasSlot: slot !== null,
        packagePreview,
        packagePreviewError,
      })
    ) {
      setStep(5);
    }
  }

  async function confirm() {
    if (!teacher || !offering || !slot || !sessionType) return;
    if (
      !canReviewSelection({
        sessionType,
        hasSlot: true,
        packagePreview,
        packagePreviewError,
      })
    ) {
      return;
    }

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

      if (order.settled) {
        router.push(paymentResultHref(order.orderId));
        return;
      }

      if (!order.redirectUrl) throw new Error("درگاه پرداخت آدرسی برنگرداند.");
      window.location.href = order.redirectUrl;
    } catch (caught) {
      setError(errorMessage(caught));
      setPending(false);
    }
  }

  const canContinue =
    (step === 1 && instrument !== null) ||
    (step === 2 && teacher !== null) ||
    (step === 3 && sessionType !== null) ||
    (step === 4 &&
      canReviewSelection({
        sessionType,
        hasSlot: slot !== null,
        packagePreview,
        packagePreviewError,
      }));

  return (
    <div className="mx-auto max-w-[1040px] px-4.5 pt-7 pb-18 md:px-6 md:pt-10 lg:pt-12">
      <header className="mb-7 md:mb-9">
        <h1 className="text-[clamp(26px,3vw,34px)] font-semibold tracking-[-0.02em] text-ink">
          رزرو کلاس
        </h1>
        <p className="mt-2 text-[15px] text-ink-2">
          ساز، استاد و زمان مناسب را انتخاب کن.
        </p>
      </header>

      <Stepper steps={STEPS} current={step} className="mb-7 md:mb-9" />

      <div className="flex flex-wrap items-start gap-5 md:gap-7 max-[900px]:flex-col">
        <main className="min-w-0 flex-[3_1_400px] max-[900px]:w-full max-[900px]:flex-none">
          {step === 1 ? (
            <InstrumentStep
              instruments={instruments}
              selected={instrument}
              onSelect={chooseInstrument}
            />
          ) : null}

          {step === 2 && instrument ? (
            <TeacherStep
              instrument={instrument}
              teachers={teachers}
              selected={teacher}
              onSelect={chooseTeacher}
            />
          ) : null}

          {step === 3 && offering ? (
            <SessionTypeStep
              offering={offering}
              trialUsed={!trialEligible}
              selected={sessionType}
              onSelect={chooseSessionType}
            />
          ) : null}

          {step === 4 && offering && teacher && sessionType ? (
            <DateTimeStep
              offering={offering}
              teacher={teacher}
              sessionType={sessionType}
              selected={slot}
              onSelect={(next) => {
                setSlot(next);
                setError(null);
              }}
              packagePreview={packagePreview}
              packagePreviewError={packagePreviewError}
            />
          ) : null}

          {step === 5 && instrument && teacher && offering && sessionType && slot ? (
            <ReviewStep
              instrument={instrument}
              teacher={teacher}
              offering={offering}
              sessionType={sessionType}
              slot={slot}
              packagePreview={packagePreview}
              credit={credit}
              useCredit={useCredit}
              onUseCreditChange={setUseCredit}
              onEdit={setStep}
            />
          ) : null}

          {error ? (
            <InlineNotice tone="error" className="mt-5">
              {error}
            </InlineNotice>
          ) : null}

          <div className="mt-7 flex flex-wrap items-center gap-3 max-md:flex-col max-md:items-stretch md:mt-9">
            {step < 5 ? (
              <Button
                disabled={!canContinue || (step === 2 && status === "loading")}
                onClick={continueWizard}
                className="max-md:w-full"
              >
                ادامه
              </Button>
            ) : (
              <Button
                busy={pending}
                onClick={() => void confirm()}
                className="max-md:w-full"
              >
                {sessionType === "TRIAL" ? "رزرو جلسه" : "تأیید و ادامه"}
              </Button>
            )}

            {step > 1 ? (
              <Button
                variant="quiet"
                onClick={() => setStep((step - 1) as BookingStep)}
                className="max-md:w-full"
              >
                بازگشت
              </Button>
            ) : null}
          </div>
        </main>

        {instrument ? (
          <BookingSummary
            instrument={instrument}
            teacher={teacher}
            offering={offering}
            sessionType={sessionType}
            slot={slot}
          />
        ) : null}
      </div>
    </div>
  );
}

function InstrumentStep({
  instruments,
  selected,
  onSelect,
}: {
  instruments: Instrument[] | null;
  selected: Instrument | null;
  onSelect: (instrument: Instrument) => void;
}) {
  return (
    <DecisionSection title="می‌خواهی چه سازی یاد بگیری؟">
      {instruments === null ? (
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-16 w-full" delay={(index % 3) as 0 | 1 | 2} />
          ))}
        </div>
      ) : instruments.length === 0 ? (
        <InlineNotice tone="quiet">فهرست سازها الان در دسترس نیست.</InlineNotice>
      ) : (
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          {instruments.map((item) => {
            const active = selected?.id === item.id;
            return (
              <button
                key={item.id}
                type="button"
                aria-pressed={active}
                onClick={() => onSelect(item)}
                className={`min-h-16 rounded-panel px-4.5 py-4 text-start transition-colors ${
                  active
                    ? "bg-violet-surface shadow-[inset_0_0_0_1px_var(--color-violet-border)]"
                    : "bg-surface shadow-[inset_0_0_0_1px_var(--color-divider)] hover:bg-surface-2"
                }`}
              >
                <span className="text-base text-ink">{item.nameFa}</span>
                {active ? <Mark tone="violet" width="sm" className="mt-3 w-6.5" /> : null}
              </button>
            );
          })}
        </div>
      )}
    </DecisionSection>
  );
}

function TeacherStep({
  instrument,
  teachers,
  selected,
  onSelect,
}: {
  instrument: Instrument;
  teachers: Teacher[] | null;
  selected: Teacher | null;
  onSelect: (teacher: Teacher) => void;
}) {
  return (
    <DecisionSection title="استادت را انتخاب کن">
      {teachers === null ? (
        <div className="space-y-2.5">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" delay={1} />
        </div>
      ) : teachers.length === 0 ? (
        <div className="py-4">
          <Mark className="mb-4 w-9" />
          <p className="text-[16.5px] text-ink">
            فعلاً استادی برای {instrument.nameFa} در دسترس نیست.
          </p>
          <p className="mt-2 text-sm text-ink-2">ساز دیگری را انتخاب کن یا بعداً سر بزن.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {teachers.map((item) => (
            <TeacherOption
              key={item.profileId}
              teacher={item}
              instrument={instrument}
              selected={selected?.profileId === item.profileId}
              onSelect={() => onSelect(item)}
            />
          ))}
        </div>
      )}
    </DecisionSection>
  );
}

function TeacherOption({
  teacher,
  instrument,
  selected,
  onSelect,
}: {
  teacher: Teacher;
  instrument: Instrument;
  selected: boolean;
  onSelect: () => void;
}) {
  const offering = findOffering(teacher, instrument);
  if (!offering) return null;

  return (
    <div
      className={`rounded-panel p-4 transition-colors md:p-4.5 ${
        selected
          ? "bg-violet-surface shadow-[inset_0_0_0_1px_var(--color-violet-border)]"
          : "bg-surface shadow-[inset_0_0_0_1px_var(--color-divider)]"
      }`}
    >
      <button type="button" aria-pressed={selected} onClick={onSelect} className="w-full text-start">
        <span className="flex items-start gap-4">
          <Avatar
            name={teacher.fullName}
            url={teacher.avatarUrl}
            className="size-16 shrink-0 rounded-control"
          />
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <span className="text-[16.5px] font-semibold text-ink">{teacher.fullName}</span>
              <span className="text-sm text-ink-2">
                {formatToman(offering.price)} تومان
              </span>
            </span>
            <span className="mt-1.5 block text-sm leading-[1.8] text-ink-2">
              {teacher.headline}
            </span>
            <span className="mt-2.5 flex flex-wrap gap-x-3 gap-y-1 text-[13.5px] text-meta">
              <span>{offering.instrumentName}</span>
              <span aria-hidden="true">·</span>
              <span>{formatDuration(offering.durationMinutes)}</span>
            </span>
          </span>
        </span>
      </button>
      <div className="mt-3 border-t border-divider pt-3">
        <Link href={`/teachers/${teacher.slug}`} className="text-[13.5px]">
          دیدن پروفایل ←
        </Link>
      </div>
    </div>
  );
}

function SessionTypeStep({
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
  const packageTotal = packagePrice(offering);
  const types: Array<{
    type: SessionType;
    title: string;
    price: string;
    note: string;
    disabled?: boolean;
  }> = [
    {
      type: "TRIAL",
      title: "جلسه معارفه رایگان",
      price: "رایگان",
      note: trialUsed
        ? "این فرصت یک‌بار برای هر هنرجوست و قبلاً استفاده شده است."
        : `${faNumber(BUSINESS_RULES.TRIAL_DURATION_MINUTES)} دقیقه برای آشنایی با استاد و مشخص کردن مسیر یادگیری`,
      disabled: trialUsed,
    },
    {
      type: "SINGLE",
      title: "تک جلسه",
      price: `${formatToman(offering.price)} تومان`,
      note: `یک جلسه خصوصی · ${formatDuration(offering.durationMinutes)}`,
    },
    {
      type: "PACKAGE",
      title: "بسته ماهانه",
      price: `${formatToman(packageTotal)} تومان`,
      note: `${faNumber(BUSINESS_RULES.PACKAGE_SESSION_COUNT)} جلسه با روز و ساعت ثابت هفتگی`,
    },
  ];

  return (
    <DecisionSection title="چه نوع کلاسی می‌خواهی؟">
      <div className="flex flex-col gap-2.5">
        {types.map((item) => {
          const active = selected === item.type;
          return (
            <button
              key={item.type}
              type="button"
              disabled={item.disabled}
              aria-pressed={active}
              onClick={() => onSelect(item.type)}
              className={`rounded-panel px-5 py-4.5 text-start transition-colors ${
                active
                  ? "bg-violet-surface shadow-[inset_0_0_0_1px_var(--color-violet-border)]"
                  : "bg-surface shadow-[inset_0_0_0_1px_var(--color-divider)] hover:bg-surface-2"
              } disabled:cursor-not-allowed disabled:opacity-55`}
            >
              <span className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <span className="text-[16.5px] font-semibold text-ink">{item.title}</span>
                <span className={item.type === "TRIAL" ? "text-violet-strong" : "text-ink-2"}>
                  {item.price}
                </span>
              </span>
              <span className="mt-2 block text-sm leading-[1.85] text-ink-2">{item.note}</span>
            </button>
          );
        })}
      </div>
    </DecisionSection>
  );
}

function DateTimeStep({
  offering,
  teacher,
  sessionType,
  selected,
  onSelect,
  packagePreview,
  packagePreviewError,
}: {
  offering: Offering;
  teacher: Teacher;
  sessionType: SessionType;
  selected: Slot | null;
  onSelect: (slot: Slot | null) => void;
  packagePreview: PackagePreview | null;
  packagePreviewError: string | null;
}) {
  return (
    <DecisionSection title="چه روز و ساعتی برایت مناسب است؟">
      <SlotPicker
        offeringId={offering.id}
        teacherProfileId={teacher.profileId}
        trial={sessionType === "TRIAL"}
        selected={selected}
        onSelect={onSelect}
      />

      {sessionType === "TRIAL" ? (
        <InlineNotice className="mt-5">
          جلسه معارفه رایگان · {faNumber(BUSINESS_RULES.TRIAL_DURATION_MINUTES)} دقیقه
        </InlineNotice>
      ) : null}

      {sessionType === "PACKAGE" && selected ? (
        <PackagePreviewBlock preview={packagePreview} error={packagePreviewError} />
      ) : null}
    </DecisionSection>
  );
}

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
  onSelect: (slot: Slot | null) => void;
}) {
  const [offset, setOffset] = useState(0);
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(selected?.date ?? null);
  const [error, setError] = useState<string | null>(null);

  const from = addDaysToDateKey(tehranDateKey(new Date()), offset);
  const to = addDaysToDateKey(from, WINDOW_DAYS - 1);

  const load = useCallback(async () => {
    setSlots(null);
    try {
      const result = await getSlots({ offeringId, teacherProfileId, from, to, trial });
      setSlots(result);
      setError(null);
      setSelectedDate((current) => {
        if (current && result.some((item) => item.date === current)) return current;
        return result[0]?.date ?? null;
      });
    } catch (caught) {
      setSlots([]);
      setError(errorMessage(caught));
    }
  }, [offeringId, teacherProfileId, from, to, trial]);

  useEffect(() => {
    void load();
  }, [load]);

  const slotsByDate = new Map<string, Slot[]>();
  for (const item of slots ?? []) {
    const day = slotsByDate.get(item.date);
    if (day) day.push(item);
    else slotsByDate.set(item.date, [item]);
  }
  const dates = Array.from({ length: WINDOW_DAYS }, (_, index) => addDaysToDateKey(from, index));
  const visibleTimes = selectedDate ? (slotsByDate.get(selectedDate) ?? []) : [];

  return (
    <div className="min-w-0">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 text-[13.5px]">
        <span className="text-meta">
          {formatJalaliShort(from)} تا {formatJalaliShort(to)}
        </span>
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          <button
            type="button"
            disabled={offset === 0}
            onClick={() => {
              onSelect(null);
              setOffset((value) => Math.max(0, value - WINDOW_DAYS));
            }}
            className="min-h-11 text-violet-strong disabled:text-meta"
          >
            بازه قبل
          </button>
          <button
            type="button"
            disabled={offset >= MAX_WINDOW_OFFSET}
            onClick={() => {
              onSelect(null);
              setOffset((value) => Math.min(MAX_WINDOW_OFFSET, value + WINDOW_DAYS));
            }}
            className="min-h-11 text-violet-strong disabled:text-meta"
          >
            بازه بعد
          </button>
        </div>
      </div>

      {error ? <InlineNotice tone="error">{error}</InlineNotice> : null}

      {slots === null ? (
        <>
          <div className="flex gap-2.5 overflow-hidden">
            {Array.from({ length: 5 }, (_, index) => (
              <Skeleton key={index} className="h-[76px] min-w-25" delay={(index % 3) as 0 | 1 | 2} />
            ))}
          </div>
          <div className="mt-6 border-t border-divider pt-5">
            <SkeletonRow />
          </div>
        </>
      ) : slots.length === 0 ? (
        <InlineNotice tone="quiet">
          در این بازه زمان آزادی نیست. بازه‌ی بعدی یا استاد دیگری را ببین.
        </InlineNotice>
      ) : (
        <>
          <div className="-mx-4.5 flex max-w-[calc(100%+2.25rem)] gap-2.5 overflow-x-auto px-4.5 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:mx-0 md:max-w-full md:px-0">
            {dates.map((date) => {
              const enabled = slotsByDate.has(date);
              const active = selectedDate === date;
              return (
                <button
                  key={date}
                  type="button"
                  disabled={!enabled}
                  aria-pressed={active}
                  onClick={() => {
                    if (selected?.date !== date) onSelect(null);
                    setSelectedDate(date);
                  }}
                  className={`min-h-[76px] min-w-25 shrink-0 rounded-control px-3 py-2.5 text-center transition-colors ${
                    active
                      ? "bg-violet-surface text-ink shadow-[inset_0_0_0_1px_var(--color-violet-border)]"
                      : enabled
                        ? "bg-surface text-ink-2 shadow-[inset_0_0_0_1px_var(--color-divider)]"
                        : "text-meta shadow-[inset_0_0_0_1px_var(--color-divider-soft)] opacity-55"
                  }`}
                >
                  <span className="block text-sm">{weekdayNameFa(weekdayOfDateKey(date))}</span>
                  <span className="mt-1 block text-[13.5px] text-meta">
                    {formatJalaliShort(date)}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="mt-6 border-t border-divider pt-5">
            <p className="mb-3 text-[15px] text-ink">زمان‌های آزاد</p>
            {visibleTimes.length === 0 ? (
              <p className="text-sm text-ink-2">برای این روز زمان آزادی وجود ندارد.</p>
            ) : (
              <div className="flex flex-wrap gap-2.5">
                {visibleTimes.map((item) => {
                  const active = selected?.startAt === item.startAt;
                  return (
                    <button
                      key={item.startAt}
                      type="button"
                      aria-pressed={active}
                      onClick={() => onSelect(item)}
                      className={`min-h-11 min-w-23 rounded-control px-4 py-2.5 text-[15px] transition-colors ${
                        active
                          ? "bg-violet-surface text-ink shadow-[inset_0_0_0_1px_var(--color-violet-border)]"
                          : "bg-surface text-ink-2 shadow-[inset_0_0_0_1px_var(--color-divider)] hover:text-ink"
                      }`}
                    >
                      <span dir="ltr">{faDigits(item.startTime)}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function PackagePreviewBlock({
  preview,
  error,
}: {
  preview: PackagePreview | null;
  error: string | null;
}) {
  if (error) {
    return (
      <InlineNotice tone="error" className="mt-5">
        {error}
      </InlineNotice>
    );
  }

  if (!preview) {
    return (
      <div className="mt-5 rounded-panel bg-surface-2 p-4.5">
        <p className="text-sm text-ink-2">در حال بررسی چهار هفته…</p>
        <Skeleton className="mt-3 h-5 w-4/5" />
        <Skeleton className="mt-2 h-5 w-3/5" delay={1} />
      </div>
    );
  }

  if (!preview.ok) {
    return (
      <div className="mt-5 rounded-panel bg-wood-surface p-4.5 shadow-[inset_0_0_0_1px_var(--color-divider)]">
        <p className="text-sm text-ink">
          این زمان در همه‌ی چهار هفته قابل رزرو نیست.
        </p>
        <ul className="mt-2.5 space-y-1 text-sm text-ink-2">
          {preview.conflicts.map((conflict) => (
            <li key={`${conflict.sessionIndex}-${conflict.date}`}>
              جلسه {faNumber(conflict.sessionIndex)} · {formatJalaliDayMonth(conflict.date)}
            </li>
          ))}
        </ul>
        <p className="mt-2.5 text-sm text-ink-2">روز یا ساعت دیگری را انتخاب کن.</p>
      </div>
    );
  }

  return (
    <div className="mt-5 rounded-panel bg-surface-2 p-4.5">
      <p className="text-sm text-ink-2">
        این روز و ساعت به‌صورت هفتگی برای چهار جلسه تکرار می‌شود.
      </p>
      <ul className="mt-3 space-y-2">
        {preview.sessions.map((session) => (
          <li key={session.startAt} className="flex items-center gap-2.5 text-sm text-ink">
            <Mark tone="violet" width="sm" className="w-3" />
            <span>{formatJalaliDayMonth(session.date)}</span>
            <span dir="ltr" className="text-ink-2">
              {faDigits(session.startTime)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ReviewStep({
  instrument,
  teacher,
  offering,
  sessionType,
  slot,
  packagePreview,
  credit,
  useCredit,
  onUseCreditChange,
  onEdit,
}: {
  instrument: Instrument;
  teacher: Teacher;
  offering: Offering;
  sessionType: SessionType;
  slot: Slot;
  packagePreview: PackagePreview | null;
  credit: bigint | null;
  useCredit: boolean;
  onUseCreditChange: (value: boolean) => void;
  onEdit: (step: BookingStep) => void;
}) {
  const total = totalPrice(offering, sessionType);
  const split = splitPayment({
    total,
    balance: credit ?? 0n,
    useCredit: sessionType !== "TRIAL" && useCredit,
  });

  return (
    <DecisionSection title="همه‌چیز درست است؟">
      <div className="rounded-panel bg-surface px-4 shadow-[inset_0_0_0_1px_var(--color-divider)] md:px-5">
        <ReviewRow label="ساز" value={instrument.nameFa} onEdit={() => onEdit(1)} first />
        <ReviewRow
          label="استاد"
          value={teacher.fullName}
          extra={`${offering.instrumentName} · ${formatDuration(offering.durationMinutes)}`}
          onEdit={() => onEdit(2)}
        />
        <ReviewRow
          label="نوع کلاس"
          value={sessionTypeLabel(sessionType)}
          extra={
            sessionType === "PACKAGE"
              ? `${faNumber(BUSINESS_RULES.PACKAGE_SESSION_COUNT)} جلسه`
              : sessionType === "TRIAL"
                ? formatDuration(BUSINESS_RULES.TRIAL_DURATION_MINUTES)
                : formatDuration(offering.durationMinutes)
          }
          onEdit={() => onEdit(3)}
        />
        <ReviewRow
          label="روز و ساعت"
          value={formatJalaliDayMonth(slot.date)}
          extra={`${faDigits(slot.startTime)} تا ${faDigits(slot.endTime)}${
            sessionType === "PACKAGE" ? " · هفتگی، چهار جلسه" : ""
          }`}
          onEdit={() => onEdit(4)}
        />
        {sessionType === "PACKAGE" && packagePreview?.ok ? (
          <div className="border-t border-divider py-4">
            <p className="text-[13px] text-meta">جلسه‌های برنامه‌ریزی‌شده</p>
            <ul className="mt-2 space-y-1.5 text-sm text-ink-2">
              {packagePreview.sessions.map((session) => (
                <li key={session.startAt} className="flex flex-wrap justify-between gap-2">
                  <span>{formatJalaliDayMonth(session.date)}</span>
                  <span dir="ltr">{faDigits(session.startTime)}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <ReviewRow
          label="مبلغ"
          value={sessionType === "TRIAL" ? "رایگان" : `${formatToman(total)} تومان`}
        />
      </div>

      {sessionType !== "TRIAL" && credit !== null && credit > 0n ? (
        <div className="mt-3.5 rounded-panel p-4.5 shadow-[inset_0_0_0_1px_var(--color-divider)]">
          <label className="flex cursor-pointer items-start gap-2.5 text-[14.5px] text-ink">
            <input
              type="checkbox"
              checked={useCredit}
              onChange={(event) => onUseCreditChange(event.target.checked)}
              className="mt-1 accent-violet"
            />
            <span>استفاده از اعتبار هوگه</span>
          </label>
          <dl className="mt-3 space-y-2 border-t border-divider pt-3 text-sm">
            <MoneyRow label="اعتبار موجود" value={credit} />
            <MoneyRow label="استفاده از اعتبار" value={split.fromCredit} />
            <MoneyRow label="مبلغ قابل پرداخت" value={split.fromGateway} strong />
          </dl>
        </div>
      ) : null}

      {sessionType !== "TRIAL" ? (
        <InlineNotice className="mt-4">
          پس از تأیید، {faNumber(BUSINESS_RULES.PAYMENT_HOLD_MINUTES)} دقیقه برای
          تکمیل پرداخت فرصت داری و این زمان تا آن موقع برای تو نگه داشته می‌شود.
        </InlineNotice>
      ) : null}
    </DecisionSection>
  );
}

function ReviewRow({
  label,
  value,
  extra,
  onEdit,
  first = false,
}: {
  label: string;
  value: string;
  extra?: string;
  onEdit?: () => void;
  first?: boolean;
}) {
  return (
    <div className={`flex items-start justify-between gap-4 py-4 ${first ? "" : "border-t border-divider"}`}>
      <div>
        <p className="text-[13px] text-meta">{label}</p>
        <p className="mt-1 text-[15.5px] text-ink">{value}</p>
        {extra ? <p className="mt-1 text-sm text-ink-2">{extra}</p> : null}
      </div>
      {onEdit ? (
        <button type="button" onClick={onEdit} className="min-h-11 px-2 text-[13.5px] text-violet-strong">
          تغییر
        </button>
      ) : null}
    </div>
  );
}

function MoneyRow({ label, value, strong = false }: { label: string; value: bigint; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-ink-2">{label}</dt>
      <dd className={strong ? "font-semibold text-ink" : "text-ink-2"}>
        {formatToman(value)} تومان
      </dd>
    </div>
  );
}

function BookingSummary({
  instrument,
  teacher,
  offering,
  sessionType,
  slot,
}: {
  instrument: Instrument;
  teacher: Teacher | null;
  offering: Offering | null;
  sessionType: SessionType | null;
  slot: Slot | null;
}) {
  return (
    <aside className="order-last hidden w-full md:block max-[900px]:order-first min-[901px]:sticky min-[901px]:top-23 min-[901px]:w-[268px] min-[901px]:shrink-0">
      <div className="rounded-panel bg-surface p-5 shadow-[inset_0_0_0_1px_var(--color-divider)]">
        <SectionMark width="sm" className="mb-4">
          رزرو شما
        </SectionMark>
        <dl className="space-y-3.5">
          <SummaryRow label="ساز" value={instrument.nameFa} />
          {teacher ? <SummaryRow label="استاد" value={teacher.fullName} /> : null}
          {sessionType ? (
            <SummaryRow
              label="نوع کلاس"
              value={sessionTypeLabel(sessionType)}
              extra={
                sessionType === "PACKAGE"
                  ? `${faNumber(BUSINESS_RULES.PACKAGE_SESSION_COUNT)} جلسه`
                  : undefined
              }
            />
          ) : null}
          {slot ? (
            <SummaryRow
              label="زمان"
              value={formatJalaliDayMonth(slot.date)}
              extra={faDigits(slot.startTime)}
            />
          ) : null}
        </dl>
        {offering && sessionType ? (
          <div className="mt-4.5 border-t border-divider pt-4">
            <p className="text-[12.5px] text-meta">هزینه کل</p>
            <p className="mt-1 text-lg font-semibold text-ink">
              {sessionType === "TRIAL"
                ? "رایگان"
                : `${formatToman(totalPrice(offering, sessionType))} تومان`}
            </p>
          </div>
        ) : null}
      </div>
    </aside>
  );
}

function SummaryRow({ label, value, extra }: { label: string; value: string; extra?: string }) {
  return (
    <div>
      <dt className="text-[12.5px] text-meta">{label}</dt>
      <dd className="mt-0.5 text-[15px] text-ink">{value}</dd>
      {extra ? <dd className="mt-0.5 text-[13.5px] text-ink-2">{extra}</dd> : null}
    </div>
  );
}

function DecisionSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-5 text-[clamp(19px,2.2vw,23px)] font-semibold tracking-[-0.015em] text-ink">
        {title}
      </h2>
      {children}
    </section>
  );
}

function findOffering(teacher: Teacher | null, instrument: Instrument | null): Offering | null {
  if (!teacher || !instrument) return null;
  return teacher.offerings.find((item) => item.instrumentSlug === instrument.slug) ?? null;
}

function packagePrice(offering: Offering): bigint {
  return BigInt(offering.price) * BigInt(BUSINESS_RULES.PACKAGE_SESSION_COUNT);
}

function totalPrice(offering: Offering, type: SessionType): bigint {
  if (type === "TRIAL") return 0n;
  if (type === "PACKAGE") return packagePrice(offering);
  return BigInt(offering.price);
}

function sessionTypeLabel(type: SessionType): string {
  switch (type) {
    case "TRIAL":
      return "جلسه معارفه رایگان";
    case "SINGLE":
      return "تک جلسه";
    case "PACKAGE":
      return "بسته ماهانه · ۴ جلسه";
  }
}
