import { describe, expect, it } from "vitest";
import * as shared from "@music/shared";

import * as dbEnums from "./enums.js";

/**
 * شمارشی‌ها در دو جا تعریف شده‌اند:
 *   • `packages/shared/src/enums.ts` — تا فرانت‌اند بدون وابستگی به
 *     لایه‌ی دیتابیس از آن‌ها استفاده کند
 *   • `apps/api/src/db/schema/enums.ts` — تعریف واقعی در پستگرس
 *
 * اگر یکی عوض شود و دیگری نه، خطا در زمان اجرا و روی داده‌ی واقعی ظاهر
 * می‌شود. این تست آن را به خطای زمان بیلد تبدیل می‌کند.
 */
function expectSameValues(
  label: string,
  dbValues: readonly string[],
  sharedValues: Record<string, string>,
): void {
  expect(new Set(dbValues), `${label} همگام نیست`).toEqual(
    new Set(Object.values(sharedValues)),
  );
}

describe("همگامی شمارشی‌های دیتابیس و پکیج مشترک", () => {
  it("BookingStatus", () => {
    expectSameValues("BookingStatus", dbEnums.bookingStatus.enumValues, shared.BookingStatus);
  });

  it("BookingType", () => {
    expectSameValues("BookingType", dbEnums.bookingType.enumValues, shared.BookingType);
  });

  it("EnrollmentStatus", () => {
    expectSameValues(
      "EnrollmentStatus",
      dbEnums.enrollmentStatus.enumValues,
      shared.EnrollmentStatus,
    );
  });

  it("TeacherStatus", () => {
    expectSameValues("TeacherStatus", dbEnums.teacherStatus.enumValues, shared.TeacherStatus);
  });

  it("UserStatus", () => {
    expectSameValues("UserStatus", dbEnums.userStatus.enumValues, shared.UserStatus);
  });

  it("SkillLevel", () => {
    expectSameValues("SkillLevel", dbEnums.skillLevel.enumValues, shared.SkillLevel);
  });

  it("OrderStatus", () => {
    expectSameValues("OrderStatus", dbEnums.orderStatus.enumValues, shared.OrderStatus);
  });

  it("LedgerType", () => {
    expectSameValues("LedgerType", dbEnums.ledgerType.enumValues, shared.LedgerType);
  });

  it("PayoutStatus", () => {
    expectSameValues("PayoutStatus", dbEnums.payoutStatus.enumValues, shared.PayoutStatus);
  });

  it("AssignmentStatus", () => {
    expectSameValues(
      "AssignmentStatus",
      dbEnums.assignmentStatus.enumValues,
      shared.AssignmentStatus,
    );
  });

  it("MediaType", () => {
    expectSameValues("MediaType", dbEnums.mediaType.enumValues, shared.MediaType);
  });

  it("RecordingStatus", () => {
    expectSameValues(
      "RecordingStatus",
      dbEnums.recordingStatus.enumValues,
      shared.RecordingStatus,
    );
  });

  it("NotificationChannel", () => {
    expectSameValues(
      "NotificationChannel",
      dbEnums.notificationChannel.enumValues,
      shared.NotificationChannel,
    );
  });

  it("NotificationStatus", () => {
    expectSameValues(
      "NotificationStatus",
      dbEnums.notificationStatus.enumValues,
      shared.NotificationStatus,
    );
  });

  it("PostStatus", () => {
    expectSameValues("PostStatus", dbEnums.postStatus.enumValues, shared.PostStatus);
  });

  it("SessionReviewReason", () => {
    expectSameValues(
      "SessionReviewReason",
      dbEnums.sessionReviewReason.enumValues,
      shared.SessionReviewReason,
    );
  });

  it("AttendanceEvent", () => {
    expectSameValues(
      "AttendanceEvent",
      dbEnums.attendanceEvent.enumValues,
      shared.AttendanceEvent,
    );
  });

  it("AttendanceSource", () => {
    expectSameValues(
      "AttendanceSource",
      dbEnums.attendanceSource.enumValues,
      shared.AttendanceSource,
    );
  });

  it("SessionReviewStatus", () => {
    expectSameValues(
      "SessionReviewStatus",
      dbEnums.sessionReviewStatus.enumValues,
      shared.SessionReviewStatus,
    );
  });

  it("ExceptionType", () => {
    expect(new Set(dbEnums.exceptionType.enumValues)).toEqual(new Set(["BLOCK", "EXTRA"]));
  });
});

describe("وضعیت‌های اشغال‌کننده‌ی اسلات", () => {
  /**
   * `SLOT_OCCUPYING_STATUSES` باید دقیقاً با شرط `WHERE` قید
   * `bookings_no_teacher_overlap` در مایگریشن `0001_booking_integrity`
   * یکی باشد. اگر از هم جدا بیفتند، یا اسلات‌های آزاد رزروناپذیر
   * می‌شوند یا رزرو دوتایی از قید رد می‌شود.
   */
  it("زیرمجموعه‌ی معتبری از وضعیت‌های رزرو است", () => {
    for (const status of shared.SLOT_OCCUPYING_STATUSES) {
      expect(dbEnums.bookingStatus.enumValues).toContain(status);
    }
  });

  it("دقیقاً همان سه وضعیتی است که در مایگریشن آمده", () => {
    expect([...shared.SLOT_OCCUPYING_STATUSES]).toEqual([
      "PENDING_PAYMENT",
      "CONFIRMED",
      "IN_PROGRESS",
    ]);
  });
});
