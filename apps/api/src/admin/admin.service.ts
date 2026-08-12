/**
 * پنل ادمین — تنها مسیر نوشتنی روی داده‌ی پایه.
 *
 * تا پیش از این، `teacher_profiles` و `offerings` و `instruments` و
 * `payouts` فقط با `db:seed` و `db:studio` قابل تغییر بودند. یعنی تأیید
 * یک استاد، گذاشتن قیمتش، یا ثبت تسویه‌اش هیچ‌کدام از داخل محصول ممکن
 * نبود.
 *
 * دو قاعده در کل این ماژول:
 *
 *   ۱. **دفتر کل هرگز ویرایش نمی‌شود.** تسویه یک سطر تازه‌ی منفی است،
 *      نه دست بردن در سطرهای درآمد.
 *   ۲. **اسنپ‌شات‌ها دست‌نخورده می‌مانند.** عوض کردن قیمت یا درصد
 *      کمیسیون فقط روی فروش‌های بعدی اثر دارد؛ `price_snapshot` و
 *      `commission_snapshot` رزروهای موجود هیچ‌جا در این فایل نوشته
 *      نمی‌شوند.
 */

import { and, asc, count, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";

import { db } from "../db/client.js";
import { uniqueViolationConstraint } from "../common/pg-error.js";
import {
  bookings,
  instruments,
  ledgerEntries,
  offerings,
  orders,
  payouts,
  teacherProfiles,
  users,
} from "../db/schema/index.js";
import { teacherEarningsBreakdown } from "../payment/payment.service.js";
import { pageBounds, type Page, type PageQuery } from "./pagination.js";
import { countOpenReviews, openReviewsForBookings } from "./review.service.js";
import { IN_APP_TYPES, notifyInApp } from "../notification/in-app.service.js";
import { TeacherSlugTakenError } from "../teacher/errors.js";
import {
  AdminRecordNotFoundError,
  InstrumentSlugTakenError,
  OfferingExistsError,
  PayoutExceedsBalanceError,
  PayoutNotPendingError,
} from "./errors.js";

type TeacherStatus = "PENDING" | "APPROVED" | "SUSPENDED";
type SkillLevel = "BEGINNER" | "INTERMEDIATE" | "ADVANCED";

/**
 * سقف هر فهرست، برای فهرست‌هایی که با **اندازه‌ی کاتالوگ** بزرگ می‌شوند
 * نه با حجم استفاده: سازها و استادها. تعدادشان از مرتبه‌ی ده‌هاست و
 * ادمین معمولاً همه را با هم می‌خواهد.
 *
 * فهرست‌هایی که با هر رزرو و هر پرداخت رشد می‌کنند صفحه‌بندی واقعی
 * دارند — `paginate` را ببینید.
 */
const LIST_LIMIT = 200;


// ---------------------------------------------------------------------------
// استادها
// ---------------------------------------------------------------------------

export interface AdminTeacherRow {
  profileId: string;
  userId: string;
  fullName: string;
  phone: string;
  slug: string;
  headline: string;
  status: TeacherStatus;
  commissionRate: string;
  yearsExperience: number;
  offeringCount: number;
  createdAt: string;
}

/**
 * فهرست استادها، اختیاراً محدود به یک وضعیت.
 *
 * تعداد سرویس‌ها در همین کوئری می‌آید چون صف تأیید بدون آن ناقص است:
 * استادِ تأییدشده‌ای که هیچ `offering` ندارد در فهرست عمومی هم نمی‌آید،
 * و این تنها جایی است که می‌شود دیدش.
 */
export async function listTeachers(status?: TeacherStatus): Promise<AdminTeacherRow[]> {
  const rows = await db
    .select({
      profileId: teacherProfiles.id,
      userId: teacherProfiles.userId,
      fullName: users.fullName,
      phone: users.phone,
      slug: teacherProfiles.slug,
      headline: teacherProfiles.headline,
      status: teacherProfiles.status,
      commissionRate: teacherProfiles.commissionRate,
      yearsExperience: teacherProfiles.yearsExperience,
      offeringCount: sql<number>`count(${offerings.id})::int`,
      createdAt: teacherProfiles.createdAt,
    })
    .from(teacherProfiles)
    .innerJoin(users, eq(teacherProfiles.userId, users.id))
    .leftJoin(offerings, eq(offerings.teacherId, teacherProfiles.id))
    .where(status ? eq(teacherProfiles.status, status) : undefined)
    .groupBy(teacherProfiles.id, users.id)
    // در انتظارها اول: صف تأیید همان چیزی است که این صفحه برایش باز می‌شود
    .orderBy(
      sql`CASE ${teacherProfiles.status} WHEN 'PENDING' THEN 0 WHEN 'APPROVED' THEN 1 ELSE 2 END`,
      desc(teacherProfiles.createdAt),
    )
    .limit(LIST_LIMIT);

  return rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() }));
}

