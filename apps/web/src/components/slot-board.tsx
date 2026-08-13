"use client";

import { useMemo, useState } from "react";
import { parseTimeToMinutes, weekdayNameFa } from "@music/shared";

import type { Slot } from "@/lib/app-api";
import { faDigits, faNumber, formatJalaliShort } from "@/lib/format";

/**
 * تخته‌ی ساعت‌های آزاد.
 *
 * جایگزین فهرست تختِ چیپ‌ها. آن فهرست برای دو هفته حدود ۱۸۰ دکمه‌ی
 * کاملاً یکسان می‌ساخت که هیچ‌کدام از حرف‌های واقعیِ برنامه‌ی استاد را
 * نمی‌زد: کدام روزها اصلاً کلاس دارد، کجای روز شلوغ است، و کجا وسطِ
 * روز دو ساعت فاصله هست.
 *
 * **یک کامپوننت، دو چیدمان** — نه دو کامپوننت:
 *
 *   دسکتاپ — تخته‌ی هفته. ستون‌ها به روزهای هفته قفل‌اند (شنبه = ۰ تا
 *   جمعه = ۶، شماره‌گذاری ایرانی)، پس روزِ خالی هم ستون خودش را دارد و
 *   شکلِ هفته دیده می‌شود.
 *
 *   موبایل — نوارِ روز و بعد ساعت‌های همان روز. هفت ستون در ۳۴۳
 *   پیکسل یعنی ستون‌های ۴۴ پیکسلی، دقیقاً روی حداقلِ هدف لمسی و بدون
 *   ذره‌ای حاشیه؛ اسکرول افقی هم همان باگی است که این بازطراحی داشت
 *   درستش می‌کرد.
 */

/** روزهای هفته به ترتیب ایرانی: شنبه = ۰ ... جمعه = ۶ */
const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6];

/** زیر این مقدار، فاصله بین دو ساعت آزاد «فاصله» نیست، فقط ته‌مانده است. */
const GAP_MINUTES = 60;

interface DayColumn {
  date: string;
  weekday: number;
  slots: Slot[];
}

export function SlotBoard({
  slots,
  selected,
  onSelect,
}: {
  slots: Slot[];
  selected: Slot | null;
  onSelect: (slot: Slot) => void;
}) {
  const days = useMemo(() => groupByDate(slots), [slots]);

  return (
    <div>
      <div className="hidden sm:block">
        <WeekGrid days={days} selected={selected} onSelect={onSelect} />
      </div>
      <div className="sm:hidden">
        <DayStrip days={days} selected={selected} onSelect={onSelect} />
      </div>
    </div>
  );
}

/**
 * روزها به ستون تبدیل می‌شوند و ستون‌های خالیِ ابتدای هفته پُر می‌شوند.
 *
 * بدون آن پُرکردن، پنجره‌ای که از وسط هفته شروع شود ستون‌ها را یک
 * خانه جابه‌جا می‌کند و «شنبه» زیر سرستونِ «دوشنبه» می‌افتد — یعنی
 * تخته‌ای که دقیقاً همان چیزی را که قرار بود نشان دهد دروغ می‌گوید.
 */
