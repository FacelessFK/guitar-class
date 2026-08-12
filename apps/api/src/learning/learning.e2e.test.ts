import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import type { App } from "supertest/types.js";
import { eq } from "drizzle-orm";

import { AppModule } from "../app.module.js";
import { AuthExceptionFilter } from "../common/auth-exception.filter.js";
import { DomainExceptionFilter } from "../common/domain-exception.filter.js";
import { BigIntSerializationInterceptor } from "../common/serialization.interceptor.js";
import { db } from "../db/client.js";
import { assignments, bookings } from "../db/schema/index.js";
import { InMemoryObjectStorage, setObjectStorage } from "../media/storage.port.js";
import {
  accessTokenFor,
  closeDatabase,
  resetDatabase,
  resetRedis,
  seedFixture,
  type Fixture,
} from "../test/fixtures.js";

/**
 * حلقه‌ی یادگیری.
 *
 * دو چیز محور این فایل است:
 *
 *   ۱. **نقش‌ها.** استاد می‌نویسد، هنرجو آپلود می‌کند، و هیچ‌کدام نمی‌تواند
 *      جای دیگری را بگیرد. شناسه‌ی نقش هیچ‌جا ورودی نیست و از خودِ رزرو
 *      درمی‌آید.
 *   ۲. **نشانی فایل از بلیت می‌آید.** رشته‌ی دلخواه به‌عنوان «اجرای من»
 *      پذیرفته نمی‌شود، حتی اگر کاربر واردشده باشد.
 */

let app: INestApplication;
let server: App;
let fixture: Fixture;
let teacherToken: string;
let studentToken: string;
let otherToken: string;
let bookingId: string;

/** ذخیره‌سازی حافظه‌ای، تا آپلود بدون هیچ حساب ابری اجرا شود. */
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

/**
 * یک جلسه‌ی برگزارشده می‌سازد.
 *
 * حلقه‌ی یادگیری بعد از کلاس شروع می‌شود، پس رزروِ `PENDING_PAYMENT` که
 * سایر تست‌ها می‌سازند اینجا به درد نمی‌خورد و مستقیم `COMPLETED` درج
 * می‌شود.
 */
async function seedCompletedSession(): Promise<string> {
  const scheduledAt = new Date(Date.now() - 3 * 86_400_000);
  const endsAt = new Date(scheduledAt.getTime() + 60 * 60_000);

  const [row] = await db
    .insert(bookings)
    .values({
      studentId: fixture.studentId,
      teacherId: fixture.teacherUserId,
      offeringId: fixture.offeringId,
      type: "SINGLE",
      scheduledAt,
      endsAt,
      durationMinutes: 60,
      status: "COMPLETED",
      priceSnapshot: 3_000_000n,
      commissionSnapshot: "20",
    })
    .returning({ id: bookings.id });

  return row!.id;
}

beforeEach(async () => {
  await resetDatabase();
  await resetRedis();
  fixture = await seedFixture();
  bookingId = await seedCompletedSession();

  [teacherToken, studentToken, otherToken] = await Promise.all([
    accessTokenFor(fixture.teacherUserId),
    accessTokenFor(fixture.studentId),
    accessTokenFor(fixture.otherStudentId),
  ]);
});

afterAll(async () => {
  await app.close();
  await closeDatabase();
});

/** بلیت می‌گیرد، فایل را آپلود می‌کند، و کلید آبجکت را برمی‌گرداند. */
async function upload(
  token: string,
  purpose: string,
  contentType: string,
  fileName = "clip.mp3",
): Promise<string> {
  const ticket = await request(server)
    .post("/api/media/upload-url")
    .set("authorization", `Bearer ${token}`)
    .send({ purpose, fileName, contentType, sizeBytes: 1024 })
    .expect(201);

  const objectKey = ticket.body.objectKey as string;
  storage.put(objectKey, Buffer.from("fake audio"), contentType);

  return objectKey;
}