export interface AdminTeacherDetail extends AdminTeacherRow {
  bio: string | null;
  introVideoUrl: string | null;
  bufferMinutes: number;
  offerings: Array<{
    id: string;
    instrumentId: string;
    instrumentName: string;
    instrumentSlug: string;
    price: string;
    durationMinutes: number;
    levels: SkillLevel[];
    isActive: boolean;
  }>;
  balance: {
    gross: string;
    commission: string;
    earned: string;
    paidOut: string;
    outstanding: string;
  };
}

export async function getTeacher(profileId: string): Promise<AdminTeacherDetail> {
  const [profile] = await db
    .select({
      profileId: teacherProfiles.id,
      userId: teacherProfiles.userId,
      fullName: users.fullName,
      phone: users.phone,
      slug: teacherProfiles.slug,
      headline: teacherProfiles.headline,
      bio: teacherProfiles.bio,
      introVideoUrl: teacherProfiles.introVideoUrl,
      status: teacherProfiles.status,
      commissionRate: teacherProfiles.commissionRate,
      bufferMinutes: teacherProfiles.bufferMinutes,
      yearsExperience: teacherProfiles.yearsExperience,
      createdAt: teacherProfiles.createdAt,
    })
    .from(teacherProfiles)
    .innerJoin(users, eq(teacherProfiles.userId, users.id))
    .where(eq(teacherProfiles.id, profileId))
    .limit(1);

  if (!profile) throw new AdminRecordNotFoundError("استاد");

  const [offeringRows, balance] = await Promise.all([
    db
      .select({
        id: offerings.id,
        instrumentId: offerings.instrumentId,
        instrumentName: instruments.nameFa,
        instrumentSlug: instruments.slug,
        price: offerings.price,
        durationMinutes: offerings.durationMinutes,
        levels: offerings.levels,
        isActive: offerings.isActive,
      })
      .from(offerings)
      .innerJoin(instruments, eq(offerings.instrumentId, instruments.id))
      .where(eq(offerings.teacherId, profileId))
      .orderBy(asc(instruments.nameFa)),
    teacherEarningsBreakdown(profileId),
  ]);

  return {
    ...profile,
    createdAt: profile.createdAt.toISOString(),
    offeringCount: offeringRows.length,
    offerings: offeringRows.map((row) => ({ ...row, price: row.price.toString() })),
    balance: {
      gross: balance.gross.toString(),
      commission: balance.commission.toString(),
      earned: balance.earned.toString(),
      paidOut: balance.paidOut.toString(),
      outstanding: balance.outstanding.toString(),
    },
  };
}

export interface UpdateTeacherInput {
  status?: TeacherStatus;
  commissionRate?: string;
  bufferMinutes?: number;
  slug?: string;
}

/**
 * فیلدهایی که فقط ادمین می‌تواند عوضشان کند.
 *
 * تأیید و رد هم از همین‌جا می‌گذرد و اندپوینت جدا ندارد: هر سه گذارِ
 * ممکن (تأیید، تعلیق، برگرداندن به انتظار) یک `UPDATE` روی یک ستون‌اند،
 * و سه مسیر جدا فقط سه جای متفاوت برای فراموش کردن یک بررسی می‌سازد.
 *
 * **متن پروفایل اینجا نیست.** آن را خودِ استاد در `PATCH /teacher/me`
 * می‌نویسد. اگر ادمین هم می‌توانست، دو نویسنده روی یک متن می‌داشتیم
 * بدون هیچ نشانه‌ای از اینکه کدامشان آخر نوشته.
 */
