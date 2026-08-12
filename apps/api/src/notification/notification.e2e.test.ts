import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import type { App } from "supertest/types.js";
import { and, eq, sql } from "drizzle-orm";

import { AppModule } from "../app.module.js";
import { AuthExceptionFilter } from "../common/auth-exception.filter.js";
import { DomainExceptionFilter } from "../common/domain-exception.filter.js";
import { BigIntSerializationInterceptor } from "../common/serialization.interceptor.js";
import { db } from "../db/client.js";
import { bookings, notifications, users } from "../db/schema/index.js";
import { InMemoryObjectStorage, setObjectStorage } from "../media/storage.port.js";
import { IN_APP_TYPES } from "./in-app.service.js";
import { REMINDER_KINDS, scheduleDueReminders } from "./reminder.service.js";
import {
  accessTokenFor,
  closeDatabase,
  resetDatabase,
  resetRedis,
  seedFixture,
  type Fixture,
} from "../test/fixtures.js";

/**
 * اعلان درون‌اپ.
 *
 * ستون `channel` از روز اول حالت `IN_APP` داشت و هیچ‌کس نه می‌نوشتش و
 * نه می‌خواندش. مهم‌ترین چیزی که اینجا سنجیده می‌شود، همان تله‌ای است
 * که با آمدن این کانال باز شد: ایندکس یکتای `notifications_once_per_booking`
 * پیش از این **هر** اعلانِ وصل به جلسه را یکتا می‌کرد، که برای یادآوری
 * درست است و برای اعلان رویدادی فاجعه.
 */

let app: INestApplication;
let server: App;
let fixture: Fixture;
let teacherToken: string;
let studentToken: string;
let adminToken: string;
let bookingId: string;

const storage = new InMemoryObjectStorage("http://localhost:4000/api");

beforeAll(async () => {
  setObjectStorage(storage);

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

  app = moduleRef.createNestApplication();
  app.setGlobalPrefix("api");
  app.useGlobalFilters(new AuthExceptionFilter(), new DomainExceptionFilter());
  app.useGlobalInterceptors(new BigIntSerializationInterceptor());
  await app.init();

  server = app.getHttpServer() as App;
});

beforeEach(async () => {
  await resetDatabase();
  await resetRedis();
  fixture = await seedFixture();

  const scheduledAt = new Date(Date.now() - 3 * 86_400_000);
  const [booking] = await db
    .insert(bookings)
    .values({
      studentId: fixture.studentId,
      teacherId: fixture.teacherUserId,
      offeringId: fixture.offeringId,
      type: "SINGLE",
      scheduledAt,
      endsAt: new Date(scheduledAt.getTime() + 3_600_000),
      durationMinutes: 60,
      status: "COMPLETED",
      priceSnapshot: 3_000_000n,
      commissionSnapshot: "20",
    })
    .returning({ id: bookings.id });

  bookingId = booking!.id;

  const [admin] = await db
    .insert(users)
    .values({ phone: "+989120000009", fullName: "مدیر", isAdmin: true })
    .returning({ id: users.id });

  [teacherToken, studentToken, adminToken] = await Promise.all([
    accessTokenFor(fixture.teacherUserId),
    accessTokenFor(fixture.studentId),
    accessTokenFor(admin!.id, true),
  ]);
});

afterAll(async () => {
  await app.close();
  await closeDatabase();
});

async function upload(token: string, purpose: string): Promise<string> {
  const ticket = await request(server)
    .post("/api/media/upload-url")
    .set("authorization", `Bearer ${token}`)
    .send({ purpose, fileName: "clip.mp3", contentType: "audio/mpeg", sizeBytes: 512 })
    .expect(201);

  const key = ticket.body.objectKey as string;
  storage.put(key, Buffer.from("audio"), "audio/mpeg");
  return key;
}

async function createAssignment(title: string): Promise<string> {
  const response = await request(server)
    .post(`/api/bookings/${bookingId}/assignments`)
    .set("authorization", `Bearer ${teacherToken}`)
    .send({ title })
    .expect(201);

  return response.body.id as string;
}

