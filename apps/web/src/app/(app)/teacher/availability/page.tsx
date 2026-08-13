"use client";

import { useCallback, useEffect, useState } from "react";
import {
  WEEKDAY_NAMES_FA,
  addDaysToDateKey,
  formatMinutes,
  parseTimeToMinutes,
  tehranDateKey,
} from "@music/shared";

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

/**
 * برنامه‌ی استاد.
 *
 * دو چیز جدا که با هم برنامه را می‌سازند:
 *
 *   **قوانین هفتگی** — «هر شنبه ۱۶ تا ۲۰». تکرارشونده و بدون تاریخ
 *   پایان. اسکلت برنامه از این‌ها ساخته می‌شود.
 *
 *   **استثناها** — «این پنج‌شنبه نیستم» یا «این یک‌شنبه استثنائاً
 *   هستم». فقط یک روز مشخص.
 *
 * اسلات‌های آزاد هیچ‌جا ذخیره نمی‌شوند و هر بار از روی همین دو تا
 * محاسبه می‌شوند (سند معماری، بخش ۴.۳). یعنی هر تغییری اینجا بلافاصله
 * در آنچه هنرجو می‌بیند اثر می‌گذارد.
 */
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
    <div className="mx-auto max-w-3xl px-5 py-12">
      <h1 className="font-display text-2xl leading-snug">برنامه‌ی من</h1>
      <p className="mt-2 text-sm text-ink-muted">
        ساعت‌هایی که اینجا تعریف می‌کنید، همان ساعت‌هایی است که هنرجو می‌تواند
        رزرو کند. همه به وقت تهران است.
      </p>

      {error ? <p className="alert-error mt-6">{error}</p> : null}
      {notice ? <p className="alert-info mt-6">{notice}</p> : null}

      <WeeklyRules
        rules={rules}
        onChanged={(message) => {
          setNotice(message);
          void load();
        }}
        onError={setError}
      />

      <Exceptions
        exceptions={exceptions}
        onChanged={() => {
          setNotice(null);
          void load();
        }}
        onError={setError}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// قوانین هفتگی
// ---------------------------------------------------------------------------

function WeeklyRules({
  rules,
  onChanged,
  onError,
}: {
  rules: ScheduleRule[] | null;
  onChanged: (message: string | null) => void;
  onError: (message: string | null) => void;
}) {
  const [weekday, setWeekday] = useState(0);
  const [start, setStart] = useState("16:00");
  const [end, setEnd] = useState("20:00");
  const [pending, setPending] = useState(false);

  async function submit() {
    setPending(true);
    onError(null);

    try {
      await addRule({
        weekday,
        startMinute: parseTimeToMinutes(start),
        endMinute: parseTimeToMinutes(end),
        // «از امروز، بدون تاریخ پایان» تقریباً همیشه همان چیزی است که
        // استاد می‌خواهد. تاریخ پایان در API هست ولی در فرم نیامده تا
        // فرم سه‌فیلدی بماند؛ برای بستن یک بازه، حذفش ساده‌تر است.
        validFrom: tehranDateKey(new Date()),
        validUntil: null,
      });
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
      onChanged(
        result.affectedBookings > 0
          ? `این بازه حذف شد، ولی ${faNumber(result.affectedBookings)} کلاسِ از پیش رزروشده در همان ساعت سر جایش می‌ماند و باید برگزار شود.`
          : null,
      );
    } catch (caught) {
      onError(errorMessage(caught));
    }
  }

  return (
    <section className="mt-10">
      <h2 className="text-lg font-bold">ساعت‌های هفتگی</h2>

      {rules === null ? (
        <p className="mt-4 text-sm text-ink-muted">در حال بارگذاری…</p>
      ) : rules.length === 0 ? (
        <p className="alert-info mt-4">
          هنوز هیچ ساعتی تعریف نکرده‌اید، پس هیچ هنرجویی نمی‌تواند با شما کلاس
          بگیرد.
        </p>
      ) : (
        <>
        <WeekShape rules={rules} />

        <ul className="mt-6 space-y-2">
          {rules.map((rule) => (
            <li
              key={rule.id}
              className="flex items-center justify-between gap-4 rounded-lg border border-border px-4 py-3"
            >
              <span>
                <span className="font-medium">{WEEKDAY_NAMES_FA[rule.weekday]}</span>
                {"، "}
                {faDigits(formatMinutes(rule.startMinute))} تا{" "}
                {faDigits(formatMinutes(rule.endMinute))}
              </span>

              <button
                type="button"
                className="text-sm text-ink-muted underline"
                onClick={() => void remove(rule)}
              >
                حذف
              </button>
            </li>
          ))}
        </ul>
        </>
      )}

      <form
        className="mt-6 flex flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <div>
          <label className="label" htmlFor="weekday">
            روز
          </label>
          <select
            id="weekday"
            className="input"
            value={weekday}
            onChange={(event) => setWeekday(Number(event.target.value))}
          >
            {WEEKDAY_NAMES_FA.map((name, index) => (
              <option key={name} value={index}>
                {name}
              </option>
            ))}
          </select>
        </div>

        <TimeField label="از ساعت" id="start" value={start} onChange={setStart} />
        <TimeField label="تا ساعت" id="end" value={end} onChange={setEnd} />

        <button type="submit" className="btn-primary" disabled={pending}>
          {pending ? "…" : "افزودن"}
        </button>
      </form>
    </section>
  );
}