describe("بلیت آپلود", () => {
  it("کلید غیرقابل حدس و آدرس آپلود می‌دهد", async () => {
    const response = await request(server)
      .post("/api/media/upload-url")
      .set("authorization", `Bearer ${studentToken}`)
      .send({
        purpose: "SUBMISSION",
        fileName: "تمرین اول.mp3",
        contentType: "audio/mpeg",
        sizeBytes: 2_000_000,
      })
      .expect(201);

    expect(response.body.objectKey).toMatch(
      /^submissions\/\d{4}-\d{2}\/[0-9a-f-]{36}\.mp3$/,
    );
    expect(response.body.uploadUrl).toContain(response.body.objectKey);
    expect(response.body.headers["content-type"]).toBe("audio/mpeg");
    // نشانی نهایی برنمی‌گردد — کلاینت باید کلید را بفرستد نه نشانی را
    expect(response.body.publicUrl).toBeUndefined();
  });

  it("نوع فایل نامناسب برای مقصد رد می‌شود", async () => {
    // بازخورد صوتی فقط صداست؛ ویدیو حجمش ده‌ها برابر است
    const response = await request(server)
      .post("/api/media/upload-url")
      .set("authorization", `Bearer ${teacherToken}`)
      .send({
        purpose: "FEEDBACK_VOICE",
        fileName: "clip.mp4",
        contentType: "video/mp4",
        sizeBytes: 1000,
      })
      .expect(415);

    expect(response.body.code).toBe("UNSUPPORTED_MEDIA");
  });

  /**
   * سقف حجم **پیش از** آپلود بررسی می‌شود. بعدش یعنی کاربر صد مگابایت
   * را روی اینترنت خانگی فرستاده و بعد بشنود قبول نیست.
   */
  it("فایل بزرگ‌تر از سقفِ مقصد رد می‌شود", async () => {
    await request(server)
      .post("/api/media/upload-url")
      .set("authorization", `Bearer ${teacherToken}`)
      .send({
        purpose: "FEEDBACK_VOICE",
        fileName: "long.mp3",
        contentType: "audio/mpeg",
        sizeBytes: 50 * 1024 * 1024,
      })
      .expect(415);
  });

  it("بدون ورود صادر نمی‌شود", async () => {
    await request(server)
      .post("/api/media/upload-url")
      .send({
        purpose: "SUBMISSION",
        fileName: "a.mp3",
        contentType: "audio/mpeg",
        sizeBytes: 100,
      })
      .expect(401);
  });

  /**
   * مسیر آپلودِ حالت توسعه واقعاً کار می‌کند.
   *
   * بقیه‌ی تست‌های این فایل میان‌بر می‌زنند و مستقیم در ذخیره‌سازی
   * می‌نویسند، پس هیچ‌کدام این مسیر را نمی‌سنجند — و همین مسیر است که
   * کل حلقه را بدون حساب ابری قابل اجرا می‌کند. شکستن بی‌صدایش یعنی
   * توسعه‌دهنده‌ی بعدی فکر کند آپلود اصلاً پیاده نشده.
   */
  it("آپلود و خواندن در حالت توسعه از سر تا ته کار می‌کند", async () => {
    const ticket = await request(server)
      .post("/api/media/upload-url")
      .set("authorization", `Bearer ${studentToken}`)
      .send({
        purpose: "SUBMISSION",
        fileName: "clip.mp3",
        contentType: "audio/mpeg",
        sizeBytes: 11,
      })
      .expect(201);

    const objectKey = ticket.body.objectKey as string;
    const path = new URL(ticket.body.uploadUrl as string).pathname;

    // آدرس بلیت بدون هدر `Authorization` صدا زده می‌شود — در حالت واقعی
    // هم امضا جای احراز هویت را می‌گیرد
    await request(server)
      .put(path)
      .set("content-type", "audio/mpeg")
      .send(Buffer.from("fake audio"))
      .expect(200);

    const downloaded = await request(server).get(path).expect(200);

    expect(downloaded.headers["content-type"]).toContain("audio/mpeg");
    expect(downloaded.body.toString()).toBe("fake audio");
    expect(storage.get(objectKey)).not.toBeNull();
  });

  it("فایل نبوده در حالت توسعه ۴۰۴ می‌گیرد", async () => {
    await request(server).get("/api/media/dev/submissions/nope.mp3").expect(404);
  });
});

