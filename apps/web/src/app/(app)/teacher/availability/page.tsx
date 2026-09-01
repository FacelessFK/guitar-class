"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  WEEKDAY_NAMES_FA,
  addDaysToDateKey,
  formatMinutes,
  parseTimeToMinutes,
  tehranDateKey,
} from "@music/shared";

import {
  CheckIcon,
  EmptyState,
  InlineNotice,
  SectionMark,
  Skeleton,
  TrashIcon,
} from "@/components/ui";
import { errorMessage } from "@/lib/api-client";
import {
  addException,
  addRule,
  getSchedule,
  removeException,
  removeRule,
  type ScheduleException,
  type ScheduleRule,
} from "@/lib/app-api";
import { faDigits, faNumber, formatJalaliDayMonth } from "@/lib/format";

export default function AvailabilityPage() {
  const [rules, setRules] = useState<ScheduleRule[] | null>(null);
  const [exceptions, setExceptions] = useState<ScheduleException[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const schedule = await getSchedule();
      setRules(schedule.rules);
      setExceptions(schedule.exceptions);
      setError(null);
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="mx-auto max-w-[1000px] px-4.5 pt-6 pb-19 md:px-6 md:pt-9 md:pb-26">
      <div className="flex items-center gap-2 text-[13px] text-meta">
        <Link href="/teacher" className="text-meta hover:text-ink">
          پنل استاد
        </Link>
        <span>←</span>
        <span className="text-ink-2">زمان‌های تدریس</span>
      </div>

      <header className="mt-4.5">
        <h1 className="text-[clamp(25px,3vw,32px)] font-semibold tracking-[-0.02em] text-ink">
          زمان‌های تدریس
        </h1>
        <p className="mt-2.5 max-w-[58ch] text-[15px] leading-[1.9] text-ink-2 text-pretty">
          برنامه عادی هر هفته و تغییرهای یک‌روزه را جداگانه مدیریت کن. همه
          ساعت‌ها به وقت تهران است.
        </p>
      </header>

      <InlineNotice tone="wood" className="mt-5 max-w-[76ch]">
        کلاس‌های رزروشده با حذف یک زمان هفتگی از بین نمی‌روند و همچنان باید
        برگزار شوند.
      </InlineNotice>

      {error ? (
        <div className="mt-6 flex flex-wrap items-center gap-4">
          <p className="alert-error flex-1">{error}</p>
          {rules === null || exceptions === null ? (
            <button type="button" className="btn-quiet" onClick={() => void load()}>
              تلاش دوباره
            </button>
          ) : null}
        </div>
      ) : null}
      {notice ? (
        <p className="mt-6 flex items-start gap-2 text-[13.5px] leading-[1.9] text-ok">
          <CheckIcon className="mt-1 shrink-0" />
          <span>{notice}</span>
        </p>
      ) : null}

      <WeeklyRules
        rules={rules}
        onChanged={(message) => {
          setNotice(message ?? "برنامه هفتگی ذخیره شد.");
          void load();
        }}
        onError={setError}
      />

      <Exceptions
        exceptions={exceptions}
        onChanged={(message) => {
          setNotice(message);
          void load();
        }}
        onError={setError}
      />
    </div>
  );
}

