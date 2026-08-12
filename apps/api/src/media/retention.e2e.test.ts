import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { fromTehranWallClock } from "@music/shared";

import { db } from "../db/client.js";
import {
  assignments,
  bookings,
  feedbacks,
  recordings,
  submissions,
} from "../db/schema/index.js";
import { createSingleBooking } from "../booking/booking.service.js";
import {
  closeDatabase,
  resetDatabase,
  resetRedis,
  seedFixture,
  type Fixture,
} from "../test/fixtures.js";
import { runRetention, submissionRetentionDays } from "./retention.service.js";
import {
  InMemoryObjectStorage,
  setObjectStorage,
  type ObjectStorage,
  type UploadRequest,
  type UploadTicket,
} from "./storage.port.js";

/**
 * سیاست نگه‌داری فایل، روی پستگرس واقعی.
 *
 * چیزی که اینجا اثبات می‌شود این است که **فایل می‌رود و سطر می‌ماند**.
 * حذف سطر ساده‌تر بود ولی تاریخچه‌ی یادگیری را سوراخ می‌کند، و تفاوتش
 * فقط با نگاه کردن به جدول بعد از اجرا معلوم می‌شود.
 */

const SATURDAY = "2026-08-15";
const NOW = new Date("2026-08-01T00:00:00Z");
const DAY_MS = 24 * 60 * 60_000;

let fixture: Fixture;
let storage: InMemoryObjectStorage;

beforeEach(async () => {
  await resetDatabase();
  await resetRedis();
  fixture = await seedFixture();

  storage = new InMemoryObjectStorage("http://localhost:4000/api");
  setObjectStorage(storage);
});

afterAll(async () => {
  await closeDatabase();
});

// ---------------------------------------------------------------------------

async function makeAssignment(): Promise<string> {
  const booking = await createSingleBooking({
    studentId: fixture.studentId,
    teacherProfileId: fixture.teacherProfileId,
    offeringId: fixture.offeringId,
    scheduledAt: fromTehranWallClock(SATURDAY, 17 * 60),
    now: NOW,
  });

  await db.update(bookings).set({ status: "COMPLETED" }).where(eq(bookings.id, booking.id));

  const [assignment] = await db
    .insert(assignments)
    .values({ bookingId: booking.id, title: "تمرین آرپژ" })
    .returning({ id: assignments.id });

  return assignment!.id;
}

/** یک اجرا با فایل واقعی در ذخیره‌سازی، به سن دلخواه. */
async function makeSubmission(ageDays: number): Promise<{ id: string; objectKey: string }> {
  const assignmentId = await makeAssignment();
  const objectKey = `submissions/2026-08/${crypto.randomUUID()}.mp3`;

  storage.put(objectKey, Buffer.from("صدای تمرین"), "audio/mpeg");

  const [row] = await db
    .insert(submissions)
    .values({
      assignmentId,
      studentId: fixture.studentId,
      mediaUrl: storage.publicUrlFor(objectKey),
      objectKey,
      mediaType: "AUDIO",
      createdAt: new Date(Date.now() - ageDays * DAY_MS),
    })
    .returning({ id: submissions.id });

  return { id: row!.id, objectKey };
}

const rowOf = async (id: string) =>
  (await db.select().from(submissions).where(eq(submissions.id, id)))[0];

// ---------------------------------------------------------------------------

describe("پاک‌سازی اجراهای هنرجو", () => {
  const expired = () => submissionRetentionDays() + 10;

  it("فایل را پاک می‌کند ولی سطر را نگه می‌دارد", async () => {
    const submission = await makeSubmission(expired());

    const result = await runRetention();

    expect(result.submissions).toBe(1);
    expect(storage.get(submission.objectKey)).toBeNull();

    // سطر باید باشد — حذفش تاریخچه‌ی یادگیری را سوراخ می‌کند
    const row = await rowOf(submission.id);
    expect(row).toBeDefined();
    expect(row!.mediaPurgedAt).not.toBeNull();
    // نشانی هم می‌ماند؛ چیزی که عوض می‌شود فقط «فایل هست یا نه» است
    expect(row!.mediaUrl).not.toBe("");
  });

  it("اجرای تازه را دست نمی‌زند", async () => {
    const submission = await makeSubmission(3);

    const result = await runRetention();

    expect(result.submissions).toBe(0);
    expect(storage.get(submission.objectKey)).not.toBeNull();
    expect((await rowOf(submission.id))!.mediaPurgedAt).toBeNull();
  });

  /** جارو هر شب اجرا می‌شود؛ اجرای دوم نباید دوباره کار کند. */
  it("اجرای دوباره چیزی را دوباره پاک نمی‌کند", async () => {
    await makeSubmission(expired());

    expect((await runRetention()).submissions).toBe(1);
    expect((await runRetention()).submissions).toBe(0);
  });

  /**
   * مهم‌ترین تست این فایل.
   *
   * اگر سطر پیش از رفتنِ واقعیِ فایل علامت بخورد، آن فایل تا ابد در
   * باکت می‌ماند و هیچ اجرای بعدی‌ای سراغش نمی‌رود — دقیقاً همان هزینه‌ی
   * خطیِ بی‌پایانی که این جارو برای جلوگیری از آن ساخته شد، فقط
   * نامرئی‌تر.
   */
  it("اگر حذف شکست بخورد، سطر را علامت نمی‌زند", async () => {
    const submission = await makeSubmission(expired());

    setObjectStorage(brokenStorage(storage));

    const result = await runRetention();

    expect(result.submissions).toBe(0);
    expect(result.failed).toBe(1);
    expect((await rowOf(submission.id))!.mediaPurgedAt).toBeNull();

    // شب بعد، با سرویس سالم، دوباره تلاش می‌شود و این بار موفق است
    setObjectStorage(storage);
    expect((await runRetention()).submissions).toBe(1);
  });
});