const listFor = (token: string) =>
  request(server)
    .get("/api/notifications")
    .set("authorization", `Bearer ${token}`)
    .expect(200);

describe("رویدادهای حلقه‌ی یادگیری", () => {
  it("تمرین تازه به هنرجو اعلان می‌دهد، نه به استاد", async () => {
    await createAssignment("آرپژ");

    const student = await listFor(studentToken);
    expect(student.body.unread).toBe(1);
    expect(student.body.notifications[0]).toMatchObject({
      type: "ASSIGNMENT_CREATED",
      message: "تمرین تازه: آرپژ",
      href: `/sessions/${bookingId}`,
      read: false,
    });

    // استاد خودش این کار را کرده؛ اعلانش بی‌معنی است
    const teacher = await listFor(teacherToken);
    expect(teacher.body.unread).toBe(0);
  });

  it("اجرای هنرجو و بازخورد استاد، هرکدام طرف مقابل را خبر می‌کنند", async () => {
    const assignmentId = await createAssignment("آرپژ");

    const key = await upload(studentToken, "SUBMISSION");
    const submission = await request(server)
      .post(`/api/assignments/${assignmentId}/submissions`)
      .set("authorization", `Bearer ${studentToken}`)
      .send({ objectKey: key })
      .expect(201);

    const teacher = await listFor(teacherToken);
    expect(teacher.body.notifications[0]).toMatchObject({
      type: "SUBMISSION_RECEIVED",
      read: false,
    });

    await request(server)
      .put(`/api/submissions/${submission.body.id}/feedback`)
      .set("authorization", `Bearer ${teacherToken}`)
      .send({ content: "خوب بود" })
      .expect(200);

    const student = await listFor(studentToken);
    expect(student.body.notifications[0].type).toBe("FEEDBACK_RECEIVED");
  });

  /**
   * مهم‌ترین تست این فایل.
   *
   * ایندکس یکتا پیش از این روی `(booking_id, user_id, type)` بود و همه‌ی
   * اعلان‌های وصل به جلسه را می‌گرفت. با آن، هنرجویی که پس از بازخورد
   * دوباره تمرینش را می‌فرستاد هیچ اعلان تازه‌ای نمی‌ساخت و استاد هرگز
   * نمی‌فهمید کار تازه‌ای رسیده — خرابی‌ای که هیچ خطایی نمی‌دهد.
   */
  it("اجرای دوباره روی همان جلسه، اعلان تازه می‌سازد", async () => {
    const assignmentId = await createAssignment("آرپژ");

    for (let i = 0; i < 3; i += 1) {
      const key = await upload(studentToken, "SUBMISSION");
      await request(server)
        .post(`/api/assignments/${assignmentId}/submissions`)
        .set("authorization", `Bearer ${studentToken}`)
        .send({ objectKey: key })
        .expect(201);
    }

    const teacher = await listFor(teacherToken);
    const received = teacher.body.notifications.filter(
      (row: { type: string }) => row.type === "SUBMISSION_RECEIVED",
    );

    expect(received).toHaveLength(3);
  });

  it("دو تمرین برای یک جلسه، دو اعلان می‌سازند", async () => {
    await createAssignment("تمرین اول");
    await createAssignment("تمرین دوم");

    const student = await listFor(studentToken);
    expect(student.body.unread).toBe(2);
  });

  /**
   * نکات جلسه برعکس، فقط بار اول اعلان می‌دهد: استاد معمولاً حین کلاس
   * شروع می‌کند و چند بار کاملش می‌کند.
   */
  it("ویرایش نکات جلسه اعلان دوباره نمی‌سازد", async () => {
    for (const content of ["اول", "دوم", "سوم"]) {
      await request(server)
        .put(`/api/bookings/${bookingId}/notes`)
        .set("authorization", `Bearer ${teacherToken}`)
        .send({ content })
        .expect(200);
    }

    const student = await listFor(studentToken);
    const notes = student.body.notifications.filter(
      (row: { type: string }) => row.type === "SESSION_NOTE_ADDED",
    );

    expect(notes).toHaveLength(1);
  });
});

