import { describe, expect, it } from "vitest";
import {
  computeAvailability,
  isSlotBookable,
  planPackageSessions,
  type AvailabilityException,
  type AvailabilityRule,
  type ComputeAvailabilityInput,
} from "./availability.js";
import { Weekday, formatMinutes, fromTehranWallClock, tehranMinutesOfDay } from "./time.js";
import type { Interval } from "./interval.js";

/**
 * ۱۵ اوت ۲۰۲۶ شنبه است — اولین روز هفته در تقویم ایرانی.
 * همه‌ی سناریوها حول همین روز چیده شده‌اند.
 */
const SATURDAY = "2026-08-15";
const SUNDAY = "2026-08-16";

/** استاد شنبه‌ها ۱۶:۰۰ تا ۲۰:۰۰ در دسترس است. */
const saturdayAfternoon: AvailabilityRule = {
  weekday: Weekday.SATURDAY,
  startMinute: 16 * 60,
  endMinute: 20 * 60,
  validFrom: "2026-01-01",
  validUntil: null,
};

/** لحظه‌ای خیلی قبل‌تر، تا محدودیت «حداقل فاصله تا کلاس» دخالت نکند. */
const wellBefore = new Date("2026-08-01T00:00:00Z");

function baseInput(
  overrides: Partial<ComputeAvailabilityInput> = {},
): ComputeAvailabilityInput {
  return {
    rules: [saturdayAfternoon],
    exceptions: [],
    busy: [],
    from: SATURDAY,
    to: SATURDAY,
    now: wellBefore,
    options: {
      sessionMinutes: 60,
      bufferMinutes: 0,
      minLeadMinutes: 0,
    },
    ...overrides,
  };
}

/** خروجی را به ساعت تهران تبدیل می‌کند تا اظهارنظرها خوانا بمانند. */
function asTehranTimes(slots: Interval[]): string[] {
  return slots.map((slot) => formatMinutes(tehranMinutesOfDay(new Date(slot.start))));
}

function booking(dateKey: string, startHour: number, durationMinutes: number): Interval {
  const start = fromTehranWallClock(dateKey, startHour * 60).getTime();
  return { start, end: start + durationMinutes * 60_000 };
}

describe("پنجره‌ی کاری پایه", () => {
  it("پنجره‌ی چهارساعته را به چهار جلسه‌ی یک‌ساعته می‌شکند", () => {
    const slots = computeAvailability(baseInput());
    expect(asTehranTimes(slots)).toEqual(["16:00", "17:00", "18:00", "19:00"]);
  });

  it("در روزی که قانون ندارد چیزی پیشنهاد نمی‌دهد", () => {
    const slots = computeAvailability(baseInput({ from: SUNDAY, to: SUNDAY }));
    expect(slots).toEqual([]);
  });

  it("قانونی که هنوز شروع نشده اعمال نمی‌شود", () => {
    const future: AvailabilityRule = { ...saturdayAfternoon, validFrom: "2026-12-01" };
    expect(computeAvailability(baseInput({ rules: [future] }))).toEqual([]);
  });

  it("قانون منقضی‌شده اعمال نمی‌شود", () => {
    const expired: AvailabilityRule = { ...saturdayAfternoon, validUntil: "2026-06-30" };
    expect(computeAvailability(baseInput({ rules: [expired] }))).toEqual([]);
  });

  it("جلسه‌ی ۲۰ دقیقه‌ای معارفه اسلات بیشتری می‌سازد", () => {
    const slots = computeAvailability(
      baseInput({
        options: { sessionMinutes: 20, bufferMinutes: 0, minLeadMinutes: 0 },
      }),
    );
    expect(slots).toHaveLength(12);
    expect(asTehranTimes(slots).slice(0, 3)).toEqual(["16:00", "16:20", "16:40"]);
  });
});

describe("رزروهای موجود", () => {
  it("اسلات رزروشده را حذف می‌کند و بقیه را دست نمی‌زند", () => {
    const slots = computeAvailability(baseInput({ busy: [booking(SATURDAY, 17, 60)] }));
    expect(asTehranTimes(slots)).toEqual(["16:00", "18:00", "19:00"]);
  });

  it("بافر، اسلات‌های چسبیده به رزرو را هم حذف می‌کند", () => {
    // رزرو ۱۷:۰۰–۱۸:۰۰ با بافر ۱۵ دقیقه، بازه‌ی ۱۶:۴۵–۱۸:۱۵ را مسدود می‌کند
    const slots = computeAvailability(
      baseInput({
        busy: [booking(SATURDAY, 17, 60)],
        options: { sessionMinutes: 60, bufferMinutes: 15, minLeadMinutes: 0 },
      }),
    );
    expect(asTehranTimes(slots)).toEqual(["19:00"]);
  });

  it("شبکه‌ی ساعت‌ها را جابه‌جا نمی‌کند", () => {
    // نکته‌ی مهم طراحی: بعد از حذف یک رزرو، ساعت‌های باقی‌مانده باید هنوز
    // سرِ ساعت باشند، نه ۱۸:۱۵ و ۱۹:۱۵
    const slots = computeAvailability(
      baseInput({
        busy: [booking(SATURDAY, 16, 30)],
        options: { sessionMinutes: 60, bufferMinutes: 10, minLeadMinutes: 0 },
      }),
    );
    for (const time of asTehranTimes(slots)) {
      expect(time.endsWith(":00")).toBe(true);
    }
  });
});