// ---------------------------------------------------------------------------

describe("پاک‌سازی بازخورد صوتی", () => {
  async function makeVoiceFeedback(
    submissionId: string,
    voiceOnly: boolean,
  ): Promise<string> {
    const objectKey = `feedback/2026-08/${crypto.randomUUID()}.m4a`;
    storage.put(objectKey, Buffer.from("بازخورد"), "audio/mp4");

    await db.insert(feedbacks).values({
      submissionId,
      content: voiceOnly ? null : "خوب بود",
      voiceNoteUrl: storage.publicUrlFor(objectKey),
      voiceObjectKey: objectKey,
    });

    return objectKey;
  }

  it("با اجرایی که پاک شده، صدا هم می‌رود", async () => {
    const submission = await makeSubmission(submissionRetentionDays() + 10);
    const voiceKey = await makeVoiceFeedback(submission.id, false);

    const result = await runRetention();

    expect(result.voiceNotes).toBe(1);
    expect(storage.get(voiceKey)).toBeNull();
  });

  it("تا وقتی اجرا زنده است، صدا هم می‌ماند", async () => {
    const submission = await makeSubmission(3);
    const voiceKey = await makeVoiceFeedback(submission.id, false);

    const result = await runRetention();

    expect(result.voiceNotes).toBe(0);
    expect(storage.get(voiceKey)).not.toBeNull();
  });

  /**
   * قید `feedbacks_has_content` می‌گوید بازخورد باید متن یا صدا داشته
   * باشد. اگر پاک‌سازی نشانی را `NULL` می‌کرد، بازخوردِ فقط-صوتی آن قید
   * را می‌شکست و **کل جارو** با خطای دیتابیس می‌خوابید — آن هم ماه‌ها
   * بعد، روی داده‌ای که موقع نوشتن این کد وجود نداشت.
   */
  it("بازخوردِ فقط-صوتی، قید محتوا را نمی‌شکند", async () => {
    const submission = await makeSubmission(submissionRetentionDays() + 10);
    await makeVoiceFeedback(submission.id, true);

    await expect(runRetention()).resolves.toMatchObject({ voiceNotes: 1 });

    const [row] = await db
      .select()
      .from(feedbacks)
      .where(eq(feedbacks.submissionId, submission.id));

    expect(row!.voicePurgedAt).not.toBeNull();
    expect(row!.voiceNoteUrl).not.toBeNull();
    expect(row!.content).toBeNull();
  });
});

// ---------------------------------------------------------------------------

describe("پاک‌سازی ضبط جلسه", () => {
  async function makeRecording(status: "READY" | "EXPIRED", expiresAt: Date) {
    const booking = await createSingleBooking({
      studentId: fixture.studentId,
      teacherProfileId: fixture.teacherProfileId,
      offeringId: fixture.offeringId,
      scheduledAt: fromTehranWallClock(SATURDAY, 17 * 60),
      now: NOW,
    });

    const objectKey = `recordings/2026-08/${crypto.randomUUID()}.mp4`;
    storage.put(objectKey, Buffer.from("ضبط"), "video/mp4");

    const [row] = await db
      .insert(recordings)
      .values({
        bookingId: booking.id,
        url: storage.publicUrlFor(objectKey),
        objectKey,
        type: "VIDEO",
        status,
        expiresAt,
      })
      .returning({ id: recordings.id });

    return { id: row!.id, objectKey };
  }

  it("ضبط منقضی را پاک و EXPIRED می‌کند", async () => {
    const recording = await makeRecording("READY", new Date(Date.now() - DAY_MS));

    const result = await runRetention();

    expect(result.recordings).toBe(1);
    expect(storage.get(recording.objectKey)).toBeNull();

    const [row] = await db.select().from(recordings).where(eq(recordings.id, recording.id));
    expect(row!.status).toBe("EXPIRED");
  });

  it("ضبطی که هنوز منقضی نشده را دست نمی‌زند", async () => {
    const recording = await makeRecording("READY", new Date(Date.now() + 30 * DAY_MS));

    expect((await runRetention()).recordings).toBe(0);
    expect(storage.get(recording.objectKey)).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------

/** ذخیره‌سازی‌ای که حذفش همیشه شکست می‌خورد — برای آزمودن مسیر خطا. */
function brokenStorage(inner: InMemoryObjectStorage): ObjectStorage {
  return {
    name: "broken",
    createUploadTicket: (request: UploadRequest): UploadTicket =>
      inner.createUploadTicket(request),
    publicUrlFor: (objectKey: string) => inner.publicUrlFor(objectKey),
    deleteObject: () => Promise.reject(new Error("سرویس در دسترس نیست")),
  };
}
