import { describe, expect, it } from "vitest";
import {
  clampTo,
  normalize,
  overlaps,
  sliceIntoSlots,
  subtract,
  type Interval,
} from "./interval.js";

/** کمک‌کننده‌ی خوانایی: ساعت‌های ساده به‌جای میلی‌ثانیه‌ی یونیکس. */
const h = (hour: number): number => hour * 3_600_000;
const iv = (from: number, to: number): Interval => ({ start: h(from), end: h(to) });

describe("normalize", () => {
  it("بازه‌های متداخل را ادغام می‌کند", () => {
    expect(normalize([iv(1, 3), iv(2, 5)])).toEqual([iv(1, 5)]);
  });

  it("بازه‌های مماس را هم ادغام می‌کند", () => {
    // ۱۶–۱۸ و ۱۸–۲۰ باید یک پنجره شوند وگرنه جلسه‌ی روی مرز از دست می‌رود
    expect(normalize([iv(16, 18), iv(18, 20)])).toEqual([iv(16, 20)]);
  });

  it("بازه‌های جدا را جدا نگه می‌دارد و مرتب می‌کند", () => {
    expect(normalize([iv(18, 20), iv(9, 11)])).toEqual([iv(9, 11), iv(18, 20)]);
  });

  it("بازه‌ی تهی یا معکوس را دور می‌ریزد", () => {
    expect(normalize([iv(5, 5), iv(9, 7)])).toEqual([]);
  });

  it("ورودی را تغییر نمی‌دهد", () => {
    const input = [iv(1, 3), iv(2, 5)];
    const snapshot = JSON.stringify(input);
    normalize(input);
    expect(JSON.stringify(input)).toBe(snapshot);
  });
});

describe("subtract", () => {
  it("بازه را از وسط دو تکه می‌کند", () => {
    expect(subtract([iv(16, 20)], [iv(17, 18)])).toEqual([iv(16, 17), iv(18, 20)]);
  });

  it("از ابتدا و انتها می‌برد", () => {
    expect(subtract([iv(16, 20)], [iv(16, 17)])).toEqual([iv(17, 20)]);
    expect(subtract([iv(16, 20)], [iv(19, 20)])).toEqual([iv(16, 19)]);
  });

  it("وقتی برش کل بازه را بپوشاند چیزی باقی نمی‌ماند", () => {
    expect(subtract([iv(16, 20)], [iv(15, 21)])).toEqual([]);
  });

  it("برش بی‌ربط اثری ندارد", () => {
    expect(subtract([iv(16, 20)], [iv(8, 9)])).toEqual([iv(16, 20)]);
  });

  it("چند برش پشت‌سرهم را اعمال می‌کند", () => {
    expect(subtract([iv(8, 20)], [iv(10, 11), iv(14, 15)])).toEqual([
      iv(8, 10),
      iv(11, 14),
      iv(15, 20),
    ]);
  });
});

describe("overlaps", () => {
  it("تماس در نقطه‌ی مرزی را تداخل نمی‌شمارد", () => {
    // بازه‌ها نیم‌باز [start, end) هستند
    expect(overlaps(iv(16, 17), iv(17, 18))).toBe(false);
  });

  it("اشتراک واقعی را تشخیص می‌دهد", () => {
    expect(overlaps(iv(16, 18), iv(17, 19))).toBe(true);
  });
});

describe("clampTo", () => {
  it("بازه‌ها را به پنجره محدود می‌کند", () => {
    expect(clampTo([iv(8, 20)], iv(10, 15))).toEqual([iv(10, 15)]);
  });

  it("بازه‌ی کاملاً بیرون را حذف می‌کند", () => {
    expect(clampTo([iv(8, 9)], iv(10, 15))).toEqual([]);
  });
});

describe("sliceIntoSlots", () => {
  const minute = 60_000;

  it("پنجره را به اسلات‌های چسبیده می‌شکند", () => {
    const slots = sliceIntoSlots(iv(16, 20), 60 * minute, 60 * minute);
    expect(slots).toHaveLength(4);
    expect(slots[0]).toEqual(iv(16, 17));
    expect(slots[3]).toEqual(iv(19, 20));
  });

  it("اسلات ناقص انتهایی را دور می‌ریزد", () => {
    // ۱۶ تا ۱۹:۳۰ فقط سه جلسه‌ی یک‌ساعته جا می‌دهد
    const window: Interval = { start: h(16), end: h(19) + 30 * minute };
    expect(sliceIntoSlots(window, 60 * minute, 60 * minute)).toHaveLength(3);
  });

  it("با گام کوچک‌تر از اسلات، شروع‌های هم‌پوشان می‌سازد", () => {
    const slots = sliceIntoSlots(iv(16, 18), 60 * minute, 30 * minute);
    // ۱۶:۰۰ و ۱۶:۳۰ و ۱۷:۰۰
    expect(slots).toHaveLength(3);
    expect(slots[1]?.start).toBe(h(16) + 30 * minute);
  });

  it("گام یا طول نامعتبر را رد می‌کند", () => {
    expect(() => sliceIntoSlots(iv(16, 20), 0, 60 * minute)).toThrow();
  });
});
