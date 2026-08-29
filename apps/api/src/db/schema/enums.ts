import { pgEnum } from "drizzle-orm/pg-core";

/**
 * شمارشی‌های دیتابیس.
 *
 * مقادیر باید با `packages/shared/src/enums.ts` یکی بمانند. تستی وجود
 * دارد که همگامی دو طرف را بررسی می‌کند.
 */

export const userStatus = pgEnum("user_status", ["ACTIVE", "SUSPENDED"]);

export const teacherStatus = pgEnum("teacher_status", [
  "PENDING",
  "APPROVED",
  "SUSPENDED",
]);

export const skillLevel = pgEnum("skill_level", [
  "BEGINNER",
  "INTERMEDIATE",
  "ADVANCED",
]);

export const exceptionType = pgEnum("exception_type", [
  /** «این شنبه نیستم» */
  "BLOCK",
  /** «این پنج‌شنبه استثنائاً هستم» */
  "EXTRA",
]);

export const bookingType = pgEnum("booking_type", ["TRIAL", "SINGLE", "PACKAGE"]);

export const bookingStatus = pgEnum("booking_status", [
  "PENDING_PAYMENT",
  "CONFIRMED",
  "IN_PROGRESS",
  "COMPLETED",
  "CANCELLED_BY_STUDENT",
  "CANCELLED_BY_TEACHER",
  "NO_SHOW_STUDENT",
  "NO_SHOW_TEACHER",
  "NO_SHOW",
  "EXPIRED",
]);

export const enrollmentStatus = pgEnum("enrollment_status", [
  "PENDING_PAYMENT",
  "ACTIVE",
  "COMPLETED",
  "CANCELLED",
]);

export const orderStatus = pgEnum("order_status", [
  "PENDING",
  "PAID",
  "FAILED",
  "REFUNDED",
]);

export const ledgerType = pgEnum("ledger_type", [
  "EARNING",
  "REFUND",
  "PAYOUT",
  "ADJUSTMENT",
]);

export const payoutStatus = pgEnum("payout_status", ["PENDING", "PAID"]);

export const creditReason = pgEnum("credit_reason", [
  "CANCELLATION",
  "PAYMENT_RECOVERY",
  "SPEND",
  "ADMIN_ADJUSTMENT",
]);

export const assignmentStatus = pgEnum("assignment_status", [
  "ASSIGNED",
  "SUBMITTED",
  "REVIEWED",
]);

export const mediaType = pgEnum("media_type", ["AUDIO", "VIDEO"]);

export const recordingStatus = pgEnum("recording_status", [
  "PROCESSING",
  "READY",
  "EXPIRED",
  "FAILED",
]);

export const postStatus = pgEnum("post_status", ["DRAFT", "PUBLISHED"]);

export const attendanceEvent = pgEnum("attendance_event", ["JOINED", "LEFT"]);

export const attendanceSource = pgEnum("attendance_source", ["CLIENT", "SERVER_HOOK"]);

export const sessionReviewReason = pgEnum("session_review_reason", [
  "NO_SHOW_TEACHER",
  "NO_SHOW",
  "ATTENDANCE_UNVERIFIED",
]);

export const sessionReviewStatus = pgEnum("session_review_status", [
  "OPEN",
  "RESOLVED",
]);

export const notificationChannel = pgEnum("notification_channel", ["SMS", "IN_APP"]);

export const notificationStatus = pgEnum("notification_status", [
  "PENDING",
  "SENT",
  "FAILED",
]);