export async function updateTeacher(
  profileId: string,
  input: UpdateTeacherInput,
): Promise<AdminTeacherDetail> {
  if (Object.keys(input).length > 0) {
    let updated: { id: string; userId: string; status: TeacherStatus }[];

    try {
      updated = await db
        .update(teacherProfiles)
        .set(input)
        .where(eq(teacherProfiles.id, profileId))
        .returning({
          id: teacherProfiles.id,
          userId: teacherProfiles.userId,
          status: teacherProfiles.status,
        });
    } catch (error) {
      if (uniqueViolationConstraint(error) === "teacher_profiles_slug_unique") {
        throw new TeacherSlugTakenError();
      }
      throw error;
    }

    if (updated.length === 0) throw new AdminRecordNotFoundError("استاد");

    // تغییر وضعیت تنها چیزی است که استاد باید از آن خبردار شود؛ عوض
    // شدن نشانی صفحه یا فاصله‌ی بین کلاس‌ها اعلان لازم ندارد
    if (input.status) {
      await notifyInApp({
        userId: updated[0]!.userId,
        type: IN_APP_TYPES.TEACHER_STATUS_CHANGED,
        message: teacherStatusMessage(updated[0]!.status),
        href: "/teacher",
      });
    }
  }

  return getTeacher(profileId);
}

function teacherStatusMessage(status: TeacherStatus): string {
  switch (status) {
    case "APPROVED":
      return "پروفایل استادی شما تأیید شد. از این پس در فهرست عمومی دیده می‌شوید.";
    case "SUSPENDED":
      return "پروفایل استادی شما فعلاً از فهرست عمومی برداشته شد.";
    case "PENDING":
      return "پروفایل استادی شما دوباره در صف بررسی قرار گرفت.";
  }
}

// ---------------------------------------------------------------------------
// سازها
// ---------------------------------------------------------------------------

export interface AdminInstrumentRow {
  id: string;
  slug: string;
  nameFa: string;
  descriptionFa: string | null;
  iconUrl: string | null;
  sortOrder: number;
  isActive: boolean;
  /** سرویس‌های فعالی که به این ساز وصل‌اند */
  offeringCount: number;
}

/** برخلاف کاتالوگ عمومی، سازهای غیرفعال هم می‌آیند. */
export async function listInstruments(): Promise<AdminInstrumentRow[]> {
  return db
    .select({
      id: instruments.id,
      slug: instruments.slug,
      nameFa: instruments.nameFa,
      descriptionFa: instruments.descriptionFa,
      iconUrl: instruments.iconUrl,
      sortOrder: instruments.sortOrder,
      isActive: instruments.isActive,
      offeringCount: sql<number>`count(${offerings.id})::int`,
    })
    .from(instruments)
    .leftJoin(offerings, eq(offerings.instrumentId, instruments.id))
    .groupBy(instruments.id)
    .orderBy(asc(instruments.sortOrder), asc(instruments.nameFa));
}

export interface CreateInstrumentInput {
  slug: string;
  nameFa: string;
  descriptionFa: string | null;
  iconUrl: string | null;
  sortOrder: number;
}

/**
 * ساز تازه.
 *
 * ⚠️ `description_fa` متنی است که صفحه‌ی `/instruments/[slug]` نشان
 * می‌دهد و همان چیزی است که گوگل ایندکس می‌کند — سند معماری این صفحات
 * را موتور اصلی سئو می‌داند. سازی که با توضیح خالی ساخته شود، یک صفحه‌ی
 * کم‌ارزش منتشر می‌کند.
 */
export async function createInstrument(
  input: CreateInstrumentInput,
): Promise<AdminInstrumentRow> {
  let created: { id: string }[];

  try {
    created = await db.insert(instruments).values(input).returning({ id: instruments.id });
  } catch (error) {
    if (uniqueViolationConstraint(error) === "instruments_slug_unique") {
      throw new InstrumentSlugTakenError();
    }
    throw error;
  }

  return requireInstrument(created[0]!.id);
}

export interface UpdateInstrumentInput {
  slug?: string;
  nameFa?: string;
  descriptionFa?: string | null;
  iconUrl?: string | null;
  sortOrder?: number;
  isActive?: boolean;
}

export async function updateInstrument(
  instrumentId: string,
  input: UpdateInstrumentInput,
): Promise<AdminInstrumentRow> {
  if (Object.keys(input).length > 0) {
    let updated: { id: string }[];

    try {
      updated = await db
        .update(instruments)
        .set(input)
        .where(eq(instruments.id, instrumentId))
        .returning({ id: instruments.id });
    } catch (error) {
      if (uniqueViolationConstraint(error) === "instruments_slug_unique") {
        throw new InstrumentSlugTakenError();
      }
      throw error;
    }

    if (updated.length === 0) throw new AdminRecordNotFoundError("ساز");
  }

  return requireInstrument(instrumentId);
}