describe("استثناها", () => {
  it("بلوکِ کل روز همه‌چیز را پاک می‌کند", () => {
    const dayOff: AvailabilityException = {
      date: SATURDAY,
      type: "BLOCK",
      startMinute: null,
      endMinute: null,
    };
    expect(computeAvailability(baseInput({ exceptions: [dayOff] }))).toEqual([]);
  });

  it("بلوکِ بخشی از روز فقط همان بخش را می‌برد", () => {
    const partial: AvailabilityException = {
      date: SATURDAY,
      type: "BLOCK",
      startMinute: 18 * 60,
      endMinute: 20 * 60,
    };
    const slots = computeAvailability(baseInput({ exceptions: [partial] }));
    expect(asTehranTimes(slots)).toEqual(["16:00", "17:00"]);
  });

  it("استثنای extra در روزی که قانون ندارد، دسترس‌پذیری می‌سازد", () => {
    const extraDay: AvailabilityException = {
      date: SUNDAY,
      type: "EXTRA",
      startMinute: 10 * 60,
      endMinute: 12 * 60,
    };
    const slots = computeAvailability(
      baseInput({ exceptions: [extraDay], from: SUNDAY, to: SUNDAY }),
    );
    expect(asTehranTimes(slots)).toEqual(["10:00", "11:00"]);
  });

  it("بلوک بر extra اولویت دارد", () => {
    const exceptions: AvailabilityException[] = [
      { date: SATURDAY, type: "EXTRA", startMinute: 10 * 60, endMinute: 12 * 60 },
      { date: SATURDAY, type: "BLOCK", startMinute: 10 * 60, endMinute: 12 * 60 },
    ];
    const slots = computeAvailability(baseInput({ exceptions }));
    expect(asTehranTimes(slots)).toEqual(["16:00", "17:00", "18:00", "19:00"]);
  });
});

describe("حداقل فاصله تا شروع کلاس", () => {
  it("کلاسی که خیلی نزدیک است پیشنهاد نمی‌شود", () => {
    // «الان» ساعت ۱۵:۰۰ تهران است و حداقل فاصله ۱۲۰ دقیقه
    const now = fromTehranWallClock(SATURDAY, 15 * 60);
    const slots = computeAvailability(
      baseInput({
        now,
        options: { sessionMinutes: 60, bufferMinutes: 0, minLeadMinutes: 120 },
      }),
    );
    expect(asTehranTimes(slots)).toEqual(["17:00", "18:00", "19:00"]);
  });
});

describe("اعتبارسنجی یک اسلات مشخص", () => {
  const input = {
    rules: [saturdayAfternoon],
    exceptions: [],
    busy: [],
    now: wellBefore,
    options: { sessionMinutes: 60, bufferMinutes: 0, minLeadMinutes: 0 },
  };

  it("اسلات معتبر را تأیید می‌کند", () => {
    expect(isSlotBookable(fromTehranWallClock(SATURDAY, 17 * 60), input)).toBe(true);
  });

  it("اسلات بیرون از پنجره‌ی کاری را رد می‌کند", () => {
    expect(isSlotBookable(fromTehranWallClock(SATURDAY, 9 * 60), input)).toBe(false);
  });

  it("اسلاتی که سرِ شبکه نیست را رد می‌کند", () => {
    expect(isSlotBookable(fromTehranWallClock(SATURDAY, 16 * 60 + 30), input)).toBe(false);
  });

  it("اسلات رزروشده را رد می‌کند", () => {
    const taken = { ...input, busy: [booking(SATURDAY, 17, 60)] };
    expect(isSlotBookable(fromTehranWallClock(SATURDAY, 17 * 60), taken)).toBe(false);
  });
});

describe("چیدن پکیج ماهانه", () => {
  const packageInput = {
    rules: [saturdayAfternoon],
    exceptions: [],
    busy: [] as Interval[],
    now: wellBefore,
    options: { sessionMinutes: 60, bufferMinutes: 0, minLeadMinutes: 0 },
    firstSessionDate: SATURDAY,
    startMinute: 17 * 60,
    sessionCount: 4,
  };

  it("چهار شنبه‌ی متوالی را رزرو می‌کند", () => {
    const result = planPackageSessions(packageInput);
    expect(result.ok).toBe(true);
    expect(result.sessions).toHaveLength(4);

    const dates = result.sessions.map((session) =>
      new Date(session.start).toISOString().slice(0, 10),
    );
    expect(dates).toEqual(["2026-08-15", "2026-08-22", "2026-08-29", "2026-09-05"]);
  });

  it("همه‌ی جلسات سرِ ساعت ثابت هستند", () => {
    const result = planPackageSessions(packageInput);
    for (const session of result.sessions) {
      expect(tehranMinutesOfDay(new Date(session.start))).toBe(17 * 60);
    }
  });

  it("تداخل در هفته‌ی وسط را گزارش می‌کند و کل پکیج را ناموفق می‌داند", () => {
    const result = planPackageSessions({
      ...packageInput,
      busy: [booking("2026-08-29", 17, 60)],
    });

    expect(result.ok).toBe(false);
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0]?.index).toBe(3);
    expect(result.conflicts[0]?.date).toBe("2026-08-29");
  });

  it("تعطیلی استاد در یکی از هفته‌ها را هم می‌گیرد", () => {
    const result = planPackageSessions({
      ...packageInput,
      exceptions: [
        { date: "2026-08-22", type: "BLOCK", startMinute: null, endMinute: null },
      ],
    });

    expect(result.ok).toBe(false);
    expect(result.conflicts.map((conflict) => conflict.index)).toEqual([2]);
  });
});