describe("یادآوری‌ها هنوز ایدمپوتنت‌اند", () => {
  /**
   * باز کردن ایندکس نباید ضمانت یادآوری‌ها را از بین برده باشد. جارو
   * هر دقیقه اجرا می‌شود و بدون این ضمانت، کاربر به ازای هر اجرا یک
   * پیامک می‌گیرد.
   */
  it("اجرای چندباره‌ی جارو، سطر دوم نمی‌سازد", async () => {
    // جلسه‌ای که دقیقاً در پنجره‌ی یادآوری یک‌ساعته است
    const scheduledAt = new Date(Date.now() + 30 * 60_000);
    const [upcoming] = await db
      .insert(bookings)
      .values({
        studentId: fixture.otherStudentId,
        teacherId: fixture.teacherUserId,
        offeringId: fixture.offeringId,
        type: "SINGLE",
        scheduledAt,
        endsAt: new Date(scheduledAt.getTime() + 3_600_000),
        durationMinutes: 60,
        status: "CONFIRMED",
        priceSnapshot: 3_000_000n,
        commissionSnapshot: "20",
        createdAt: new Date(Date.now() - 3 * 86_400_000),
      })
      .returning({ id: bookings.id });

    for (let i = 0; i < 3; i += 1) await scheduleDueReminders();

    const rows = await db
      .select()
      .from(notifications)
      .where(
        and(
          eq(notifications.bookingId, upcoming!.id),
          eq(notifications.userId, fixture.otherStudentId),
        ),
      );

    /**
     * جلسه‌ای که سه روز پیش رزرو شده و نیم ساعت دیگر است، هر دو موعد
     * یادآوری را رد کرده — پس دو نوع سطر انتظار می‌رود. چیزی که سنجیده
     * می‌شود این است که سه بار اجرای جارو، از **هر نوع** فقط یکی
     * ساخته باشد.
     */
    const byType = new Map<string, number>();
    for (const row of rows) byType.set(row.type, (byType.get(row.type) ?? 0) + 1);

    expect([...byType.values()]).toEqual([1, 1]);
    expect([...byType.keys()].sort()).toEqual([
      "SESSION_REMINDER_1H",
      "SESSION_REMINDER_24H",
    ]);
    expect(rows.every((row) => row.channel === "SMS")).toBe(true);
  });

  /**
   * ایندکس یکتا به پیشوند نام گره خورده است. نوع یادآوری تازه‌ای که آن
   * پیشوند را نداشته باشد، بی‌صدا ایدمپوتنسی‌اش را از دست می‌دهد.
   */
  it("همه‌ی انواع یادآوری پیشوند SESSION_REMINDER دارند", () => {
    for (const kind of REMINDER_KINDS) {
      expect(kind.type.startsWith("SESSION_REMINDER")).toBe(true);
    }
  });

  /**
   * سمت دیگر همان ایندکس، و با **خودِ پستگرس** سنجیده می‌شود نه با
   * `startsWith`.
   *
   * شرط ایندکس `LIKE 'SESSION_REMINDER%'` است و در `LIKE`، کاراکتر `_`
   * یک وایلدکارتِ تک‌کاراکتری است. پس نامی که با چشم «شبیه» پیشوند
   * نیست هم می‌تواند داخل ایندکس بیفتد و بی‌صدا تکرارناپذیر شود:
   * اعلان دومِ همان نوع برای همان جلسه، به‌جای ساخته شدن، در
   * `ON CONFLICT DO NOTHING` بی‌صدا دور ریخته می‌شود — و برای اعلان
   * رویدادی این یعنی استاد هرگز نفهمد کار تازه‌ای رسیده.
   *
   * `startsWith` جاوااسکریپت این را نمی‌گیرد چون معنای `_` را نمی‌داند.
   */
  it("هیچ نوع درون‌اپی در دام ایندکس یادآوری نمی‌افتد", async () => {
    const types = Object.values(IN_APP_TYPES);

    const rows = await db.execute<{ type: string; caught: boolean }>(sql`
      SELECT t AS type, t LIKE 'SESSION_REMINDER%' AS caught
      FROM unnest(${sql.param(types)}::text[]) AS t
    `);

    expect(rows.filter((row) => row.caught)).toEqual([]);
  });

  it("یادآوری پیامکی در فهرست درون‌اپ نمی‌آید", async () => {
    await db.insert(notifications).values({
      userId: fixture.studentId,
      bookingId,
      type: "SESSION_REMINDER_1H",
      channel: "SMS",
      payload: {},
      scheduledFor: new Date(),
    });

    const student = await listFor(studentToken);
    expect(student.body.notifications).toHaveLength(0);
  });
});