async function requireInstrument(instrumentId: string): Promise<AdminInstrumentRow> {
  const rows = await listInstruments();
  const found = rows.find((row) => row.id === instrumentId);

  if (!found) throw new AdminRecordNotFoundError("ساز");

  return found;
}

// ---------------------------------------------------------------------------
// سرویس‌ها (offerings)
// ---------------------------------------------------------------------------

export interface CreateOfferingInput {
  instrumentId: string;
  /** ریال */
  price: bigint;
  durationMinutes: number;
  levels: SkillLevel[];
}

/**
 * سرویس تازه برای یک استاد.
 *
 * قیمت روی جفتِ (استاد، ساز) می‌نشیند نه روی استاد — یک نفر ممکن است
 * گیتار را با قیمتی و تئوری موسیقی را با قیمت دیگری تدریس کند.
 */
export async function createOffering(
  profileId: string,
  input: CreateOfferingInput,
): Promise<AdminTeacherDetail> {
  await assertTeacherExists(profileId);
  await assertInstrumentExists(input.instrumentId);

  try {
    await db.insert(offerings).values({
      teacherId: profileId,
      instrumentId: input.instrumentId,
      price: input.price,
      durationMinutes: input.durationMinutes,
      levels: input.levels,
    });
  } catch (error) {
    if (uniqueViolationConstraint(error) === "offerings_teacher_instrument_unique") {
      throw new OfferingExistsError();
    }
    throw error;
  }

  return getTeacher(profileId);
}

export interface UpdateOfferingInput {
  price?: bigint;
  durationMinutes?: number;
  levels?: SkillLevel[];
  isActive?: boolean;
}

/**
 * ویرایش سرویس.
 *
 * تغییر قیمت **روی رزروهای فروخته‌شده اثر ندارد** و قرار هم نیست داشته
 * باشد: هر رزرو `price_snapshot` خودش را دارد و همان مبنای تسویه است.
 * غیرفعال کردن هم فقط جلوی فروش تازه را می‌گیرد؛ کلاس‌های رزروشده سر
 * جایشان می‌مانند.
 */
export async function updateOffering(
  offeringId: string,
  input: UpdateOfferingInput,
): Promise<AdminTeacherDetail> {
  const [existing] = await db
    .select({ teacherId: offerings.teacherId })
    .from(offerings)
    .where(eq(offerings.id, offeringId))
    .limit(1);

  if (!existing) throw new AdminRecordNotFoundError("سرویس");

  if (Object.keys(input).length > 0) {
    await db.update(offerings).set(input).where(eq(offerings.id, offeringId));
  }

  return getTeacher(existing.teacherId);
}

// ---------------------------------------------------------------------------
// رزروها و سفارش‌ها
// ---------------------------------------------------------------------------

export interface AdminBookingFilter {
  status?: string[];
  teacherProfileId?: string;
  /** `YYYY-MM-DD`، به وقت تهران؛ روی `scheduled_at` اعمال می‌شود */
  from?: string;
  to?: string;
}

export interface AdminBookingRow {
  id: string;
  type: string;
  status: string;
  scheduledAt: string;
  endsAt: string;
  durationMinutes: number;
  price: string;
  commissionRate: string;
  studentName: string;
  studentPhone: string;
  teacherName: string;
  teacherProfileId: string | null;
  instrumentName: string;
  enrollmentId: string | null;
  sessionIndex: number | null;
  teacherJoinedAt: string | null;
  studentJoinedAt: string | null;
  /**
   * پرونده‌ی بررسیِ بازِ این جلسه، اگر داشته باشد.
   *
   * فهرست رزروها جای رسیدگی نیست — صف بررسی جای خودش را دارد — ولی
   * ادمینی که اینجا روی «عدم حضور استاد» فیلتر کرده باید بتواند از
   * همین‌جا برود سراغ پرونده، نه اینکه در فهرستی دیگر دنبالش بگردد.
   */
  openReviewId: string | null;
}

