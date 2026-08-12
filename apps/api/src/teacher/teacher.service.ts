/**
 * پنل استاد — پروفایل و نوشتنِ برنامه‌ی دسترس‌پذیری.
 *
 * قاعده‌ی کل این ماژول: **`teacherProfileId` هرگز از کلاینت گرفته
 * نمی‌شود.** هر تابع شناسه‌ی کاربرِ نشست را می‌گیرد و پروفایل را خودش
 * پیدا می‌کند. اگر شناسه‌ی پروفایل ورودی بود، هر کاربر واردشده‌ای
 * می‌توانست برنامه‌ی هر استادی را عوض کند — و چون قوانین دسترس‌پذیری
 * مستقیماً تعیین می‌کنند چه ساعتی قابل فروش است، این یعنی خرابکاری در
 * درآمد یک نفر دیگر.
 *
 * خواندنِ اسلات‌ها در `availability/` می‌ماند: آن عمومی است و ورودی‌اش
 * شناسه‌ی پروفایل است. این یکی خصوصی است و ورودی‌اش نشست.
 */

import { and, asc, eq, gte, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { SLOT_OCCUPYING_STATUSES, type DateKey, type Weekday } from "@music/shared";

import { db } from "../db/client.js";
import { uniqueViolationConstraint } from "../common/pg-error.js";
import {
  availabilityExceptions,
  availabilityRules,
  bookings,
  instruments,
  offerings,
  teacherProfiles,
} from "../db/schema/index.js";
import {
  AlreadyATeacherError,
  AvailabilityEntryNotFoundError,
  NotATeacherError,
  OverlappingRuleError,
  TeacherSlugTakenError,
} from "./errors.js";

export interface TeacherProfileView {
  profileId: string;
  slug: string;
  headline: string;
  bio: string | null;
  introVideoUrl: string | null;
  yearsExperience: number;
  status: string;
  /** فاصله‌ی اجباری بین دو کلاس پشت‌سرهم، به دقیقه */
  bufferMinutes: number;
  offerings: Array<{
    id: string;
    instrumentSlug: string;
    instrumentName: string;
    /** ریال، به صورت رشته چون از `bigint` می‌آید */
    price: string;
    durationMinutes: number;
    isActive: boolean;
  }>;
}

/**
 * شناسه‌ی پروفایل استاد از روی شناسه‌ی کاربر.
 *
 * `null` برنمی‌گرداند و خطا می‌دهد: هر صدازننده‌ای در این ماژول بدون
 * پروفایل کاری ندارد که انجام دهد، و `null` فقط بررسی تکراری در چند جا
 * می‌ساخت که یک بار فراموش کردنش یعنی نوشتن روی برنامه‌ی `undefined`.
 */
export async function requireTeacherProfileId(userId: string): Promise<string> {
  const [row] = await db
    .select({ id: teacherProfiles.id })
    .from(teacherProfiles)
    .where(eq(teacherProfiles.userId, userId))
    .limit(1);

  if (!row) throw new NotATeacherError();

  return row.id;
}

/**
 * شناسه‌ی پروفایل، یا `null` اگر کاربر استاد نباشد.
 * فقط برای `auth/me` که «استاد نیستی» برایش خطا نیست، یک واقعیت است.
 */
export async function findTeacherProfileId(userId: string): Promise<string | null> {
  const [row] = await db
    .select({ id: teacherProfiles.id })
    .from(teacherProfiles)
    .where(eq(teacherProfiles.userId, userId))
    .limit(1);

  return row?.id ?? null;
}

/** پروفایل استاد و سرویس‌هایش، برای صفحه‌ی اصلی پنل. */
export async function getTeacherProfile(userId: string): Promise<TeacherProfileView> {
  const [profile] = await db
    .select({
      profileId: teacherProfiles.id,
      slug: teacherProfiles.slug,
      headline: teacherProfiles.headline,
      bio: teacherProfiles.bio,
      introVideoUrl: teacherProfiles.introVideoUrl,
      yearsExperience: teacherProfiles.yearsExperience,
      status: teacherProfiles.status,
      bufferMinutes: teacherProfiles.bufferMinutes,
    })
    .from(teacherProfiles)
    .where(eq(teacherProfiles.userId, userId))
    .limit(1);

  if (!profile) throw new NotATeacherError();

  const rows = await db
    .select({
      id: offerings.id,
      price: offerings.price,
      durationMinutes: offerings.durationMinutes,
      isActive: offerings.isActive,
      instrumentSlug: instruments.slug,
      instrumentName: instruments.nameFa,
    })
    .from(offerings)
    .innerJoin(instruments, eq(offerings.instrumentId, instruments.id))
    .where(eq(offerings.teacherId, profile.profileId))
    .orderBy(asc(instruments.nameFa));

  return {
    ...profile,
    offerings: rows.map((row) => ({
      id: row.id,
      instrumentSlug: row.instrumentSlug,
      instrumentName: row.instrumentName,
      price: row.price.toString(),
      durationMinutes: row.durationMinutes,
      isActive: row.isActive,
    })),
  };
}

// ---------------------------------------------------------------------------
// استاد شدن و ویرایش پروفایل
// ---------------------------------------------------------------------------

export interface ApplyAsTeacherInput {
  headline: string;
  bio: string | null;
  yearsExperience: number;
  introVideoUrl: string | null;
  /** `null` یعنی خودمان یکی بسازیم */
  slug: string | null;
}

/**
 * درخواست استاد شدن.
 *
 * پروفایل با وضعیت `PENDING` ساخته می‌شود و **هیچ‌کدام** از فیلدهای
 * تجاری از کلاینت گرفته نمی‌شوند: `commissionRate` و `status` و
 * `offerings` مال ادمین‌اند. اگر درصد کمیسیون در همین بدنه می‌آمد، هر
 * متقاضی می‌توانست سهم پلتفرم را صفر بگذارد.
 *
 * به همین دلیل درخواست‌دهنده هنوز نمی‌تواند چیزی بفروشد: تا وقتی ادمین
 * تأیید نکند و برایش offering نسازد، در `GET /teachers` نمی‌آید و هیچ
 * اسلاتی قابل رزرو نیست.
 */
export async function applyAsTeacher(
  userId: string,
  input: ApplyAsTeacherInput,
): Promise<TeacherProfileView> {
  const [existing] = await db
    .select({ status: teacherProfiles.status })
    .from(teacherProfiles)
    .where(eq(teacherProfiles.userId, userId))
    .limit(1);

  if (existing) throw new AlreadyATeacherError(existing.status);

  try {
    await db.insert(teacherProfiles).values({
      userId,
      slug: input.slug ?? generateTeacherSlug(),
      headline: input.headline,
      bio: input.bio,
      yearsExperience: input.yearsExperience,
      introVideoUrl: input.introVideoUrl,
      status: "PENDING",
    });
  } catch (error) {
    throw translateProfileConflict(error);
  }

  return getTeacherProfile(userId);
}

/**
 * نشانی پیش‌فرض صفحه‌ی عمومی.
 *
 * از روی نام ساخته نمی‌شود چون نام‌ها فارسی‌اند و آوانگاری فارسی به
 * لاتین یک منبع بی‌پایان اختلاف است («رضایی» یا «rezaee» یا «rezai»؟).
 * نشانیِ تصادفی زشت ولی درست است، و هم استاد و هم ادمین می‌توانند
 * بعداً عوضش کنند — که کار درستی هم هست، چون تا آن موقع صفحه هنوز
 * منتشر نشده و هیچ لینکی به این نشانی وجود ندارد.
 */
function generateTeacherSlug(): string {
  return `teacher-${crypto.randomUUID().slice(0, 8)}`;
}

export interface UpdateTeacherProfileInput {
  headline?: string;
  bio?: string | null;
  yearsExperience?: number;
  introVideoUrl?: string | null;
  slug?: string;
}

/**
 * ویرایش پروفایل توسط خودِ استاد.
 *
 * ویدیوی معارفه اینجاست چون سند معماری آن را مؤثرترین عامل روی نرخ
 * تبدیل می‌داند و تا امروز هیچ راهی برای گذاشتنش نبود.
 *
 * `status` و `commissionRate` و `bufferMinutes` عمداً بیرون‌اند: اولی
 * یعنی استاد خودش را تأیید کند، دومی یعنی سهم پلتفرم را خودش تعیین
 * کند. سومی مال ادمین است چون روی برنامه‌ی فروش اثر می‌گذارد و
 * پنل استاد اصلاً نشانش نمی‌دهد.
 *
 * ویرایش وضعیت را عوض نمی‌کند: استادِ تأییدشده با عوض کردن متن معرفی
 * دوباره به صف بررسی نمی‌رود. اگر روزی محتوای پروفایل نیاز به بازبینی
 * داشت، جایش یک صف جدا است نه برگرداندن به `PENDING` که فروش فعالش
 * را قطع می‌کند.
 */
export async function updateTeacherProfile(
  userId: string,
  input: UpdateTeacherProfileInput,
): Promise<TeacherProfileView> {
  const teacherId = await requireTeacherProfileId(userId);

  // بدنه‌ی خالی به `UPDATE ... SET` بدون ستون تبدیل می‌شود که خطای
  // نحوی پستگرس است؛ خواندنِ ساده جواب درست‌تری است
  if (Object.keys(input).length === 0) return getTeacherProfile(userId);

  try {
    await db
      .update(teacherProfiles)
      .set(input)
      .where(eq(teacherProfiles.id, teacherId));
  } catch (error) {
    throw translateProfileConflict(error);
  }

  return getTeacherProfile(userId);
}

/** تنها تعارضی که در این مسیرها ممکن است، نشانی تکراری است. */
function translateProfileConflict(error: unknown): unknown {
  const constraint = uniqueViolationConstraint(error);

  if (constraint === "teacher_profiles_slug_unique") return new TeacherSlugTakenError();
  if (constraint === "teacher_profiles_user_id_unique") {
    // مسابقه‌ی دو درخواست هم‌زمانِ همان کاربر — دکمه دو بار خورده
    return new AlreadyATeacherError("PENDING");
  }

  return error;
}

// ---------------------------------------------------------------------------
// قوانین هفتگی
// ---------------------------------------------------------------------------

export interface RuleView {
  id: string;
  /** شنبه = ۰ ... جمعه = ۶ */
  weekday: number;
  startMinute: number;
  endMinute: number;
  validFrom: DateKey;
  validUntil: DateKey | null;
}

export interface ExceptionView {
  id: string;
  date: DateKey;
  type: "BLOCK" | "EXTRA";
  /** `null` در هر دو یعنی کل روز */
  startMinute: number | null;
  endMinute: number | null;
  reason: string | null;
}

/**
 * کل برنامه‌ی استاد: قوانین هفتگی و استثناها.
 *
 * هر دو با هم برمی‌گردند چون صفحه‌ی «برنامه‌ی من» هر دو را کنار هم
 * نشان می‌دهد و جدا کردنشان فقط یک رفت‌وبرگشت اضافه می‌سازد.
 *
 * استثناهای گذشته فیلتر می‌شوند: «سه ماه پیش پنج‌شنبه نبودم» دیگر
 * تصمیمی را عوض نمی‌کند و فقط فهرست را شلوغ می‌کند. قوانین برعکس،
 * حتی با `validFrom` قدیمی هنوز فعال‌اند.
 */
export async function getSchedule(
  userId: string,
  today: DateKey,
): Promise<{ rules: RuleView[]; exceptions: ExceptionView[] }> {
  const teacherId = await requireTeacherProfileId(userId);

  const [ruleRows, exceptionRows] = await Promise.all([
    db
      .select()
      .from(availabilityRules)
      .where(eq(availabilityRules.teacherId, teacherId))
      .orderBy(asc(availabilityRules.weekday), asc(availabilityRules.startMinute)),

    db
      .select()
      .from(availabilityExceptions)
      .where(
        and(
          eq(availabilityExceptions.teacherId, teacherId),
          gte(availabilityExceptions.date, today),
        ),
      )
      .orderBy(asc(availabilityExceptions.date)),
  ]);

  return {
    rules: ruleRows.map((row) => ({
      id: row.id,
      weekday: row.weekday,
      startMinute: row.startMinute,
      endMinute: row.endMinute,
      validFrom: row.validFrom,
      validUntil: row.validUntil,
    })),
    exceptions: exceptionRows.map((row) => ({
      id: row.id,
      date: row.date,
      type: row.type,
      startMinute: row.startMinute,
      endMinute: row.endMinute,
      reason: row.reason,
    })),
  };
}

export interface CreateRuleInput {
  weekday: Weekday;
  startMinute: number;
  endMinute: number;
  validFrom: DateKey;
  validUntil: DateKey | null;
}

/**
 * افزودن یک پنجره‌ی هفتگی.
 *
 * قیدهای «۰ تا ۶» و «شروع < پایان» در دیتابیس هم هستند، ولی اعتبارسنجی
 * Zod در کنترلر پیش از رسیدن به اینجا همان را با پیام فارسی رد می‌کند.
 * قید دیتابیس برای مسیرهای دیگر (سید، مایگریشن، اسکریپت) می‌ماند.
 */
export async function createRule(
  userId: string,
  input: CreateRuleInput,
): Promise<RuleView> {
  const teacherId = await requireTeacherProfileId(userId);

  await assertNoOverlappingRule(teacherId, input);

  const [created] = await db
    .insert(availabilityRules)
    .values({
      teacherId,
      weekday: input.weekday,
      startMinute: input.startMinute,
      endMinute: input.endMinute,
      validFrom: input.validFrom,
      validUntil: input.validUntil,
    })
    .returning();

  const row = created!;

  return {
    id: row.id,
    weekday: row.weekday,
    startMinute: row.startMinute,
    endMinute: row.endMinute,
    validFrom: row.validFrom,
    validUntil: row.validUntil,
  };
}

/**
 * هم‌پوشانی با قانون موجود روی همان روز هفته.
 *
 * دو قانون فقط وقتی با هم برخورد دارند که **هم** بازه‌ی ساعتشان و
 * **هم** بازه‌ی اعتبارشان هم‌پوشانی داشته باشد. «شنبه‌های ۱۶ تا ۲۰ تا
 * پایان شهریور» و «شنبه‌های ۱۶ تا ۲۰ از مهر» با هم مشکلی ندارند.
 *
 * مقایسه‌ی تاریخ‌ها رشته‌ای است و درست کار می‌کند چون قالب `YYYY-MM-DD`
 * ترتیب لغوی و ترتیب زمانی یکسانی دارد. `validUntil` تهی یعنی بی‌نهایت.
 */
async function assertNoOverlappingRule(
  teacherId: string,
  input: CreateRuleInput,
): Promise<void> {
  const conflicts = await db
    .select({ id: availabilityRules.id })
    .from(availabilityRules)
    .where(
      and(
        eq(availabilityRules.teacherId, teacherId),
        eq(availabilityRules.weekday, input.weekday),
        // بازه‌ی ساعت: نیم‌باز، پس چسبیدن (۱۶–۱۸ و ۱۸–۲۰) هم‌پوشانی نیست
        sql`${availabilityRules.startMinute} < ${input.endMinute}`,
        sql`${availabilityRules.endMinute} > ${input.startMinute}`,
        // بازه‌ی اعتبار
        input.validUntil === null
          ? undefined
          : lte(availabilityRules.validFrom, input.validUntil),
        or(
          isNull(availabilityRules.validUntil),
          gte(availabilityRules.validUntil, input.validFrom),
        ),
      ),
    )
    .limit(1);

  if (conflicts.length > 0) throw new OverlappingRuleError();
}

/**
 * حذف یک پنجره‌ی هفتگی.
 *
 * **جلسات فروخته‌شده در آن ساعت لغو نمی‌شوند.** برنامه‌ی دسترس‌پذیری
 * می‌گوید چه چیزی *قابل فروش* است؛ چه چیزی *فروخته شده* در جدول رزروها
 * است و آن‌جا هم می‌ماند. حذف قانون فقط جلوی رزروهای تازه را می‌گیرد.
 *
 * تعداد جلسات آینده‌ی متأثر برمی‌گردد تا پنل بتواند صریح بگوید «۳ کلاس
 * رزروشده در این بازه سر جایشان می‌مانند» — وگرنه استاد فرض می‌کند
 * برنامه‌اش پاک شده و سر کلاس نمی‌آید.
 */
export async function deleteRule(
  userId: string,
  ruleId: string,
  now: Date = new Date(),
): Promise<{ affectedBookings: number }> {
  const teacherId = await requireTeacherProfileId(userId);

  const [rule] = await db
    .select()
    .from(availabilityRules)
    .where(
      and(eq(availabilityRules.id, ruleId), eq(availabilityRules.teacherId, teacherId)),
    )
    .limit(1);

  if (!rule) throw new AvailabilityEntryNotFoundError();

  const affected = await countFutureBookingsInRule(teacherId, rule, now);

  await db.delete(availabilityRules).where(eq(availabilityRules.id, ruleId));

  return { affectedBookings: affected };
}

/**
 * جلسات آینده‌ای که در پنجره‌ی این قانون می‌افتند.
 *
 * فیلترِ روز هفته و ساعت با حساب روی `scheduled_at` انجام می‌شود، نه با
 * خواندن همه‌ی رزروها در جاوااسکریپت: آفست ثابت +۰۳:۳۰ ایران این را به
 * یک عبارت ساده تبدیل می‌کند. عدد فقط برای پیام هشدار است، پس تقریب
 * «شروع جلسه داخل بازه است» کافی است.
 */
async function countFutureBookingsInRule(
  teacherId: string,
  rule: { weekday: number; startMinute: number; endMinute: number },
  now: Date,
): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(bookings)
    .innerJoin(teacherProfiles, eq(bookings.teacherId, teacherProfiles.userId))
    .where(
      and(
        eq(teacherProfiles.id, teacherId),
        inArray(bookings.status, [...SLOT_OCCUPYING_STATUSES]),
        gte(bookings.scheduledAt, now),
        // شنبه = ۰: پستگرس `dow` یکشنبه = ۰ می‌دهد، پس یک واحد می‌چرخد
        sql`((EXTRACT(DOW FROM ${bookings.scheduledAt} AT TIME ZONE 'Asia/Tehran')::int + 1) % 7) = ${rule.weekday}`,
        sql`(EXTRACT(HOUR FROM ${bookings.scheduledAt} AT TIME ZONE 'Asia/Tehran')::int * 60
             + EXTRACT(MINUTE FROM ${bookings.scheduledAt} AT TIME ZONE 'Asia/Tehran')::int)
            BETWEEN ${rule.startMinute} AND ${rule.endMinute - 1}`,
      ),
    );

  return row?.count ?? 0;
}