function groupByDate(slots: Slot[]): DayColumn[] {
  const groups = new Map<string, DayColumn>();

  for (const slot of slots) {
    const existing = groups.get(slot.date);
    if (existing) existing.slots.push(slot);
    else groups.set(slot.date, { date: slot.date, weekday: slot.weekday, slots: [slot] });
  }

  return [...groups.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function WeekGrid({
  days,
  selected,
  onSelect,
}: {
  days: DayColumn[];
  selected: Slot | null;
  onSelect: (slot: Slot) => void;
}) {
  const weeks = splitIntoWeeks(days);

  return (
    <div className="space-y-8">
      {weeks.map((week) => {
        const times = distinctStartTimes(week.columns);

        return (
          <div key={week.key}>
            <div className="grid grid-cols-[3.25rem_repeat(7,1fr)] gap-1 border-b border-border pb-2">
              <span />
              {WEEKDAYS.map((weekday) => {
                const day = week.columns[weekday];
                return (
                  <div key={weekday} className="text-center">
                    <div className="text-xs text-ink-muted">
                      {weekdayNameFa(weekday)}
                    </div>
                    <div
                      className={`tnum text-sm ${day ? "font-medium" : "text-ink-faint"}`}
                    >
                      {day ? formatJalaliShort(day.date).split(" ")[0] : "—"}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-1.5 space-y-1">
              {times.map((time, index) => (
                <div key={time}>
                  {index > 0 && gapBefore(times, index) >= GAP_MINUTES ? (
                    <GapMarker minutes={gapBefore(times, index)} />
                  ) : null}

                  <div className="grid grid-cols-[3.25rem_repeat(7,1fr)] gap-1">
                    <span className="tnum flex items-center text-xs text-ink-muted">
                      {faDigits(time)}
                    </span>

                    {WEEKDAYS.map((weekday) => {
                      const slot = week.columns[weekday]?.slots.find(
                        (item) => item.startTime === time,
                      );

                      if (!slot) {
                        return (
                          <span
                            key={weekday}
                            className="min-h-8 rounded-sm border border-dashed border-border"
                            aria-hidden="true"
                          />
                        );
                      }

                      const isSelected = selected?.startAt === slot.startAt;

                      return (
                        <button
                          key={weekday}
                          type="button"
                          onClick={() => onSelect(slot)}
                          aria-pressed={isSelected}
                          /**
                           * خانه متن ندارد، پس نامِ دسترس‌پذیرش باید
                           * روز و ساعت را کامل بگوید — وگرنه صفحه‌خوان
                           * چهل‌وچند دکمه‌ی بی‌نام پشت سر هم می‌خواند.
                           */
                          aria-label={`${weekdayNameFa(weekday)} ${formatJalaliShort(slot.date)}، ساعت ${faDigits(time)}`}
                          className={`min-h-8 rounded-sm border transition-colors ${
                            isSelected
                              ? "border-accent bg-accent"
                              : "border-accent-dim bg-accent-dim/25 hover:bg-accent-dim/60"
                          }`}
                        />
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}

      <Legend />
    </div>
  );
}

/** همه‌ی ساعت‌های شروعِ متمایزِ یک هفته، مرتب. */
function distinctStartTimes(columns: Record<number, DayColumn>): string[] {
  const times = new Set<string>();

  for (const day of Object.values(columns)) {
    for (const slot of day.slots) times.add(slot.startTime);
  }

  return [...times].sort((a, b) => a.localeCompare(b));
}

function gapBefore(times: string[], index: number): number {
  return parseTimeToMinutes(times[index]!) - parseTimeToMinutes(times[index - 1]!);
}

function Legend() {
  return (
    <p className="mt-3 flex items-center gap-4 text-xs text-ink-muted">
      <span className="flex items-center gap-1.5">
        <span
          className="inline-block h-3 w-3 rounded-sm border border-accent-dim bg-accent-dim/25"
          aria-hidden="true"
        />
        آزاد
      </span>
      <span className="flex items-center gap-1.5">
        <span
          className="inline-block h-3 w-3 rounded-sm border border-dashed border-border"
          aria-hidden="true"
        />
        بسته یا پُر
      </span>
    </p>
  );
}

/**
 * ساعت‌های یک روز، به ترتیب، با نشانه‌ی فاصله.
 *
 * فاصله‌ی وسط روز اطلاعات است نه فضای خالی: «تا ساعت چهار کلاس ندارد»
 * چیزی است که کاربر باید ببیند، و فهرست چسبیده‌ی چیپ‌ها پنهانش می‌کرد.
 */
function DaySlots({
  day,
  selected,
  onSelect,
  withGaps,
}: {
  day: DayColumn;
  selected: Slot | null;
  onSelect: (slot: Slot) => void;
  /** فقط در ستونِ عمودی معنا دارد؛ داخل شبکه‌ی سه‌ستونیِ موبایل نه */
  withGaps: boolean;
}) {
  const ordered = [...day.slots].sort((a, b) => a.startTime.localeCompare(b.startTime));

  return (
    <>
      {ordered.map((slot, index) => {
        const previous = ordered[index - 1];
        const gap =
          withGaps && previous
            ? parseTimeToMinutes(slot.startTime) - parseTimeToMinutes(previous.endTime)
            : 0;

        return (
          <div key={slot.startAt}>
            {gap >= GAP_MINUTES ? <GapMarker minutes={gap} /> : null}
            <SlotButton
              slot={slot}
              selected={selected?.startAt === slot.startAt}
              onSelect={() => onSelect(slot)}
            />
          </div>
        );
      })}
    </>
  );
}

function GapMarker({ minutes }: { minutes: number }) {
  const hours = Math.round(minutes / 60);

  return (
    <div
      className="flex items-center gap-2 py-1.5 text-[0.625rem] text-ink-faint"
      aria-hidden="true"
    >
      <span className="tnum whitespace-nowrap">{faNumber(hours)} ساعت فاصله</span>
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}

function SlotButton({
  slot,
  selected,
  onSelect,
}: {
  slot: Slot;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      /**
       * `min-h` روی هدف لمسیِ ۴۴ پیکسلی می‌نشیند. بدون آن، دکمه‌ی
       * ساعت روی موبایل به بلندیِ متنش می‌شود و انگشت دو تای کناری
       * را با هم می‌گیرد.
       */
      className={`tnum flex min-h-11 w-full items-center justify-center rounded-md border px-1 text-sm transition-colors ${
        selected
          ? "border-accent bg-accent font-bold text-accent-ink"
          : "border-border bg-surface-raised hover:border-accent hover:bg-surface-hover"
      }`}
    >
      {faDigits(slot.startTime)}
    </button>
  );
}

/**
 * روزها به هفته‌های تقویمی تقسیم می‌شوند، نه به دسته‌های هفت‌تایی.
 *
 * تقسیم هر هفت روز پشت سر هم ساده‌تر بود ولی ستون‌ها را از روز هفته
 * جدا می‌کرد؛ آن‌وقت «ستون سوم» هیچ معنایی نداشت.
 */
function splitIntoWeeks(days: DayColumn[]) {
  const weeks: Array<{ key: string; columns: Record<number, DayColumn> }> = [];
  let current: { key: string; columns: Record<number, DayColumn> } | null = null;

  for (const day of days) {
    // شنبه هفته‌ی تازه‌ای شروع می‌کند؛ اولین روزِ پنجره هم همین‌طور
    if (!current || day.weekday === 0) {
      current = { key: day.date, columns: {} };
      weeks.push(current);
    }
    current.columns[day.weekday] = day;
  }

  return weeks;
}

/**
 * چیدمان موبایل — نوارِ روز، بعد ساعت‌های همان روز.
 *
 * روزِ انتخاب‌شده حالتِ داخلی است ولی انتخابِ کاربر بر آن مقدم است:
 * اگر ساعتی از روز دیگری انتخاب شده باشد، نوار همان روز را نشان
 * می‌دهد، وگرنه اولین روزی که ساعت آزاد دارد.
 */
function DayStrip({
  days,
  selected,
  onSelect,
}: {
  days: DayColumn[];
  selected: Slot | null;
  onSelect: (slot: Slot) => void;
}) {
  const [openDate, setOpenDate] = useState<string | null>(null);
  const activeDate = selected?.date ?? openDate ?? days[0]?.date ?? null;
  const active = days.find((day) => day.date === activeDate) ?? days[0];

  if (!active) return null;

  return (
    <div>
      <div className="scroll-strip -mx-5 flex gap-2 px-5 pb-1">
        {days.map((day) => {
          const isActive = day.date === active.date;
          return (
            <button
              key={day.date}
              type="button"
              aria-pressed={isActive}
              onClick={() => setOpenDate(day.date)}
              className={`flex min-h-14 w-16 flex-none flex-col items-center justify-center rounded-md border px-1 transition-colors ${
                isActive
                  ? "border-accent bg-accent text-accent-ink"
                  : "border-border bg-surface-raised"
              }`}
            >
              <span className="text-[0.625rem] leading-tight">
                {weekdayNameFa(day.weekday)}
              </span>
              <span className="tnum text-sm font-bold leading-tight">
                {formatJalaliShort(day.date).split(" ")[0]}
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        <DaySlots
          day={active}
          selected={selected}
          onSelect={onSelect}
          withGaps={false}
        />
      </div>
    </div>
  );
}