/**
 * فهرست رزروها برای ادمین.
 *
 * `teacher_profiles` با `LEFT JOIN` می‌آید چون `bookings.teacher_id` به
 * `users.id` اشاره می‌کند نه به پروفایل — کاربری که پروفایل استادش حذف
 * شده باشد نباید رزروهایش از گزارش بیفتد.
 *
 * فیلتر تاریخ روی مرز روزِ تهران بسته می‌شود، نه UTC: ادمین «رزروهای
 * امروز» می‌خواهد و امروزِ تهران سه‌ونیم ساعت با UTC فرق دارد.
 */
export async function listBookings(
  filter: AdminBookingFilter & PageQuery,
): Promise<Page<AdminBookingRow>> {
  const { limit, offset } = pageBounds(filter);

  const teacherUsers = db
    .select({
      userId: teacherProfiles.userId,
      profileId: teacherProfiles.id,
    })
    .from(teacherProfiles)
    .as("teacher_users");

  const student = db
    .select({ id: users.id, fullName: users.fullName, phone: users.phone })
    .from(users)
    .as("student");

  const teacher = db
    .select({ id: users.id, fullName: users.fullName })
    .from(users)
    .as("teacher");

  /**
   * شرط یک بار ساخته می‌شود و هم به فهرست می‌رود هم به شمارش.
   *
   * نوشتنش دو بار یعنی اولین فیلتری که فقط در یکی اضافه شود، `total` را
   * با صفحه‌ها ناسازگار کند — و آن خرابی خودش را به شکل «صفحه‌ی آخر خالی
   * است» نشان می‌دهد، که شبیه هیچ باگی نیست.
   */
  const where = and(
    filter.status?.length ? inArray(bookings.status, filter.status as never) : undefined,
    filter.teacherProfileId
      ? eq(teacherUsers.profileId, filter.teacherProfileId)
      : undefined,
    filter.from ? gte(bookings.scheduledAt, tehranDayStart(filter.from)) : undefined,
    filter.to ? lte(bookings.scheduledAt, tehranDayEnd(filter.to)) : undefined,
  );

  const rows = await db
    .select({
      id: bookings.id,
      type: bookings.type,
      status: bookings.status,
      scheduledAt: bookings.scheduledAt,
      endsAt: bookings.endsAt,
      durationMinutes: bookings.durationMinutes,
      price: bookings.priceSnapshot,
      commissionRate: bookings.commissionSnapshot,
      studentName: student.fullName,
      studentPhone: student.phone,
      teacherName: teacher.fullName,
      teacherProfileId: teacherUsers.profileId,
      instrumentName: instruments.nameFa,
      enrollmentId: bookings.enrollmentId,
      sessionIndex: bookings.sessionIndex,
      teacherJoinedAt: bookings.teacherJoinedAt,
      studentJoinedAt: bookings.studentJoinedAt,
    })
    .from(bookings)
    .innerJoin(student, eq(bookings.studentId, student.id))
    .innerJoin(teacher, eq(bookings.teacherId, teacher.id))
    .leftJoin(teacherUsers, eq(bookings.teacherId, teacherUsers.userId))
    .innerJoin(offerings, eq(bookings.offeringId, offerings.id))
    .innerJoin(instruments, eq(offerings.instrumentId, instruments.id))
    .where(where)
    .orderBy(desc(bookings.scheduledAt))
    .limit(limit)
    .offset(offset);

  const [total, openReviews] = await Promise.all([
    countRows(
      db
        .select({ value: count() })
        .from(bookings)
        .leftJoin(teacherUsers, eq(bookings.teacherId, teacherUsers.userId))
        .where(where),
    ),
    openReviewsForBookings(rows.map((row) => row.id)),
  ]);

  return {
    rows: rows.map((row) => ({
      ...row,
      scheduledAt: row.scheduledAt.toISOString(),
      endsAt: row.endsAt.toISOString(),
      price: row.price.toString(),
      teacherJoinedAt: row.teacherJoinedAt?.toISOString() ?? null,
      studentJoinedAt: row.studentJoinedAt?.toISOString() ?? null,
      openReviewId: openReviews.get(row.id) ?? null,
    })),
    total,
    limit,
    offset,
  };
}

/**
 * لحظه‌ی آغاز و پایان یک روزِ تهران، به UTC.
 *
 * آفست ثابت `+03:30` است — ایران از ۱۴۰۱ ساعت تابستانی ندارد و همین
 * ساده‌سازی در کل پروژه فرض گرفته شده.
 */
