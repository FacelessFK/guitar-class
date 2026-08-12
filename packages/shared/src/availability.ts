/**
 * موتور محاسبه‌ی دسترس‌پذیری.
 *
 * تصمیم معماری: اسلات‌های آزاد در دیتابیس ذخیره نمی‌شوند. هر بار از روی
 * فرمول زیر محاسبه می‌شوند:
 *
 *   (قوانین هفتگی ∪ استثناهای extra) − استثناهای block − رزروها±بافر
 *
 * دلیل: اگر برای تک‌تک بازه‌های آزاد رکورد بسازیم، با هر تغییر در برنامه‌ی
 * استاد باید هزاران رکورد آینده را همگام‌سازی کنیم. آن مسیر منبع
 * پایان‌ناپذیر باگ است.
 *
 * این فایل عمداً هیچ وابستگی بیرونی ندارد — نه دیتابیس، نه Nest، نه I/O.
 * ورودی داده‌ی ساده است و خروجی داده‌ی ساده، تا کامل و ارزان تست شود.
 */

import {
  addDaysToDateKey,
  dateKeyRange,
  fromTehranWallClock,
  weekdayOfDateKey,
  type DateKey,
  type Weekday,
} from "./time";
import {
  clampTo,
  normalize,
  overlaps,
  sliceIntoSlots,
  subtract,
  type Interval,
} from "./interval";

/** یک پنجره‌ی هفتگی تکرارشونده در برنامه‌ی استاد. ساعت‌ها به وقت تهران. */
export interface AvailabilityRule {
  weekday: Weekday;
  /** دقیقه از نیمه‌شب، به وقت تهران */
  startMinute: number;
  endMinute: number;
  validFrom: DateKey;
  /** `null` یعنی بدون تاریخ پایان */
  validUntil: DateKey | null;
}

export type ExceptionType = "BLOCK" | "EXTRA";

/**
 * استثنای یک‌روزه. `startMinute` و `endMinute` اگر `null` باشند یعنی کل روز
 * — که فقط برای `BLOCK` معنا دارد («این شنبه اصلاً نیستم»).
 */
export interface AvailabilityException {
  date: DateKey;
  type: ExceptionType;
  startMinute: number | null;
  endMinute: number | null;
}

export interface AvailabilityOptions {
  /** طول جلسه به دقیقه — از `offering` می‌آید */
  sessionMinutes: number;
  /**
   * فاصله‌ی اجباری بین دو جلسه‌ی پشت‌سرهم، به دقیقه.
   * استاد باید بین دو کلاس نفس بکشد و مشکل فنی احتمالی را حل کند.
   */
  bufferMinutes: number;
  /**
   * فاصله‌ی شروع دو اسلات پیشنهادی پشت‌سرهم، به دقیقه.
   * پیش‌فرض برابر طول جلسه است (اسلات‌های چسبیده و بدون هم‌پوشانی).
   */
  stepMinutes?: number;
  /**
   * حداقل فاصله از «الان» تا شروع کلاس، به دقیقه.
   * جلوی رزرو کلاسی که ده دقیقه‌ی دیگر شروع می‌شود را می‌گیرد.
   */
  minLeadMinutes: number;
}

export interface ComputeAvailabilityInput {
  rules: readonly AvailabilityRule[];
  exceptions: readonly AvailabilityException[];
  /** رزروهای فعال استاد در این بازه — بازه‌های مطلق UTC */
  busy: readonly Interval[];
  from: DateKey;
  to: DateKey;
  /** لحظه‌ی مرجع برای محاسبه‌ی `minLeadMinutes` */
  now: Date;
  options: AvailabilityOptions;
}

const MINUTE_MS = 60_000;

/**
 * پنجره‌های کاری خام استاد را برای یک روز مشخص، به بازه‌های مطلق UTC
 * تبدیل می‌کند. هنوز رزروها کسر نشده‌اند.
 */
