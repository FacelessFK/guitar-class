/**
 * شمارشی‌های دامنه.
 *
 * این‌ها باید با `apps/api/src/db/schema/enums.ts` یکی بمانند. عمداً
 * جدا تعریف شده‌اند تا فرانت‌اند بتواند بدون وابستگی به لایه‌ی دیتابیس
 * از آن‌ها استفاده کند.
 *
 * تست `apps/api/src/db/schema/enums.test.ts` همگامی دو طرف را بررسی
 * می‌کند و جدا افتادنشان را به خطای زمان بیلد تبدیل می‌کند.
 */

export const BookingType = {
  TRIAL: "TRIAL",
  SINGLE: "SINGLE",
  PACKAGE: "PACKAGE",
} as const;
export type BookingType = (typeof BookingType)[keyof typeof BookingType];

export const BookingStatus = {
  /** اسلات قفل شده ولی پرداخت نشده — با `holdExpiresAt` منقضی می‌شود */
  PENDING_PAYMENT: "PENDING_PAYMENT",
  CONFIRMED: "CONFIRMED",
  IN_PROGRESS: "IN_PROGRESS",
  COMPLETED: "COMPLETED",
  CANCELLED_BY_STUDENT: "CANCELLED_BY_STUDENT",
  CANCELLED_BY_TEACHER: "CANCELLED_BY_TEACHER",
  NO_SHOW_STUDENT: "NO_SHOW_STUDENT",
  NO_SHOW_TEACHER: "NO_SHOW_TEACHER",
  /** مهلت پرداخت تمام شد و اسلات آزاد شد */
  EXPIRED: "EXPIRED",
} as const;
export type BookingStatus = (typeof BookingStatus)[keyof typeof BookingStatus];

/**
 * وضعیت‌هایی که اسلات را اشغال می‌کنند.
 * باید دقیقاً با شرط `WHERE` در exclusion constraint دیتابیس یکی باشد.
 */
export const SLOT_OCCUPYING_STATUSES: readonly BookingStatus[] = [
  BookingStatus.PENDING_PAYMENT,
  BookingStatus.CONFIRMED,
  BookingStatus.IN_PROGRESS,
];

export const EnrollmentStatus = {
  PENDING_PAYMENT: "PENDING_PAYMENT",
  ACTIVE: "ACTIVE",
  COMPLETED: "COMPLETED",
  CANCELLED: "CANCELLED",
} as const;
export type EnrollmentStatus = (typeof EnrollmentStatus)[keyof typeof EnrollmentStatus];

export const TeacherStatus = {
  PENDING: "PENDING",
  APPROVED: "APPROVED",
  SUSPENDED: "SUSPENDED",
} as const;
export type TeacherStatus = (typeof TeacherStatus)[keyof typeof TeacherStatus];

export const UserStatus = {
  ACTIVE: "ACTIVE",
  SUSPENDED: "SUSPENDED",
} as const;
export type UserStatus = (typeof UserStatus)[keyof typeof UserStatus];

export const SkillLevel = {
  BEGINNER: "BEGINNER",
  INTERMEDIATE: "INTERMEDIATE",
  ADVANCED: "ADVANCED",
} as const;
export type SkillLevel = (typeof SkillLevel)[keyof typeof SkillLevel];

export const OrderStatus = {
  PENDING: "PENDING",
  PAID: "PAID",
  FAILED: "FAILED",
  REFUNDED: "REFUNDED",
} as const;
export type OrderStatus = (typeof OrderStatus)[keyof typeof OrderStatus];

export const LedgerType = {
  EARNING: "EARNING",
  REFUND: "REFUND",
  PAYOUT: "PAYOUT",
  ADJUSTMENT: "ADJUSTMENT",
} as const;
export type LedgerType = (typeof LedgerType)[keyof typeof LedgerType];

export const PayoutStatus = {
  PENDING: "PENDING",
  PAID: "PAID",
} as const;
export type PayoutStatus = (typeof PayoutStatus)[keyof typeof PayoutStatus];

export const AssignmentStatus = {
  ASSIGNED: "ASSIGNED",
  SUBMITTED: "SUBMITTED",
  REVIEWED: "REVIEWED",
} as const;
export type AssignmentStatus = (typeof AssignmentStatus)[keyof typeof AssignmentStatus];

export const MediaType = {
  AUDIO: "AUDIO",
  VIDEO: "VIDEO",
} as const;
export type MediaType = (typeof MediaType)[keyof typeof MediaType];

export const RecordingStatus = {
  PROCESSING: "PROCESSING",
  READY: "READY",
  EXPIRED: "EXPIRED",
  FAILED: "FAILED",
} as const;
export type RecordingStatus = (typeof RecordingStatus)[keyof typeof RecordingStatus];

export const NotificationChannel = {
  SMS: "SMS",
  IN_APP: "IN_APP",
} as const;
export type NotificationChannel =
  (typeof NotificationChannel)[keyof typeof NotificationChannel];

export const NotificationStatus = {
  PENDING: "PENDING",
  SENT: "SENT",
  FAILED: "FAILED",
} as const;
export type NotificationStatus =
  (typeof NotificationStatus)[keyof typeof NotificationStatus];

// ---------------------------------------------------------------------------
// قواعد کسب‌وکار — این‌ها هنوز تصمیم‌های باز هستند و باید نهایی شوند
// ---------------------------------------------------------------------------

export const BUSINESS_RULES = {
  /** طول جلسه‌ی معارفه‌ی رایگان، به دقیقه */
  TRIAL_DURATION_MINUTES: 20,
  /** مهلت پرداخت پیش از آزاد شدن اسلات، به دقیقه */
  PAYMENT_HOLD_MINUTES: 15,
  /** تعداد جلسات پکیج ماهانه */
  PACKAGE_SESSION_COUNT: 4,
  /** فاصله‌ی اجباری بین دو کلاس، به دقیقه */
  DEFAULT_BUFFER_MINUTES: 15,
  /** حداقل فاصله از الان تا شروع کلاس، به دقیقه */
  MIN_LEAD_MINUTES: 120,
  /** مهلت لغو بدون سوخت شدن جلسه، به ساعت */
  FREE_CANCELLATION_HOURS: 24,
  /** مهلت انتظار پیش از ثبت عدم حضور، به دقیقه */
  NO_SHOW_GRACE_MINUTES: 15,
  /** بازه‌ی مجاز ورود به اتاق: از چند دقیقه قبل تا چند دقیقه بعد */
  ROOM_OPEN_BEFORE_MINUTES: 10,
  ROOM_OPEN_AFTER_MINUTES: 15,
  /** مدت نگه‌داری فایل‌های ضبط‌شده، به روز */
  RECORDING_RETENTION_DAYS: 90,
} as const;