/**
 * شکلِ هفته — نمای بصریِ همان قوانینی که پایین‌تر فهرست شده‌اند.
 *
 * فهرست می‌گوید «شنبه، ۱۶:۰۰ تا ۲۰:۰۰» و درست هم می‌گوید، ولی جوابِ
 * سؤالی را که استاد واقعاً دارد نمی‌دهد: هفته‌ام چه شکلی است؟ کجا
 * سنگین است و کجا خالی؟ اینجا **ارتفاع از طولِ بازه می‌آید**، پس یک
 * بازه‌ی چهارساعته چهار برابرِ یک‌ساعته دیده می‌شود بدون اینکه عددی
 * خوانده شود.
 *
 * `aria-hidden` است و عمداً: همین داده دقیقاً پایین‌تر به‌صورت متن و
 * با دکمه‌ی حذف آمده، و آن فهرست سطحِ قابل‌استفاده است. تکرارش برای
 * صفحه‌خوان فقط نویز است.
 */
function WeekShape({ rules }: { rules: ScheduleRule[] }) {
  const dayStart = Math.min(...rules.map((rule) => rule.startMinute));
  const dayEnd = Math.max(...rules.map((rule) => rule.endMinute));

  /** به ساعتِ کامل گرد می‌شود تا خط‌های ساعت روی عدد گرد بیفتند */
  const from = Math.floor(dayStart / 60) * 60;
  const to = Math.ceil(dayEnd / 60) * 60;
  const span = Math.max(60, to - from);

  const pixelsPerMinute = 0.4;
  const height = span * pixelsPerMinute;

  const hours = Array.from(
    { length: Math.floor(span / 60) + 1 },
    (_, index) => from + index * 60,
  );

  return (
    <div className="mt-4 flex gap-2" aria-hidden="true">
      <div className="relative flex-none" style={{ height, width: "2.5rem" }}>
        {hours.map((minute) => (
          <span
            key={minute}
            className="tnum absolute text-[0.625rem] text-ink-muted"
            style={{ top: (minute - from) * pixelsPerMinute - 6 }}
          >
            {faDigits(formatMinutes(minute))}
          </span>
        ))}
      </div>

      <div className="grid flex-1 grid-cols-7 gap-1">
        {WEEKDAY_NAMES_FA.map((name, weekday) => (
          <div key={name}>
            <div className="relative rounded-sm bg-surface-sunken" style={{ height }}>
              {hours.slice(1, -1).map((minute) => (
                <span
                  key={minute}
                  className="absolute inset-x-0 h-px bg-border"
                  style={{ top: (minute - from) * pixelsPerMinute }}
                />
              ))}

              {rules
                .filter((rule) => rule.weekday === weekday)
                .map((rule) => (
                  <span
                    key={rule.id}
                    /** همان زبانِ خانه‌های تخته‌ی رزرو، تا یک چیز خوانده شود */
                    className="absolute inset-x-0 rounded-sm border border-accent-dim bg-accent-dim/40"
                    style={{
                      top: (rule.startMinute - from) * pixelsPerMinute,
                      height: (rule.endMinute - rule.startMinute) * pixelsPerMinute,
                    }}
                  />
                ))}
            </div>

            <p className="mt-1.5 text-center text-[0.625rem] text-ink-muted">{name}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * ورودی ساعت.
 *
 * `type="time"` مرورگر استفاده می‌شود نه فیلد متنی: صفحه‌کلید موبایل
 * را درست باز می‌کند و خودش «۲۵:۷۰» را نمی‌پذیرد. سقفش ۲۳:۵۹ است، پس
 * بازه‌ای که دقیقاً سر نیمه‌شب تمام شود از این فرم درنمی‌آید — که برای
 * کلاس موسیقی حالت واقعی‌ای نیست.
 */
function TimeField({
  label,
  id,
  value,
  onChange,
}: {
  label: string;
  id: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label className="label" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        className="input"
        type="time"
        dir="ltr"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// استثناها
// ---------------------------------------------------------------------------

/** چند روز آینده در فهرست انتخاب تاریخ بیاید. */
const EXCEPTION_HORIZON_DAYS = 60;

function Exceptions({
  exceptions,
  onChanged,
  onError,
}: {
  exceptions: ScheduleException[] | null;
  onChanged: () => void;
  onError: (message: string | null) => void;
}) {
  const [date, setDate] = useState(tehranDateKey(new Date()));
  const [type, setType] = useState<"BLOCK" | "EXTRA">("BLOCK");
  const [wholeDay, setWholeDay] = useState(true);
  const [start, setStart] = useState("16:00");
  const [end, setEnd] = useState("20:00");
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);

  // «کل روز» فقط برای بستن معنا دارد؛ «استثنائاً هستم» بدون ساعت یعنی
  // چه؟ اگر واقعاً همیشه آن روز آزاد است، جایش قانون هفتگی است.
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
      onChanged();
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
      onChanged();
    } catch (caught) {
      onError(errorMessage(caught));
    }
  }

  return (
    <section className="mt-12">
      <h2 className="text-lg font-bold">استثناها</h2>
      <p className="mt-1 text-sm text-ink-muted">
        روزهایی که با برنامه‌ی هفتگی فرق دارند. فقط روزهای پیشِ رو نشان داده
        می‌شوند.
      </p>

      {exceptions === null ? (
        <p className="mt-4 text-sm text-ink-muted">در حال بارگذاری…</p>
      ) : exceptions.length === 0 ? (
        <p className="mt-4 text-sm text-ink-muted">استثنایی ثبت نشده است.</p>
      ) : (
        <ul className="mt-4 space-y-2">
          {exceptions.map((exception) => (
            <li
              key={exception.id}
              className="flex items-center justify-between gap-4 rounded-lg border border-border px-4 py-3"
            >
              <span className="text-sm">
                <span
                  className={`badge ${exception.type === "BLOCK" ? "badge-off" : "badge-ok"}`}
                >
                  {exception.type === "BLOCK" ? "نیستم" : "استثنائاً هستم"}
                </span>{" "}
                {formatJalaliDayMonth(exception.date)}
                {exception.startMinute !== null && exception.endMinute !== null
                  ? ` · ${faDigits(formatMinutes(exception.startMinute))} تا ${faDigits(formatMinutes(exception.endMinute))}`
                  : " · کل روز"}
                {exception.reason ? (
                  <span className="text-ink-muted"> · {exception.reason}</span>
                ) : null}
              </span>

              <button
                type="button"
                className="text-sm text-ink-muted underline"
                onClick={() => void remove(exception)}
              >
                حذف
              </button>
            </li>
          ))}
        </ul>
      )}

      <form
        className="mt-6 space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="label" htmlFor="exception-date">
              تاریخ
            </label>
            {/*
              فهرست تاریخ‌های شمسی به‌جای `input[type=date]`.
              ورودی تاریخ مرورگر میلادی است و استادی که «این پنج‌شنبه»
              را می‌خواهد باید معادل میلادی‌اش را حساب کند. فهرست
              محدودِ روزهای پیشِ رو هم این را حل می‌کند و هم انتخاب
              تاریخ گذشته را ناممکن.
            */}
            <select
              id="exception-date"
              className="input"
              value={date}
              onChange={(event) => setDate(event.target.value)}
            >
              {upcomingDates().map((day) => (
                <option key={day} value={day}>
                  {formatJalaliDayMonth(day)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="label" htmlFor="exception-type">
              نوع
            </label>
            <select
              id="exception-type"
              className="input"
              value={type}
              onChange={(event) => setType(event.target.value as "BLOCK" | "EXTRA")}
            >
              <option value="BLOCK">نیستم</option>
              <option value="EXTRA">استثنائاً هستم</option>
            </select>
          </div>

          {type === "BLOCK" ? (
            <label className="flex items-center gap-2 pb-3 text-sm">
              <input
                type="checkbox"
                checked={wholeDay}
                onChange={(event) => setWholeDay(event.target.checked)}
              />
              کل روز
            </label>
          ) : null}
        </div>

        {timesRequired ? (
          <div className="flex flex-wrap items-end gap-3">
            <TimeField
              label="از ساعت"
              id="exception-start"
              value={start}
              onChange={setStart}
            />
            <TimeField label="تا ساعت" id="exception-end" value={end} onChange={setEnd} />
          </div>
        ) : null}

        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1">
            <label className="label" htmlFor="exception-reason">
              دلیل (اختیاری، فقط خودتان می‌بینید)
            </label>
            <input
              id="exception-reason"
              className="input"
              type="text"
              maxLength={200}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </div>

          <button type="submit" className="btn-primary" disabled={pending}>
            {pending ? "…" : "افزودن"}
          </button>
        </div>
      </form>
    </section>
  );
}

function upcomingDates(): string[] {
  const today = tehranDateKey(new Date());
  return Array.from({ length: EXCEPTION_HORIZON_DAYS }, (_, index) =>
    addDaysToDateKey(today, index),
  );
}