function workingWindowsForDate(
  date: DateKey,
  rules: readonly AvailabilityRule[],
  exceptions: readonly AvailabilityException[],
): Interval[] {
  const weekday = weekdayOfDateKey(date);

  const fromRules = rules
    .filter((rule) => rule.weekday === weekday)
    .filter((rule) => rule.validFrom <= date)
    .filter((rule) => rule.validUntil === null || date <= rule.validUntil)
    .map((rule) => ({
      start: fromTehranWallClock(date, rule.startMinute).getTime(),
      end: fromTehranWallClock(date, rule.endMinute).getTime(),
    }));

  const dayExceptions = exceptions.filter((exception) => exception.date === date);

  const extras = dayExceptions
    .filter((exception) => exception.type === "EXTRA")
    // برای EXTRA ساعت اجباری است؛ «کل روز آزادم» معنای مفیدی ندارد
    .filter((exception) => exception.startMinute !== null && exception.endMinute !== null)
    .map((exception) => ({
      start: fromTehranWallClock(date, exception.startMinute as number).getTime(),
      end: fromTehranWallClock(date, exception.endMinute as number).getTime(),
    }));

  const blocks = dayExceptions
    .filter((exception) => exception.type === "BLOCK")
    .map((exception) => ({
      start: fromTehranWallClock(date, exception.startMinute ?? 0).getTime(),
      end: fromTehranWallClock(date, exception.endMinute ?? 24 * 60).getTime(),
    }));

  return subtract(normalize([...fromRules, ...extras]), blocks);
}

/**
 * اسلات‌های قابل رزرو یک استاد در بازه‌ی [from, to].
 * خروجی مرتب‌شده بر اساس زمان شروع است.
 */
export function computeAvailability(input: ComputeAvailabilityInput): Interval[] {
  const { rules, exceptions, busy, from, to, now, options } = input;
  const { sessionMinutes, bufferMinutes, minLeadMinutes } = options;
  const stepMinutes = options.stepMinutes ?? sessionMinutes;

  if (sessionMinutes <= 0) {
    throw new Error("طول جلسه باید مثبت باشد");
  }

  // رزروها را از هر طرف به اندازه‌ی بافر گشاد می‌کنیم. با این کار هم فاصله‌ی
  // قبل و هم فاصله‌ی بعد از جلسه‌ی موجود، با یک عملیات تضمین می‌شود.
  const blockedByBookings: Interval[] = busy.map((booking) => ({
    start: booking.start - bufferMinutes * MINUTE_MS,
    end: booking.end + bufferMinutes * MINUTE_MS,
  }));

  const earliestStart = now.getTime() + minLeadMinutes * MINUTE_MS;

  // یک روز حاشیه در دو طرف می‌گیریم چون پنجره‌ی کاری می‌تواند به دلیل
  // اختلاف تهران و UTC به روز مجاور سرریز کند.
  const scanFrom = addDaysToDateKey(from, -1);
  const scanTo = addDaysToDateKey(to, 1);

  const requestWindow: Interval = {
    start: fromTehranWallClock(from, 0).getTime(),
    end: fromTehranWallClock(addDaysToDateKey(to, 1), 0).getTime(),
  };

  const blocked = normalize(blockedByBookings);
  const slots: Interval[] = [];

  for (const date of dateKeyRange(scanFrom, scanTo)) {
    // اسلات‌ها از روی پنجره‌ی کاری تولید می‌شوند و **بعد** با رزروها فیلتر
    // می‌شوند، نه اینکه از پنجره‌ی باقی‌مانده بریده شوند.
    //
    // اگر برعکس عمل کنیم، یک رزرو در وسط روز شبکه را جابه‌جا می‌کند و
    // ساعت‌های پیشنهادی می‌شوند ۱۸:۱۵ و ۱۹:۱۵. با این ترتیب همیشه
    // ۱۶:۰۰ و ۱۷:۰۰ و ۱۸:۰۰ می‌مانند و فقط آن‌هایی که تداخل دارند حذف
    // می‌شوند.
    for (const window of workingWindowsForDate(date, rules, exceptions)) {
      for (const slot of sliceIntoSlots(
        window,
        sessionMinutes * MINUTE_MS,
        stepMinutes * MINUTE_MS,
      )) {
        if (slot.start < earliestStart) continue;
        if (blocked.some((busyRange) => overlaps(slot, busyRange))) continue;
        slots.push(slot);
      }
    }
  }

  // پنجره‌ی درخواستی را اعمال و تکراری‌های مرزی را حذف می‌کنیم
  const withinRequest = slots.filter(
    (slot) => slot.start >= requestWindow.start && slot.start < requestWindow.end,
  );

  const seen = new Set<number>();
  return withinRequest
    .filter((slot) => {
      if (seen.has(slot.start)) return false;
      seen.add(slot.start);
      return true;
    })
    .sort((a, b) => a.start - b.start);
}

