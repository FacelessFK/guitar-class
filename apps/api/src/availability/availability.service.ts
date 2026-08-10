/**
 * پل بین دیتابیس و موتور محاسبه‌ی دسترس‌پذیری.
 *
 * تقسیم کار عمدی است:
 *   • `packages/shared/src/availability.ts` منطق خالص است — بدون I/O،
 *     کامل و ارزان تست‌شده.
 *   • این فایل فقط داده را می‌خواند، شکل می‌دهد، و به موتور می‌سپارد.
 *
 * به همین دلیل این ماژول به هیچ فریم‌ورکی وابسته نیست. وقتی NestJS
 * اضافه شود، فقط یک `@Injectable()` نازک دور همین تابع‌ها می‌پیچد.
 */

import { and, between, eq, gte, inArray, isNull, lte, or } from "drizzle-orm";
import {
  BUSINESS_RULES,
  SLOT_OCCUPYING_STATUSES,
  addDaysToDateKey,
  computeAvailability,
  planPackageSessions,
  type AvailabilityException,
  type AvailabilityRule,
  type DateKey,
  type Interval,
  type PackagePlanResult,
  type Weekday,
} from "@music/shared";

import { db } from "../db/client.js";
import {
  availabilityExceptions,
  availabilityRules,
  bookings,
  offerings,
  teacherProfiles,
} from "../db/schema/index.js";

export interface TeacherScheduleInput {
  /** شناسه‌ی `teacher_profiles`، نه `users` */
  teacherProfileId: string;
  offeringId: string;
  from: DateKey;
  to: DateKey;
  now?: Date;
}

export interface LoadedSchedule {
  rules: AvailabilityRule[];
  exceptions: AvailabilityException[];
  busy: Interval[];
  sessionMinutes: number;
  bufferMinutes: number;
  /** شناسه‌ی `users` استاد — رزروها به این اشاره می‌کنند، نه به پروفایل */
  teacherUserId: string;
  price: bigint;
  commissionRate: string;
}

/**
 * هر چیزی که موتور برای محاسبه لازم دارد را می‌خواند.
 *
 * یک روز حاشیه در دو طرف بازه گرفته می‌شود، چون پنجره‌ی کاری که به وقت
 * تهران تعریف شده می‌تواند در UTC به روز مجاور سرریز کند.
 */
export async function loadSchedule(
  teacherProfileId: string,
  offeringId: string,
  from: DateKey,
  to: DateKey,
): Promise<LoadedSchedule> {
  const scanFrom = addDaysToDateKey(from, -1);
  const scanTo = addDaysToDateKey(to, 1);
  const windowStart = new Date(`${scanFrom}T00:00:00Z`);
  const windowEnd = new Date(`${addDaysToDateKey(scanTo, 1)}T00:00:00Z`);

  const [offeringRows, ruleRows, exceptionRows, bookingRows] = await Promise.all([
    db
      .select({
        durationMinutes: offerings.durationMinutes,
        price: offerings.price,
        bufferMinutes: teacherProfiles.bufferMinutes,
        commissionRate: teacherProfiles.commissionRate,
        teacherUserId: teacherProfiles.userId,
      })
      .from(offerings)
      .innerJoin(teacherProfiles, eq(offerings.teacherId, teacherProfiles.id))
      .where(eq(offerings.id, offeringId))
      .limit(1),

    db
      .select()
      .from(availabilityRules)
      .where(
        and(
          eq(availabilityRules.teacherId, teacherProfileId),
          lte(availabilityRules.validFrom, scanTo),
          or(
            isNull(availabilityRules.validUntil),
            gte(availabilityRules.validUntil, scanFrom),
          ),
        ),
      ),

    db
      .select()
      .from(availabilityExceptions)
      .where(
        and(
          eq(availabilityExceptions.teacherId, teacherProfileId),
          between(availabilityExceptions.date, scanFrom, scanTo),
        ),
      ),

    db
      .select({
        scheduledAt: bookings.scheduledAt,
        endsAt: bookings.endsAt,
      })
      .from(bookings)
      .innerJoin(teacherProfiles, eq(bookings.teacherId, teacherProfiles.userId))
      .where(
        and(
          eq(teacherProfiles.id, teacherProfileId),
          inArray(bookings.status, [...SLOT_OCCUPYING_STATUSES]),
          gte(bookings.scheduledAt, windowStart),
          lte(bookings.scheduledAt, windowEnd),
        ),
      ),
  ]);

  const offering = offeringRows[0];
  if (!offering) {
    throw new Error(`سرویس با شناسه‌ی ${offeringId} پیدا نشد`);
  }

  return {
    sessionMinutes: offering.durationMinutes,
    bufferMinutes: offering.bufferMinutes,
    teacherUserId: offering.teacherUserId,
    price: offering.price,
    commissionRate: offering.commissionRate,
    rules: ruleRows.map((rule) => ({
      weekday: rule.weekday as Weekday,
      startMinute: rule.startMinute,
      endMinute: rule.endMinute,
      // ستون‌های `date` در Drizzle به صورت رشته‌ی `YYYY-MM-DD` برمی‌گردند،
      // که دقیقاً همان قالب `DateKey` است
      validFrom: rule.validFrom,
      validUntil: rule.validUntil,
    })),
    exceptions: exceptionRows.map((exception) => ({
      date: exception.date,
      type: exception.type,
      startMinute: exception.startMinute,
      endMinute: exception.endMinute,
    })),
    busy: bookingRows.map((booking) => ({
      start: booking.scheduledAt.getTime(),
      end: booking.endsAt.getTime(),
    })),
  };
}