describe("نکات جلسه", () => {
  it("استاد می‌نویسد و هنرجو می‌بیند", async () => {
    await request(server)
      .put(`/api/bookings/${bookingId}/notes`)
      .set("authorization", `Bearer ${teacherToken}`)
      .send({ content: "روی آرپژ دست راست کار شد." })
      .expect(200);

    const seen = await request(server)
      .get(`/api/bookings/${bookingId}/learning`)
      .set("authorization", `Bearer ${studentToken}`)
      .expect(200);

    expect(seen.body.note.content).toBe("روی آرپژ دست راست کار شد.");
    expect(seen.body.role).toBe("STUDENT");
  });

  /** یکی به ازای هر جلسه — نوشتن دوباره ویرایش است، نه سطر تازه. */
  it("نوشتن دوباره جایگزین می‌شود", async () => {
    for (const content of ["نسخه‌ی اول", "نسخه‌ی دوم"]) {
      await request(server)
        .put(`/api/bookings/${bookingId}/notes`)
        .set("authorization", `Bearer ${teacherToken}`)
        .send({ content })
        .expect(200);
    }

    const seen = await request(server)
      .get(`/api/bookings/${bookingId}/learning`)
      .set("authorization", `Bearer ${teacherToken}`)
      .expect(200);

    expect(seen.body.note.content).toBe("نسخه‌ی دوم");
  });

  it("هنرجو نمی‌تواند نکات جلسه‌ی خودش را بنویسد", async () => {
    const response = await request(server)
      .put(`/api/bookings/${bookingId}/notes`)
      .set("authorization", `Bearer ${studentToken}`)
      .send({ content: "خودم می‌نویسم" })
      .expect(403);

    expect(response.body.code).toBe("TEACHER_ONLY");
  });

  it("کسی که طرف این جلسه نیست اصلاً نمی‌بیندش", async () => {
    const response = await request(server)
      .get(`/api/bookings/${bookingId}/learning`)
      .set("authorization", `Bearer ${otherToken}`)
      .expect(403);

    expect(response.body.code).toBe("NOT_PARTICIPANT");
  });

  /**
   * حلقه بعد از کلاس شروع می‌شود. تمرین دادن روی جلسه‌ای که هنوز
   * برگزار نشده تقریباً همیشه یعنی شناسه‌ی اشتباه.
   */
  it("روی جلسه‌ی برگزارنشده ثبت نمی‌شود", async () => {
    await db
      .update(bookings)
      .set({ status: "CONFIRMED" })
      .where(eq(bookings.id, bookingId));

    const response = await request(server)
      .put(`/api/bookings/${bookingId}/notes`)
      .set("authorization", `Bearer ${teacherToken}`)
      .send({ content: "زود است" })
      .expect(409);

    expect(response.body.code).toBe("SESSION_NOT_TEACHABLE");
  });
});

describe("حلقه‌ی کامل: تمرین ← اجرا ← بازخورد", () => {
  it("از تعیین تمرین تا بازخورد صوتی", async () => {
    const attachmentKey = await upload(
      teacherToken,
      "ASSIGNMENT_ATTACHMENT",
      "application/pdf",
      "note.pdf",
    );

    const assignment = await request(server)
      .post(`/api/bookings/${bookingId}/assignments`)
      .set("authorization", `Bearer ${teacherToken}`)
      .send({
        title: "آرپژ ۱-۲-۳",
        description: "هر روز ده دقیقه، آهسته.",
        dueDate: "2026-09-01",
        attachments: [{ objectKey: attachmentKey, name: "نت تمرین" }],
      })
      .expect(201);

    expect(assignment.body.status).toBe("ASSIGNED");
    // نشانی پیوست را سرور از روی کلید ساخته، نه از بدنه
    expect(assignment.body.attachments[0].url).toContain(attachmentKey);
    expect(assignment.body.attachments[0].name).toBe("نت تمرین");

    const submissionKey = await upload(studentToken, "SUBMISSION", "audio/mpeg");

    const submission = await request(server)
      .post(`/api/assignments/${assignment.body.id}/submissions`)
      .set("authorization", `Bearer ${studentToken}`)
      .send({ objectKey: submissionKey, durationSeconds: 95 })
      .expect(201);

    expect(submission.body.mediaType).toBe("AUDIO");
    expect(submission.body.durationSeconds).toBe(95);

    // آپلود اجرا، وضعیت تمرین را جابه‌جا می‌کند
    const [afterSubmit] = await db
      .select({ status: assignments.status })
      .from(assignments)
      .where(eq(assignments.id, assignment.body.id));
    expect(afterSubmit?.status).toBe("SUBMITTED");

    const voiceKey = await upload(teacherToken, "FEEDBACK_VOICE", "audio/mpeg");

    const feedback = await request(server)
      .put(`/api/submissions/${submission.body.id}/feedback`)
      .set("authorization", `Bearer ${teacherToken}`)
      .send({ content: "دست راست بهتر شد.", voiceObjectKey: voiceKey })
      .expect(200);

    expect(feedback.body.content).toBe("دست راست بهتر شد.");
    expect(feedback.body.voiceNoteUrl).toContain(voiceKey);

    const [afterReview] = await db
      .select({ status: assignments.status })
      .from(assignments)
      .where(eq(assignments.id, assignment.body.id));
    expect(afterReview?.status).toBe("REVIEWED");

    // و هنرجو کل حلقه را یکجا می‌بیند
    const seen = await request(server)
      .get(`/api/bookings/${bookingId}/learning`)
      .set("authorization", `Bearer ${studentToken}`)
      .expect(200);

    expect(seen.body.assignments).toHaveLength(1);
    expect(seen.body.assignments[0].submissions).toHaveLength(1);
    expect(seen.body.assignments[0].submissions[0].feedback.content).toBe(
      "دست راست بهتر شد.",
    );
  });

  /**
   * اجرای دوم وضعیت را از `REVIEWED` به `SUBMITTED` برمی‌گرداند:
   * هنرجویی که بعد از بازخورد دوباره فرستاده، دوباره منتظر است و فهرست
   * کارهای استاد باید همین را بگوید.
   */
  it("اجرای دوباره پس از بازخورد، تمرین را به صف برمی‌گرداند", async () => {
    const assignment = await request(server)
      .post(`/api/bookings/${bookingId}/assignments`)
      .set("authorization", `Bearer ${teacherToken}`)
      .send({ title: "تمرین" })
      .expect(201);

    const firstKey = await upload(studentToken, "SUBMISSION", "audio/mpeg");
    const first = await request(server)
      .post(`/api/assignments/${assignment.body.id}/submissions`)
      .set("authorization", `Bearer ${studentToken}`)
      .send({ objectKey: firstKey })
      .expect(201);

    await request(server)
      .put(`/api/submissions/${first.body.id}/feedback`)
      .set("authorization", `Bearer ${teacherToken}`)
      .send({ content: "دوباره تلاش کن" })
      .expect(200);

    const secondKey = await upload(studentToken, "SUBMISSION", "video/mp4", "clip.mp4");
    const second = await request(server)
      .post(`/api/assignments/${assignment.body.id}/submissions`)
      .set("authorization", `Bearer ${studentToken}`)
      .send({ objectKey: secondKey })
      .expect(201);

    expect(second.body.mediaType).toBe("VIDEO");

    const [row] = await db
      .select({ status: assignments.status })
      .from(assignments)
      .where(eq(assignments.id, assignment.body.id));
    expect(row?.status).toBe("SUBMITTED");
  });

  it("بازخورد بدون متن و بدون صدا رد می‌شود", async () => {
    const assignment = await request(server)
      .post(`/api/bookings/${bookingId}/assignments`)
      .set("authorization", `Bearer ${teacherToken}`)
      .send({ title: "تمرین" })
      .expect(201);

    const key = await upload(studentToken, "SUBMISSION", "audio/mpeg");
    const submission = await request(server)
      .post(`/api/assignments/${assignment.body.id}/submissions`)
      .set("authorization", `Bearer ${studentToken}`)
      .send({ objectKey: key })
      .expect(201);

    await request(server)
      .put(`/api/submissions/${submission.body.id}/feedback`)
      .set("authorization", `Bearer ${teacherToken}`)
      .send({})
      .expect(400);
  });
});