describe("رویدادهای ادمین", () => {
  it("تأیید استاد به خودِ استاد اعلان می‌دهد", async () => {
    await request(server)
      .patch(`/api/admin/teachers/${fixture.teacherProfileId}`)
      .set("authorization", `Bearer ${adminToken}`)
      .send({ status: "SUSPENDED" })
      .expect(200);

    await request(server)
      .patch(`/api/admin/teachers/${fixture.teacherProfileId}`)
      .set("authorization", `Bearer ${adminToken}`)
      .send({ status: "APPROVED" })
      .expect(200);

    const teacher = await listFor(teacherToken);
    const statusChanges = teacher.body.notifications.filter(
      (row: { type: string }) => row.type === "TEACHER_STATUS_CHANGED",
    );

    expect(statusChanges).toHaveLength(2);
    expect(statusChanges[0].message).toContain("تأیید شد");
  });

  it("تغییر کمیسیون اعلان نمی‌سازد", async () => {
    await request(server)
      .patch(`/api/admin/teachers/${fixture.teacherProfileId}`)
      .set("authorization", `Bearer ${adminToken}`)
      .send({ commissionRate: "30" })
      .expect(200);

    const teacher = await listFor(teacherToken);
    expect(teacher.body.unread).toBe(0);
  });
});

describe("خواندن و علامت زدن", () => {
  it("هرکس فقط اعلان‌های خودش را می‌بیند", async () => {
    await createAssignment("آرپژ");

    const other = await request(server)
      .get("/api/notifications")
      .set("authorization", `Bearer ${await accessTokenFor(fixture.otherStudentId)}`)
      .expect(200);

    expect(other.body.notifications).toEqual([]);
    expect(other.body.unread).toBe(0);
  });

  it("علامت زدن همه، شمارنده را صفر می‌کند", async () => {
    await createAssignment("اول");
    await createAssignment("دوم");

    const marked = await request(server)
      .post("/api/notifications/read")
      .set("authorization", `Bearer ${studentToken}`)
      .send({})
      .expect(200);

    expect(marked.body.updated).toBe(2);

    const after = await listFor(studentToken);
    expect(after.body.unread).toBe(0);
    expect(after.body.notifications.every((row: { read: boolean }) => row.read)).toBe(true);
  });

  it("علامت زدن یک اعلان، بقیه را دست نمی‌زند", async () => {
    await createAssignment("اول");
    await createAssignment("دوم");

    const before = await listFor(studentToken);
    const target = before.body.notifications[0].id as string;

    await request(server)
      .post("/api/notifications/read")
      .set("authorization", `Bearer ${studentToken}`)
      .send({ ids: [target] })
      .expect(200);

    const after = await listFor(studentToken);
    expect(after.body.unread).toBe(1);
  });

  /**
   * شرط مالکیت روی خودِ `UPDATE` است، نه یک بررسی جدا. بدون آن، کسی
   * می‌توانست با فرستادن شناسه‌ی اعلان دیگران آن را خوانده علامت بزند.
   */
  it("اعلان کاربر دیگر با فرستادن شناسه‌اش خوانده نمی‌شود", async () => {
    await createAssignment("آرپژ");

    const student = await listFor(studentToken);
    const foreignId = student.body.notifications[0].id as string;

    const attempt = await request(server)
      .post("/api/notifications/read")
      .set("authorization", `Bearer ${teacherToken}`)
      .send({ ids: [foreignId] })
      .expect(200);

    expect(attempt.body.updated).toBe(0);

    const after = await listFor(studentToken);
    expect(after.body.unread).toBe(1);
  });

  it("بدون ورود دسترسی ندارد", async () => {
    await request(server).get("/api/notifications").expect(401);
  });
});