/** اسلات‌های قابل رزرو یک استاد برای یک سرویس مشخص. */
export async function getAvailableSlots(input: TeacherScheduleInput): Promise<Interval[]> {
  const schedule = await loadSchedule(
    input.teacherProfileId,
    input.offeringId,
    input.from,
    input.to,
  );

  return computeAvailability({
    rules: schedule.rules,
    exceptions: schedule.exceptions,
    busy: schedule.busy,
    from: input.from,
    to: input.to,
    now: input.now ?? new Date(),
    options: {
      sessionMinutes: schedule.sessionMinutes,
      bufferMinutes: schedule.bufferMinutes,
      minLeadMinutes: BUSINESS_RULES.MIN_LEAD_MINUTES,
    },
  });
}

/** همان محاسبه، ولی با طول ثابت جلسه‌ی معارفه‌ی رایگان. */
export async function getTrialSlots(input: TeacherScheduleInput): Promise<Interval[]> {
  const schedule = await loadSchedule(
    input.teacherProfileId,
    input.offeringId,
    input.from,
    input.to,
  );

  return computeAvailability({
    rules: schedule.rules,
    exceptions: schedule.exceptions,
    busy: schedule.busy,
    from: input.from,
    to: input.to,
    now: input.now ?? new Date(),
    options: {
      sessionMinutes: BUSINESS_RULES.TRIAL_DURATION_MINUTES,
      bufferMinutes: schedule.bufferMinutes,
      minLeadMinutes: BUSINESS_RULES.MIN_LEAD_MINUTES,
    },
  });
}

export interface PackagePreviewInput {
  teacherProfileId: string;
  offeringId: string;
  firstSessionDate: DateKey;
  /** دقیقه از نیمه‌شب، به وقت تهران */
  startMinute: number;
  sessionCount?: number;
  now?: Date;
}

/**
 * پیش‌بینی جلسات پکیج ماهانه، پیش از ساختن رکوردها.
 *
 * اگر `ok` برابر `false` باشد نباید هیچ رزروی ساخته شود — به هنرجو نشان
 * می‌دهیم کدام هفته‌ها آزاد نیستند تا ساعت دیگری انتخاب کند.
 *
 * این فقط پیش‌نمایش است. ضامن نهایی هنگام ثبت واقعی، قید
 * `bookings_no_teacher_overlap` در پستگرس است که کل تراکنش را رول‌بک
 * می‌کند.
 */
export async function previewPackage(
  input: PackagePreviewInput,
): Promise<PackagePlanResult> {
  const sessionCount = input.sessionCount ?? BUSINESS_RULES.PACKAGE_SESSION_COUNT;
  const lastSessionDate = addDaysToDateKey(
    input.firstSessionDate,
    (sessionCount - 1) * 7,
  );

  const schedule = await loadSchedule(
    input.teacherProfileId,
    input.offeringId,
    input.firstSessionDate,
    lastSessionDate,
  );

  return planPackageSessions({
    rules: schedule.rules,
    exceptions: schedule.exceptions,
    busy: schedule.busy,
    now: input.now ?? new Date(),
    options: {
      sessionMinutes: schedule.sessionMinutes,
      bufferMinutes: schedule.bufferMinutes,
      minLeadMinutes: BUSINESS_RULES.MIN_LEAD_MINUTES,
    },
    firstSessionDate: input.firstSessionDate,
    startMinute: input.startMinute,
    sessionCount,
  });
}