const TEHRAN_OFFSET = "+03:30";

function tehranDayStart(dateKey: string): Date {
  return new Date(`${dateKey}T00:00:00.000${TEHRAN_OFFSET}`);
}

function tehranDayEnd(dateKey: string): Date {
  return new Date(`${dateKey}T23:59:59.999${TEHRAN_OFFSET}`);
}

export interface AdminOrderRow {
  id: string;
  amount: string;
  status: string;
  gateway: string;
  refId: string | null;
  paidAt: string | null;
  createdAt: string;
  studentName: string;
  studentPhone: string;
}

export async function listOrders(
  query: { status?: string } & PageQuery = {},
): Promise<Page<AdminOrderRow>> {
  const { limit, offset } = pageBounds(query);
  const where = query.status ? eq(orders.status, query.status as never) : undefined;

  const [rows, total] = await Promise.all([
    db
      .select({
        id: orders.id,
        amount: orders.amount,
        status: orders.status,
        gateway: orders.gateway,
        refId: orders.gatewayRefId,
        paidAt: orders.paidAt,
        createdAt: orders.createdAt,
        studentName: users.fullName,
        studentPhone: users.phone,
      })
      .from(orders)
      .innerJoin(users, eq(orders.studentId, users.id))
      .where(where)
      .orderBy(desc(orders.createdAt))
      .limit(limit)
      .offset(offset),
    countRows(db.select({ value: count() }).from(orders).where(where)),
  ]);

  return {
    rows: rows.map((row) => ({
      ...row,
      amount: row.amount.toString(),
      paidAt: row.paidAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    })),
    total,
    limit,
    offset,
  };
}

// ---------------------------------------------------------------------------
// تسویه
// ---------------------------------------------------------------------------

export interface AdminPayoutRow {
  id: string;
  teacherProfileId: string;
  teacherName: string;
  periodStart: string;
  periodEnd: string;
  amount: string;
  status: string;
  paidAt: string | null;
  trackingCode: string | null;
  note: string | null;
  createdAt: string;
}

/** یک کوئری، هم برای فهرست و هم برای خواندنِ تکی. */
function payoutQuery() {
  return db
    .select({
      id: payouts.id,
      teacherProfileId: payouts.teacherId,
      teacherName: users.fullName,
      periodStart: payouts.periodStart,
      periodEnd: payouts.periodEnd,
      amount: payouts.amount,
      status: payouts.status,
      paidAt: payouts.paidAt,
      trackingCode: payouts.trackingCode,
      note: payouts.note,
      createdAt: payouts.createdAt,
    })
    .from(payouts)
    .innerJoin(teacherProfiles, eq(payouts.teacherId, teacherProfiles.id))
    .innerJoin(users, eq(teacherProfiles.userId, users.id));
}

type PayoutQueryRow = Awaited<ReturnType<typeof payoutQuery>>[number];