describe("مالکیت فایل", () => {
  /**
   * مهم‌ترین تست این فایل.
   *
   * اگر نشانی فایل از بدنه گرفته می‌شد، هر کاربر واردشده‌ای می‌توانست
   * هر رشته‌ای را به‌عنوان «اجرای من» ثبت کند — نشانی فایل کس دیگری،
   * آدرسی بیرونی که محتوایش عوض می‌شود، یا `javascript:` که در صفحه‌ی
   * استاد رندر شود.
   */
  it("کلید ساختگی پذیرفته نمی‌شود", async () => {
    const assignment = await request(server)
      .post(`/api/bookings/${bookingId}/assignments`)
      .set("authorization", `Bearer ${teacherToken}`)
      .send({ title: "تمرین" })
      .expect(201);

    for (const objectKey of [
      "submissions/2026-08/whatever.mp3",
      "javascript:alert(1)",
      "https://evil.example.com/x.mp3",
    ]) {
      const response = await request(server)
        .post(`/api/assignments/${assignment.body.id}/submissions`)
        .set("authorization", `Bearer ${studentToken}`)
        .send({ objectKey })
        .expect(409);

      expect(response.body.code).toBe("MEDIA_TICKET_INVALID");
    }
  });

  it("بلیت کاربر دیگر قابل استفاده نیست", async () => {
    const assignment = await request(server)
      .post(`/api/bookings/${bookingId}/assignments`)
      .set("authorization", `Bearer ${teacherToken}`)
      .send({ title: "تمرین" })
      .expect(201);

    // بلیت را استاد گرفته، هنرجو می‌خواهد مصرفش کند
    const stolen = await upload(teacherToken, "SUBMISSION", "audio/mpeg");

    const response = await request(server)
      .post(`/api/assignments/${assignment.body.id}/submissions`)
      .set("authorization", `Bearer ${studentToken}`)
      .send({ objectKey: stolen })
      .expect(409);

    expect(response.body.code).toBe("MEDIA_TICKET_INVALID");
  });

  /** بلیتی که برای مقصد دیگری صادر شده، اینجا به کار نمی‌آید. */
  it("بلیت با مقصد اشتباه رد می‌شود", async () => {
    const assignment = await request(server)
      .post(`/api/bookings/${bookingId}/assignments`)
      .set("authorization", `Bearer ${teacherToken}`)
      .send({ title: "تمرین" })
      .expect(201);

    const wrongPurpose = await upload(studentToken, "ASSIGNMENT_ATTACHMENT", "audio/mpeg");

    await request(server)
      .post(`/api/assignments/${assignment.body.id}/submissions`)
      .set("authorization", `Bearer ${studentToken}`)
      .send({ objectKey: wrongPurpose })
      .expect(409);
  });

  it("بلیت یک بار بیشتر مصرف نمی‌شود", async () => {
    const assignment = await request(server)
      .post(`/api/bookings/${bookingId}/assignments`)
      .set("authorization", `Bearer ${teacherToken}`)
      .send({ title: "تمرین" })
      .expect(201);

    const key = await upload(studentToken, "SUBMISSION", "audio/mpeg");

    await request(server)
      .post(`/api/assignments/${assignment.body.id}/submissions`)
      .set("authorization", `Bearer ${studentToken}`)
      .send({ objectKey: key })
      .expect(201);

    await request(server)
      .post(`/api/assignments/${assignment.body.id}/submissions`)
      .set("authorization", `Bearer ${studentToken}`)
      .send({ objectKey: key })
      .expect(409);
  });

  it("استاد نمی‌تواند به‌جای هنرجو اجرا بفرستد", async () => {
    const assignment = await request(server)
      .post(`/api/bookings/${bookingId}/assignments`)
      .set("authorization", `Bearer ${teacherToken}`)
      .send({ title: "تمرین" })
      .expect(201);

    const key = await upload(teacherToken, "SUBMISSION", "audio/mpeg");

    const response = await request(server)
      .post(`/api/assignments/${assignment.body.id}/submissions`)
      .set("authorization", `Bearer ${teacherToken}`)
      .send({ objectKey: key })
      .expect(403);

    expect(response.body.code).toBe("STUDENT_ONLY");
  });

  it("هنرجو نمی‌تواند بازخورد بنویسد", async () => {
    const assignment = await request(server)
      .post(`/api/bookings/${bookingId}/assignments`)
      .set("authorization", `Bearer ${teacherToken}`)
      .send({ title: "تمرین" })
      .expect(201);

    const key = await upload(studentToken, "SUBMISSION", "audio/mpeg");
    const submission = await request(server)
      .post(`/api/assignments/${assignment.body.id}/submissions`)
      .set("authorization", `Bearer ${studentToken}`)
      .send({ objectKey: key })
      .expect(201);

    const response = await request(server)
      .put(`/api/submissions/${submission.body.id}/feedback`)
      .set("authorization", `Bearer ${studentToken}`)
      .send({ content: "خودم به خودم" })
      .expect(403);

    expect(response.body.code).toBe("TEACHER_ONLY");
  });
});