// ---------------------------------------------------------------------------
// استثناها
// ---------------------------------------------------------------------------

export interface CreateExceptionInput {
  date: DateKey;
  type: "BLOCK" | "EXTRA";
  startMinute: number | null;
  endMinute: number | null;
  reason: string | null;
}

/**
 * افزودن استثنای یک‌روزه.
 *
 * `EXTRA` بدون ساعت پذیرفته نمی‌شود — «کل این روز آزادم» یعنی چه؟ اگر
 * استاد واقعاً همیشه آن روز آزاد است، جایش قانون هفتگی است. قید
 * `availability_exceptions_extra_needs_time` در دیتابیس هم همین را
 * می‌گوید؛ اینجا با پیام فارسی جلویش گرفته می‌شود.
 */
export async function createException(
  userId: string,
  input: CreateExceptionInput,
): Promise<ExceptionView> {
  const teacherId = await requireTeacherProfileId(userId);

  const [created] = await db
    .insert(availabilityExceptions)
    .values({
      teacherId,
      date: input.date,
      type: input.type,
      startMinute: input.startMinute,
      endMinute: input.endMinute,
      reason: input.reason,
    })
    .returning();

  const row = created!;

  return {
    id: row.id,
    date: row.date,
    type: row.type,
    startMinute: row.startMinute,
    endMinute: row.endMinute,
    reason: row.reason,
  };
}

export async function deleteException(userId: string, exceptionId: string): Promise<void> {
  const teacherId = await requireTeacherProfileId(userId);

  const deleted = await db
    .delete(availabilityExceptions)
    .where(
      and(
        eq(availabilityExceptions.id, exceptionId),
        eq(availabilityExceptions.teacherId, teacherId),
      ),
    )
    .returning({ id: availabilityExceptions.id });

  if (deleted.length === 0) throw new AvailabilityEntryNotFoundError();
}