function toPayoutRow(row: PayoutQueryRow): AdminPayoutRow {
  return {
    ...row,
    amount: row.amount.toString(),
    paidAt: row.paidAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function listPayouts(
  query: { teacherProfileId?: string } & PageQuery = {},
): Promise<Page<AdminPayoutRow>> {
  const { limit, offset } = pageBounds(query);
  const where = query.teacherProfileId
    ? eq(payouts.teacherId, query.teacherProfileId)
    : undefined;

  const [rows, total] = await Promise.all([
    payoutQuery().where(where).orderBy(desc(payouts.createdAt)).limit(limit).offset(offset),
    countRows(db.select({ value: count() }).from(payouts).where(where)),
  ]);

  return { rows: rows.map(toPayoutRow), total, limit, offset };
}

export interface CreatePayoutInput {
  teacherProfileId: string;
  periodStart: string;
  periodEnd: string;
  amount: bigint;
  note: string | null;
}

/**
 * ثبت یک تسویه — در وضعیت «در انتظار».
 *
 * ساختن سطر و پرداختن پول دو مرحله‌ی جدا هستند و عمداً یکی نشدند: انتقال
 * وجه در این فاز دستی و بیرون از سیستم انجام می‌شود، و بین «تصمیم گرفتم
 * این مبلغ را بدهم» تا «دادم و کد رهگیری دارم» فاصله‌ی واقعی هست. سطری
 * که همان لحظه «پرداخت‌شده» ثبت شود، اگر انتقال شکست بخورد دروغ می‌ماند.
 *
 * به همین دلیل دفتر کل هم اینجا دست نمی‌خورد؛ سطر `PAYOUT` وقتی نوشته
 * می‌شود که پول واقعاً رفته باشد.
 */
export async function createPayout(input: CreatePayoutInput): Promise<AdminPayoutRow> {
  await assertTeacherExists(input.teacherProfileId);

  const balance = await teacherEarningsBreakdown(input.teacherProfileId);
  const pending = await pendingPayoutTotal(input.teacherProfileId);

  // تسویه‌های در انتظار هم کسر می‌شوند، وگرنه دو بار ثبتِ «کل مانده» دو
  // برابر بدهی را پرداختنی می‌کند و هیچ‌کدام به‌تنهایی خطا نمی‌دهد
  const available = balance.outstanding - pending;

  if (input.amount > available) throw new PayoutExceedsBalanceError(available);

  const [created] = await db
    .insert(payouts)
    .values({
      teacherId: input.teacherProfileId,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      amount: input.amount,
      note: input.note,
    })
    .returning({ id: payouts.id });

  return requirePayout(created!.id);
}

async function pendingPayoutTotal(teacherProfileId: string): Promise<bigint> {
  const [row] = await db
    .select({ total: sql<string>`COALESCE(SUM(${payouts.amount}), 0)::text` })
    .from(payouts)
    .where(and(eq(payouts.teacherId, teacherProfileId), eq(payouts.status, "PENDING")));

  return BigInt(row?.total ?? 0);
}

/**
 * علامت زدن تسویه به‌عنوان پرداخت‌شده، و ثبتش در دفتر کل.
 *
 * سطر دفتر کل منفی است: `net_amount = -amount`. با این کار جمع ساده‌ی
 * `net_amount` هر استاد همچنان بدهی واقعی پلتفرم به اوست — همان قاعده‌ای
 * که بازپرداخت هم از آن پیروی می‌کند و باعث می‌شود هیچ گزارشی نیازی به
 * «منهای تسویه‌ها» نداشته باشد.
 *
 * `commission` صفر است و `gross` قرینه‌ی مبلغ، چون قید
 * `ledger_amounts_balance` می‌خواهد `gross = commission + net`. اثر
 * جانبی‌اش این است که جمع خامِ `gross` بعد از تسویه پایین می‌آید؛
 * `teacherEarningsBreakdown` دقیقاً برای همین سطرهای `PAYOUT` را از دو
 * ستون اول کنار می‌گذارد.
 *
 * `UPDATE` شرطی است تا دو بار زدنِ دکمه دو سطر در دفتر کل نسازد: اجرای
 * دوم هیچ سطری برنمی‌گرداند و همان‌جا متوقف می‌شود.
 */
export async function markPayoutPaid(
  payoutId: string,
  trackingCode: string | null,
): Promise<AdminPayoutRow> {
  /**
   * اعلان **بیرون** از تراکنش فرستاده می‌شود.
   *
   * داخلش یعنی خطای درج اعلان، ثبت تسویه و سطر دفتر کل را رول‌بک کند —
   * پولی که واقعاً منتقل شده، به‌خاطر یک اعلان ثبت‌نشده گم شود.
   */
  const settled = await db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ id: payouts.id })
      .from(payouts)
      .where(eq(payouts.id, payoutId))
      .limit(1);

    if (!existing) throw new AdminRecordNotFoundError("تسویه");

    const [paid] = await tx
      .update(payouts)
      .set({ status: "PAID", paidAt: new Date(), trackingCode })
      .where(and(eq(payouts.id, payoutId), eq(payouts.status, "PENDING")))
      .returning({
        teacherId: payouts.teacherId,
        amount: payouts.amount,
        periodStart: payouts.periodStart,
        periodEnd: payouts.periodEnd,
      });

    if (!paid) throw new PayoutNotPendingError();

    await tx.insert(ledgerEntries).values({
      type: "PAYOUT",
      teacherId: paid.teacherId,
      grossAmount: -paid.amount,
      commission: 0n,
      netAmount: -paid.amount,
      description: `تسویه ${paid.periodStart} تا ${paid.periodEnd}`,
    });

    return paid;
  });

  const [teacher] = await db
    .select({ userId: teacherProfiles.userId })
    .from(teacherProfiles)
    .where(eq(teacherProfiles.id, settled.teacherId))
    .limit(1);

  if (teacher) {
    await notifyInApp({
      userId: teacher.userId,
      type: IN_APP_TYPES.PAYOUT_PAID,
      message: `تسویه‌ی دوره‌ی ${settled.periodStart} تا ${settled.periodEnd} پرداخت شد.`,
      href: "/teacher/earnings",
    });
  }

  return requirePayout(payoutId);
}