/**
 * بررسی می‌کند یک اسلات مشخص واقعاً قابل رزرو است یا نه.
 *
 * موقع ثبت رزرو استفاده می‌شود، چون بین لحظه‌ای که کاربر لیست اسلات‌ها را
 * دید تا لحظه‌ای که دکمه را زد، ممکن است شرایط عوض شده باشد.
 *
 * این بررسی **تنها خط دفاع نیست**. ضامن نهایی، exclusion constraint روی
 * جدول `bookings` در پستگرس است که تداخل را از نظر فیزیکی ناممکن می‌کند.
 */
export function isSlotBookable(
  slotStart: Date,
  input: Omit<ComputeAvailabilityInput, "from" | "to">,
): boolean {
  const date = new Date(slotStart.getTime());
  const dateKey = toDateKeyUtcSafe(date);

  const candidates = computeAvailability({
    ...input,
    from: dateKey,
    to: dateKey,
  });

  return candidates.some((slot) => slot.start === slotStart.getTime());
}

function toDateKeyUtcSafe(date: Date): DateKey {
  // از همان تبدیل تهران استفاده می‌کنیم تا با منطق بالا هماهنگ بماند
  const shifted = new Date(date.getTime() + 210 * MINUTE_MS);
  const y = shifted.getUTCFullYear();
  const m = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const d = String(shifted.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export interface PackagePlanInput extends Omit<ComputeAvailabilityInput, "from" | "to"> {
  /** تاریخ اولین جلسه */
  firstSessionDate: DateKey;
  /** ساعت ثابت هفتگی، دقیقه از نیمه‌شب به وقت تهران */
  startMinute: number;
  /** تعداد جلسات پکیج */
  sessionCount: number;
}

export interface PackagePlanResult {
  ok: boolean;
  /** بازه‌ی هر جلسه، به ترتیب */
  sessions: Interval[];
  /** جلساتی که آزاد نبودند — شماره‌ی جلسه از ۱ */
  conflicts: Array<{ index: number; date: DateKey; start: Interval }>;
}

/**
 * چیدن جلسات پکیج ماهانه: یک روز ثابت هفته، یک ساعت ثابت، `sessionCount`
 * هفته‌ی متوالی.
 *
 * همه‌ی جلسات باید آزاد باشند وگرنه `ok` برابر `false` می‌شود و
 * `conflicts` می‌گوید کدام هفته‌ها مشکل دارند. لایه‌ی بالاتر باید کل
 * تراکنش را رول‌بک کند و همین فهرست را به هنرجو نشان دهد.
 */
export function planPackageSessions(input: PackagePlanInput): PackagePlanResult {
  const { firstSessionDate, startMinute, sessionCount, options } = input;

  const sessions: Interval[] = [];
  const conflicts: PackagePlanResult["conflicts"] = [];

  // رزروهای اشغال، هرچه جلو می‌رویم با جلسات همین پکیج هم پر می‌شود تا
  // پکیج با خودش تداخل پیدا نکند (اهمیتش وقتی است که جلسات فشرده باشند)
  const busyAccumulator: Interval[] = [...input.busy];

  for (let index = 0; index < sessionCount; index++) {
    const date = addDaysToDateKey(firstSessionDate, index * 7);
    const start = fromTehranWallClock(date, startMinute);
    const session: Interval = {
      start: start.getTime(),
      end: start.getTime() + options.sessionMinutes * MINUTE_MS,
    };

    const bookable = isSlotBookable(start, { ...input, busy: busyAccumulator });

    if (bookable) {
      sessions.push(session);
      busyAccumulator.push(session);
    } else {
      conflicts.push({ index: index + 1, date, start: session });
    }
  }

  return { ok: conflicts.length === 0, sessions, conflicts };
}

export { clampTo, normalize, overlaps, subtract, sliceIntoSlots };
export type { Interval };