function WeeklyRules({
  rules,
  onChanged,
  onError,
}: {
  rules: ScheduleRule[] | null;
  onChanged: (message: string | null) => void;
  onError: (message: string | null) => void;
}) {
  const [formOpen, setFormOpen] = useState(false);
  const [weekday, setWeekday] = useState(0);
  const [start, setStart] = useState("16:00");
  const [end, setEnd] = useState("20:00");
  const [pending, setPending] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  function openForDay(day: number) {
    setWeekday(day);
    setFormOpen(true);
    setPendingDelete(null);
  }

  async function submit() {
    setPending(true);
    onError(null);

    try {
      await addRule({
        weekday,
        startMinute: parseTimeToMinutes(start),
        endMinute: parseTimeToMinutes(end),
        validFrom: tehranDateKey(new Date()),
        validUntil: null,
      });
      setFormOpen(false);
      onChanged(null);
    } catch (caught) {
      onError(errorMessage(caught));
    } finally {
      setPending(false);
    }
  }

  async function remove(rule: ScheduleRule) {
    onError(null);

    try {
      const result = await removeRule(rule.id);
      setPendingDelete(null);
      onChanged(
        result.affectedBookings > 0
          ? `این زمان حذف شد؛ ${faNumber(result.affectedBookings)} کلاس از پیش رزروشده در همان بازه سر جایش می‌ماند و باید برگزار شود.`
          : "زمان هفتگی حذف شد.",
      );
    } catch (caught) {
      onError(errorMessage(caught));
    }
  }

  return (
    <section className="mt-10 md:mt-12">
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <SectionMark tone="wood">برنامه هفتگی</SectionMark>
          <h2 className="mt-2.5 text-xl font-semibold text-ink">برنامه عادی هر هفته</h2>
          <p className="mt-1.5 max-w-[58ch] text-[13.5px] leading-[1.9] text-meta">
            مثل «هر شنبه از ساعت ۱۶ تا ۲۰». این زمان‌ها هر هفته تکرار می‌شوند.
          </p>
        </div>
        <button
          type="button"
          className="btn-primary w-full sm:w-auto"
          onClick={() => setFormOpen((open) => !open)}
        >
          {formOpen ? "بستن فرم" : "افزودن زمان هفتگی"}
        </button>
      </div>

      {formOpen ? (
        <WeeklyRuleForm
          weekday={weekday}
          start={start}
          end={end}
          pending={pending}
          onWeekday={setWeekday}
          onStart={setStart}
          onEnd={setEnd}
          onCancel={() => setFormOpen(false)}
          onSubmit={submit}
        />
      ) : null}

      {rules === null ? (
        <WeeklyRulesSkeleton />
      ) : rules.length === 0 ? (
        <div className="card-hollow mt-7 px-5 py-9 text-center md:px-8 md:py-11">
          <EmptyState
            className="mx-auto text-start"
            title="هنوز زمانی برای تدریس مشخص نکرده‌ای."
            action={
              <button type="button" className="btn-outline" onClick={() => openForDay(0)}>
                افزودن اولین زمان
              </button>
            }
          >
            تا برنامه هفتگی نداشته باشی، هنرجوها هیچ ساعت آزادی برای رزرو
            نمی‌بینند.
          </EmptyState>
        </div>
      ) : (
        <div className="mt-7">
          {WEEKDAY_NAMES_FA.map((name, day) => {
            const dayRules = rules.filter((rule) => rule.weekday === day);
            return (
              <div key={name} className="border-b border-divider/70">
                <div className="flex flex-col items-stretch gap-3 px-1 py-4 md:flex-row md:items-start md:gap-5">
                  <div className="flex w-auto shrink-0 items-center gap-2.5 pt-1.5 md:w-24">
                    <span className={`size-1.5 rounded-full ${dayRules.length ? "bg-violet" : "bg-divider"}`} />
                    <span className={dayRules.length ? "text-[15px] text-ink" : "text-[15px] text-meta"}>
                      {name}
                    </span>
                  </div>
                  <div className="flex min-w-0 flex-1 flex-wrap gap-2">
                    {dayRules.length ? (
                      dayRules.map((rule) => (
                        <div key={rule.id} className="w-full md:w-auto">
                          <div className="flex min-h-12 w-full items-center gap-3 rounded-control bg-violet-surface px-3.5 shadow-[inset_0_0_0_1px_var(--color-violet-border)] md:w-auto">
                            <span dir="ltr" className="text-sm text-ink">
                              {faDigits(formatMinutes(rule.startMinute))} — {faDigits(formatMinutes(rule.endMinute))}
                            </span>
                            <button
                              type="button"
                              aria-label={`حذف زمان ${name}`}
                              className="ms-auto grid size-11 place-items-center rounded-control border-0 bg-transparent text-meta transition-colors hover:bg-surface-2 hover:text-wood-light md:ms-1 md:size-9"
                              onClick={() => setPendingDelete(rule.id)}
                            >
                              <TrashIcon size={14} />
                            </button>
                          </div>
                          {pendingDelete === rule.id ? (
                            <div className="mt-2 rounded-control bg-surface-2 p-3.5 shadow-[inset_0_0_0_1px_var(--color-divider)]">
                              <p className="text-[13.5px] text-ink-2">این زمان هفتگی حذف شود؟</p>
                              <div className="mt-3 flex flex-wrap gap-2.5">
                                <button type="button" className="btn-danger" onClick={() => void remove(rule)}>
                                  بله، حذف کن
                                </button>
                                <button type="button" className="btn-ghost" onClick={() => setPendingDelete(null)}>
                                  انصراف
                                </button>
                              </div>
                            </div>
                          ) : null}
                        </div>
                      ))
                    ) : (
                      <span className="py-2 text-sm text-meta">زمانی ثبت نشده</span>
                    )}
                  </div>
                  <button
                    type="button"
                    className="inline-flex min-h-11 shrink-0 items-center self-start px-1 text-[13px] text-meta transition-colors hover:text-violet-strong"
                    onClick={() => openForDay(day)}
                  >
                    + افزودن زمان
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function WeeklyRuleForm({
  weekday,
  start,
  end,
  pending,
  onWeekday,
  onStart,
  onEnd,
  onCancel,
  onSubmit,
}: {
  weekday: number;
  start: string;
  end: string;
  pending: boolean;
  onWeekday: (value: number) => void;
  onStart: (value: string) => void;
  onEnd: (value: string) => void;
  onCancel: () => void;
  onSubmit: () => Promise<void>;
}) {
  return (
    <form
      className="mt-6 rounded-panel bg-surface p-4.5 shadow-[inset_0_0_0_1px_var(--color-violet-border)] md:p-5"
      onSubmit={(event) => {
        event.preventDefault();
        void onSubmit();
      }}
    >
      <SectionMark tone="violet" width="sm">زمان هفتگی تازه</SectionMark>
      <div className="mt-4 grid gap-3.5 md:grid-cols-3">
        <div>
          <label className="label" htmlFor="weekday">روز</label>
          <select id="weekday" className="input" value={weekday} onChange={(event) => onWeekday(Number(event.target.value))}>
            {WEEKDAY_NAMES_FA.map((name, index) => <option key={name} value={index}>{name}</option>)}
          </select>
        </div>
        <TimeField label="از ساعت" id="weekly-start" value={start} onChange={onStart} />
        <TimeField label="تا ساعت" id="weekly-end" value={end} onChange={onEnd} />
      </div>
      <div className="mt-4 flex flex-col-reverse gap-2.5 sm:flex-row">
        <button type="submit" className="btn-primary min-h-12" disabled={pending}>
          {pending ? "کمی صبر کنید…" : "ذخیره زمان"}
        </button>
        <button type="button" className="btn-ghost min-h-11 justify-center" onClick={onCancel}>
          انصراف
        </button>
      </div>
    </form>
  );
}

function TimeField({ label, id, value, onChange }: { label: string; id: string; value: string; onChange: (value: string) => void }) {
  return (
    <div className="min-w-0">
      <label className="label" htmlFor={id}>{label}</label>
      <input id={id} className="input min-w-0" type="time" dir="ltr" required value={value} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}

const EXCEPTION_HORIZON_DAYS = 60;

function Exceptions({
  exceptions,
  onChanged,
  onError,
}: {
  exceptions: ScheduleException[] | null;
  onChanged: (message: string) => void;
  onError: (message: string | null) => void;
}) {
  const [formOpen, setFormOpen] = useState(false);
  const [date, setDate] = useState(tehranDateKey(new Date()));
  const [type, setType] = useState<"BLOCK" | "EXTRA">("BLOCK");
  const [wholeDay, setWholeDay] = useState(true);
  const [start, setStart] = useState("16:00");
  const [end, setEnd] = useState("20:00");
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const timesRequired = type === "EXTRA" || !wholeDay;

  async function submit() {
    setPending(true);
    onError(null);
    try {
      await addException({
        date,
        type,
        ...(timesRequired
          ? { startMinute: parseTimeToMinutes(start), endMinute: parseTimeToMinutes(end) }
          : { startMinute: null, endMinute: null }),
        ...(reason.trim() ? { reason: reason.trim() } : {}),
      });
      setReason("");
      setFormOpen(false);
      onChanged("تغییر این روز ذخیره شد.");
    } catch (caught) {
      onError(errorMessage(caught));
    } finally {
      setPending(false);
    }
  }

  async function remove(exception: ScheduleException) {
    onError(null);
    try {
      await removeException(exception.id);
      onChanged("تغییر یک‌روزه حذف شد.");
    } catch (caught) {
      onError(errorMessage(caught));
    }
  }

  return (
    <section className="rule-top mt-12 pt-9 md:mt-15 md:pt-11">
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <SectionMark tone="violet">تغییر برای یک روز خاص</SectionMark>
          <h2 className="mt-2.5 text-xl font-semibold text-ink">استثناهای برنامه</h2>
          <p className="mt-1.5 max-w-[62ch] text-[13.5px] leading-[1.9] text-meta">
            برای یک تاریخ مشخص، تمام یا بخشی از روز را ببند؛ یا زمانی اضافه کن
            که در برنامه هفتگی‌ات نیست.
          </p>
        </div>
        <button type="button" className="btn-outline w-full sm:w-auto" onClick={() => setFormOpen((open) => !open)}>
          {formOpen ? "بستن فرم" : "ثبت تغییر یک‌روزه"}
        </button>
      </div>

      {formOpen ? (
        <form
          className="mt-6 rounded-panel bg-surface p-4.5 shadow-[inset_0_0_0_1px_var(--color-divider)] md:p-5"
          onSubmit={(event) => { event.preventDefault(); void submit(); }}
        >
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="label" htmlFor="exception-date">تاریخ</label>
              <select id="exception-date" className="input" value={date} onChange={(event) => setDate(event.target.value)}>
                {upcomingDates().map((day) => <option key={day} value={day}>{formatJalaliDayMonth(day)}</option>)}
              </select>
              <p className="field-hint">فقط روزهای پیشِ رو قابل انتخاب‌اند.</p>
            </div>
            <fieldset>
              <legend className="label">نوع تغییر</legend>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  aria-pressed={type === "BLOCK"}
                  className={type === "BLOCK" ? "btn-outline min-h-12 bg-violet-surface" : "btn-quiet min-h-12"}
                  onClick={() => setType("BLOCK")}
                >
                  این روز نیستم
                </button>
                <button
                  type="button"
                  aria-pressed={type === "EXTRA"}
                  className={type === "EXTRA" ? "btn-outline min-h-12 bg-violet-surface" : "btn-quiet min-h-12"}
                  onClick={() => { setType("EXTRA"); setWholeDay(false); }}
                >
                  زمان اضافه دارم
                </button>
              </div>
            </fieldset>
          </div>

          {type === "BLOCK" ? (
            <label className="mt-4 flex min-h-11 items-center gap-2.5 text-sm text-ink-2">
              <input type="checkbox" checked={wholeDay} onChange={(event) => setWholeDay(event.target.checked)} />
              بستن تمام روز
            </label>
          ) : null}

          {timesRequired ? (
            <div className="mt-4 grid gap-3.5 sm:grid-cols-2">
              <TimeField label="از ساعت" id="exception-start" value={start} onChange={setStart} />
              <TimeField label="تا ساعت" id="exception-end" value={end} onChange={setEnd} />
            </div>
          ) : null}

          <div className="mt-4">
            <label className="label" htmlFor="exception-reason">دلیل (اختیاری)</label>
            <input id="exception-reason" className="input" maxLength={200} value={reason} onChange={(event) => setReason(event.target.value)} />
            <p className="field-hint">این یادداشت فقط برای خودت نمایش داده می‌شود.</p>
          </div>
          <div className="mt-4 flex flex-col-reverse gap-2.5 sm:flex-row">
            <button type="submit" className="btn-primary min-h-12" disabled={pending}>
              {pending ? "کمی صبر کنید…" : "ذخیره تغییر"}
            </button>
            <button type="button" className="btn-ghost min-h-11 justify-center" onClick={() => setFormOpen(false)}>
              انصراف
            </button>
          </div>
        </form>
      ) : null}

      {exceptions === null ? (
        <div className="mt-7 space-y-3"><Skeleton className="h-16 w-full" /><Skeleton className="h-16 w-full" delay={1} /></div>
      ) : exceptions.length === 0 ? (
        <p className="mt-7 text-[14px] text-meta">برای روزهای پیشِ رو تغییری ثبت نشده است.</p>
      ) : (
        <ul className="mt-7">
          {exceptions.map((exception) => (
            <li key={exception.id} className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-divider/70 px-1 py-4">
              <span className={`flex items-center gap-2 text-[13.5px] ${exception.type === "BLOCK" ? "text-wood-light" : "text-violet-strong"}`}>
                <span className={`size-1.5 rounded-full ${exception.type === "BLOCK" ? "bg-wood-light" : "bg-violet"}`} />
                {exception.type === "BLOCK" ? "در دسترس نیستم" : "زمان اضافه"}
              </span>
              <span className="text-sm text-ink-2">{formatJalaliDayMonth(exception.date)}</span>
              <span dir="ltr" className="text-sm text-meta">
                {exception.startMinute !== null && exception.endMinute !== null
                  ? `${faDigits(formatMinutes(exception.startMinute))} — ${faDigits(formatMinutes(exception.endMinute))}`
                  : "تمام روز"}
              </span>
              {exception.reason ? <span className="min-w-0 flex-1 text-[13px] text-meta">{exception.reason}</span> : <span className="flex-1" />}
              <button type="button" className="inline-flex min-h-11 items-center gap-2 px-1 text-[13px] text-meta transition-colors hover:text-error" onClick={() => void remove(exception)}>
                <TrashIcon size={14} /> حذف
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function WeeklyRulesSkeleton() {
  return (
    <div className="mt-7 space-y-1" aria-label="در حال بارگذاری برنامه هفتگی">
      {Array.from({ length: 4 }, (_, index) => (
        <div key={index} className="flex items-center gap-5 border-b border-divider/70 px-1 py-4">
          <Skeleton className="h-4 w-20" delay={(index % 3) as 0 | 1 | 2} />
          <Skeleton className="h-12 w-44 max-w-[60%]" delay={((index + 1) % 3) as 0 | 1 | 2} />
        </div>
      ))}
    </div>
  );
}

function upcomingDates(): string[] {
  const today = tehranDateKey(new Date());
  return Array.from({ length: EXCEPTION_HORIZON_DAYS }, (_, index) => addDaysToDateKey(today, index));
}