/**
 * یک تسویه با شناسه.
 *
 * مستقیم پرسیده می‌شود و نه با گشتن در `listPayouts()`. آن شکل تا وقتی
 * فهرست سقف ثابت داشت کار می‌کرد و با آمدن صفحه‌بندی بی‌صدا می‌شکست:
 * تسویه‌ای که در صفحه‌ی اول نباشد «پیدا نشد» می‌گرفت — یعنی درست بعد از
 * پنجاهمین تسویه، ثبت پرداخت برای همه‌ی قدیمی‌ها از کار می‌افتاد.
 */
async function requirePayout(payoutId: string): Promise<AdminPayoutRow> {
  const [row] = await payoutQuery().where(eq(payouts.id, payoutId)).limit(1);

  if (!row) throw new AdminRecordNotFoundError("تسویه");

  return toPayoutRow(row);
}

// ---------------------------------------------------------------------------
// نمای کلی
// ---------------------------------------------------------------------------

export interface AdminOverview {
  pendingTeachers: number;
  approvedTeachers: number;
  activeInstruments: number;
  upcomingBookings: number;
  pendingPayouts: number;
  /** جلسه‌های برگزارنشده‌ای که هنوز رسیدگی نشده‌اند */
  openReviews: number;
  /** جمع بدهی پرداخت‌نشده به همه‌ی استادها، ریال */
  outstandingTotal: string;
}

/**
 * چند عدد برای صفحه‌ی اول پنل.
 *
 * «استاد در انتظار تأیید» اولین عددی است که باید دیده شود: تا وقتی این
 * صفحه نبود، درخواست‌ها هیچ‌جا ظاهر نمی‌شدند و تنها راه دیدنشان
 * `db:studio` بود.
 */
export async function overview(now: Date = new Date()): Promise<AdminOverview> {
  const [
    pendingTeachers,
    approvedTeachers,
    activeInstruments,
    upcoming,
    pendingPayoutRows,
    openReviews,
    outstanding,
  ] =
    await Promise.all([
      countRows(db.select({ value: count() }).from(teacherProfiles).where(eq(teacherProfiles.status, "PENDING"))),
      countRows(db.select({ value: count() }).from(teacherProfiles).where(eq(teacherProfiles.status, "APPROVED"))),
      countRows(db.select({ value: count() }).from(instruments).where(eq(instruments.isActive, true))),
      countRows(
        db
          .select({ value: count() })
          .from(bookings)
          .where(and(eq(bookings.status, "CONFIRMED"), gte(bookings.scheduledAt, now))),
      ),
      countRows(db.select({ value: count() }).from(payouts).where(eq(payouts.status, "PENDING"))),
      countOpenReviews(),
      db
        .select({ total: sql<string>`COALESCE(SUM(${ledgerEntries.netAmount}), 0)::text` })
        .from(ledgerEntries),
    ]);

  return {
    pendingTeachers,
    approvedTeachers,
    activeInstruments,
    upcomingBookings: upcoming,
    pendingPayouts: pendingPayoutRows,
    openReviews,
    outstandingTotal: outstanding[0]?.total ?? "0",
  };
}

async function countRows(query: Promise<{ value: number }[]>): Promise<number> {
  const rows = await query;
  return rows[0]?.value ?? 0;
}

// ---------------------------------------------------------------------------

async function assertTeacherExists(profileId: string): Promise<void> {
  const [row] = await db
    .select({ id: teacherProfiles.id })
    .from(teacherProfiles)
    .where(eq(teacherProfiles.id, profileId))
    .limit(1);

  if (!row) throw new AdminRecordNotFoundError("استاد");
}

async function assertInstrumentExists(instrumentId: string): Promise<void> {
  const [row] = await db
    .select({ id: instruments.id })
    .from(instruments)
    .where(eq(instruments.id, instrumentId))
    .limit(1);

  if (!row) throw new AdminRecordNotFoundError("ساز");
}