describe("GET /api/practice", () => {
  it("هر دو نقش همان تمرین را با طرف مقابلِ درست می‌بینند", async () => {
    await request(server)
      .post(`/api/bookings/${bookingId}/assignments`)
      .set("authorization", `Bearer ${teacherToken}`)
      .send({ title: "آرپژ" })
      .expect(201);

    const forStudent = await request(server)
      .get("/api/practice")
      .set("authorization", `Bearer ${studentToken}`)
      .expect(200);

    expect(forStudent.body.assignments).toHaveLength(1);
    expect(forStudent.body.assignments[0]).toMatchObject({
      title: "آرپژ",
      instrumentName: "گیتار کلاسیک",
      counterpartName: "استاد رضایی",
    });

    const forTeacher = await request(server)
      .get("/api/practice")
      .set("authorization", `Bearer ${teacherToken}`)
      .expect(200);

    expect(forTeacher.body.assignments[0].counterpartName).toBe("هنرجوی الف");
  });

  it("تمرین دیگران را نمی‌دهد", async () => {
    await request(server)
      .post(`/api/bookings/${bookingId}/assignments`)
      .set("authorization", `Bearer ${teacherToken}`)
      .send({ title: "آرپژ" })
      .expect(201);

    const response = await request(server)
      .get("/api/practice")
      .set("authorization", `Bearer ${otherToken}`)
      .expect(200);

    expect(response.body.assignments).toEqual([]);
  });
});
