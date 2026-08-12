/**
 * حلقه‌ی یادگیری: نکات جلسه ← برنامه‌ی تمرین ← اجرای هنرجو ← بازخورد.
 *
 * سند معماری این را «آن چیزی که پلتفرم را از یک لینک جیتسی متمایز
 * می‌کند» می‌نامد و پاسخ اصلی به ریسک خروج استاد و هنرجو از پلتفرم
 * می‌داند. جدول‌هایش از روز اول ساخته شده بودند و هیچ ماژولی نداشتند.
 *
 * سه قاعده در کل این فایل:
 *
 *   ۱. **دسترسی از روی رزرو تعیین می‌شود، نه از ورودی.** هر مسیر با
 *      شناسه‌ی جلسه یا تمرین شروع می‌شود و نقش کاربر از `bookings`
 *      خوانده می‌شود. هیچ‌جا `teacherId` یا `studentId` از کلاینت
 *      گرفته نمی‌شود — دقیقاً همان قاعده‌ای که پنل استاد رویش بنا شده.
 *
 *   ۲. **نشانی فایل از بلیت می‌آید، نه از بدنه.** کلاینت `objectKey`
 *      می‌دهد و ماژول رسانه بررسی می‌کند که همان کاربر آن را گرفته
 *      باشد. رشته‌ی دلخواه هرگز به‌عنوان نشانی فایل ذخیره نمی‌شود.
 *
 *   ۳. **وضعیت تمرین از رویدادها می‌آید، نه از ورودی.** آپلود اجرا آن
 *      را `SUBMITTED` و ثبت بازخورد `REVIEWED` می‌کند. اگر وضعیت
 *      نوشتنی بود، فهرست «منتظر بازخورد» با واقعیت جدا می‌افتاد.
 */

import { asc, desc, eq, inArray, or } from "drizzle-orm";

import { db } from "../db/client.js";
import {
  assignments,
  bookings,
  feedbacks,
  instruments,
  offerings,
  sessionNotes,
  submissions,
  users,
} from "../db/schema/index.js";
import { BookingNotFoundError, NotBookingParticipantError } from "../booking/errors.js";
import { consumeUploadTicket, mediaTypeOf } from "../media/media.service.js";
import {
  AssignmentNotFoundError,
  SessionNotTeachableYetError,
  StudentOnlyActionError,
  SubmissionNotFoundError,
  TeacherOnlyActionError,
} from "./errors.js";

/**
 * وضعیت‌هایی که ثبت نکته و تمرین رویشان معنا دارد.
 *
 * حلقه بعد از کلاس شروع می‌شود. `IN_PROGRESS` هم هست چون استاد ممکن
 * است همان وسط جلسه شروع به نوشتن کند، و حالت‌های عدم حضور چون جلسه‌ای
 * که هنرجو در آن نبوده هم می‌تواند تمرین جبرانی داشته باشد.
 */
const TEACHABLE_STATUSES = [
  "IN_PROGRESS",
  "COMPLETED",
  "NO_SHOW_STUDENT",
  "NO_SHOW_TEACHER",
  "NO_SHOW",
] as const;

interface SessionContext {
  bookingId: string;
  studentId: string;
  teacherUserId: string;
  status: string;
  scheduledAt: Date;
}

/**
 * جلسه را می‌خواند و نقش کاربر را تعیین می‌کند.
 *
 * «وجود ندارد» و «مال تو نیست» دو خطای جدا می‌گیرند ولی هر دو از دید
 * مهاجم یکسان‌اند: شناسه‌ها uuid تصادفی‌اند و پیمایششان عملی نیست، پس
 * تفکیک اینجا چیزی لو نمی‌دهد و در عوض اشکال‌زدایی را ممکن می‌کند.
 */
async function loadSession(
  bookingId: string,
  userId: string,
): Promise<{ session: SessionContext; role: "STUDENT" | "TEACHER" }> {
  const [row] = await db
    .select({
      bookingId: bookings.id,
      studentId: bookings.studentId,
      teacherUserId: bookings.teacherId,
      status: bookings.status,
      scheduledAt: bookings.scheduledAt,
    })
    .from(bookings)
    .where(eq(bookings.id, bookingId))
    .limit(1);

  if (!row) throw new BookingNotFoundError(bookingId);

  if (row.studentId === userId) return { session: row, role: "STUDENT" };
  if (row.teacherUserId === userId) return { session: row, role: "TEACHER" };

  throw new NotBookingParticipantError();
}

async function requireTeacherOfSession(
  bookingId: string,
  userId: string,
): Promise<SessionContext> {
  const { session, role } = await loadSession(bookingId, userId);

  if (role !== "TEACHER") throw new TeacherOnlyActionError();
  if (!TEACHABLE_STATUSES.includes(session.status as (typeof TEACHABLE_STATUSES)[number])) {
    throw new SessionNotTeachableYetError(session.status);
  }

  return session;
}

// ---------------------------------------------------------------------------
// نمای کامل یک جلسه
// ---------------------------------------------------------------------------

export interface FeedbackView {
  content: string | null;
  voiceNoteUrl: string | null;
  createdAt: string;
}

export interface SubmissionView {
  id: string;
  mediaUrl: string;
  mediaType: "AUDIO" | "VIDEO";
  durationSeconds: number | null;
  sizeBytes: string | null;
  createdAt: string;
  feedback: FeedbackView | null;
}

export interface AssignmentView {
  id: string;
  title: string;
  description: string | null;
  attachments: Array<{ url: string; name: string }>;
  dueDate: string | null;
  status: "ASSIGNED" | "SUBMITTED" | "REVIEWED";
  createdAt: string;
  submissions: SubmissionView[];
}

export interface SessionLearningView {
  bookingId: string;
  role: "STUDENT" | "TEACHER";
  /** آیا این جلسه به مرحله‌ی ثبت نکات رسیده است */
  teachable: boolean;
  note: { content: string; updatedAt: string } | null;
  assignments: AssignmentView[];
}

/**
 * کل حلقه‌ی یک جلسه در یک درخواست.
 *
 * سه جدول با هم می‌آیند چون صفحه هر سه را کنار هم نشان می‌دهد و جدا
 * کردنشان فقط سه رفت‌وبرگشت روی اینترنتی می‌سازد که کند است.
 */
export async function getSessionLearning(
  bookingId: string,
  userId: string,
): Promise<SessionLearningView> {
  const { session, role } = await loadSession(bookingId, userId);

  const [note, assignmentRows] = await Promise.all([
    db
      .select({ content: sessionNotes.content, updatedAt: sessionNotes.updatedAt })
      .from(sessionNotes)
      .where(eq(sessionNotes.bookingId, bookingId))
      .limit(1),
    db
      .select()
      .from(assignments)
      .where(eq(assignments.bookingId, bookingId))
      .orderBy(desc(assignments.createdAt)),
  ]);

  return {
    bookingId,
    role,
    teachable: TEACHABLE_STATUSES.includes(
      session.status as (typeof TEACHABLE_STATUSES)[number],
    ),
    note: note[0]
      ? { content: note[0].content, updatedAt: note[0].updatedAt.toISOString() }
      : null,
    assignments: await attachSubmissions(assignmentRows),
  };
}

/**
 * اجراها و بازخوردهایشان را به تمرین‌ها می‌چسباند.
 *
 * با دو کوئری برای کل مجموعه انجام می‌شود، نه یکی به ازای هر تمرین:
 * الگوی N+1 اینجا بی‌صدا رشد می‌کند چون یک جلسه معمولاً یکی دو تمرین
 * دارد و در توسعه هیچ‌وقت به چشم نمی‌آید.
 */
async function attachSubmissions(
  assignmentRows: (typeof assignments.$inferSelect)[],
): Promise<AssignmentView[]> {
  if (assignmentRows.length === 0) return [];

  const submissionRows = await db
    .select()
    .from(submissions)
    .where(
      inArray(
        submissions.assignmentId,
        assignmentRows.map((row) => row.id),
      ),
    )
    .orderBy(asc(submissions.createdAt));

  const feedbackRows = submissionRows.length
    ? await db
        .select()
        .from(feedbacks)
        .where(
          inArray(
            feedbacks.submissionId,
            submissionRows.map((row) => row.id),
          ),
        )
    : [];

  const feedbackBySubmission = new Map(
    feedbackRows.map((row) => [row.submissionId, row]),
  );

  const byAssignment = new Map<string, SubmissionView[]>();
  for (const row of submissionRows) {
    const feedback = feedbackBySubmission.get(row.id);
    const view: SubmissionView = {
      id: row.id,
      mediaUrl: row.mediaUrl,
      mediaType: row.mediaType,
      durationSeconds: row.durationSeconds,
      sizeBytes: row.sizeBytes?.toString() ?? null,
      createdAt: row.createdAt.toISOString(),
      feedback: feedback
        ? {
            content: feedback.content,
            voiceNoteUrl: feedback.voiceNoteUrl,
            createdAt: feedback.createdAt.toISOString(),
          }
        : null,
    };

    const list = byAssignment.get(row.assignmentId);
    if (list) list.push(view);
    else byAssignment.set(row.assignmentId, [view]);
  }

  return assignmentRows.map((row) => ({
    id: row.id,
    title: row.title,
    description: row.description,
    attachments: normalizeAttachments(row.attachments),
    dueDate: row.dueDate,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    submissions: byAssignment.get(row.id) ?? [],
  }));
}

/**
 * `attachments` ستون `jsonb` است و تایپش از دیتابیس `unknown` می‌آید.
 *
 * هرچه شکل درست ندارد دور ریخته می‌شود به‌جای اینکه به فرانت برود:
 * یک سطر قدیمی یا دستکاری‌شده نباید صفحه‌ی تمرین را با خطای رندر
 * بشکند.
 */
function normalizeAttachments(value: unknown): Array<{ url: string; name: string }> {
  if (!Array.isArray(value)) return [];

  return value.flatMap((item) => {
    if (typeof item !== "object" || item === null) return [];
    const candidate = item as { url?: unknown; name?: unknown };
    if (typeof candidate.url !== "string") return [];
    return [{ url: candidate.url, name: String(candidate.name ?? "پیوست") }];
  });
}

// ---------------------------------------------------------------------------
// نکات جلسه
// ---------------------------------------------------------------------------

/**
 * نوشتن یا به‌روزرسانی نکات جلسه.
 *
 * `session_notes.booking_id` یکتاست، پس این یک upsert است نه درج:
 * استاد معمولاً حین کلاس شروع می‌کند و بعد کامل می‌کند، و «نکته‌ی
 * دوم» برای یک جلسه معنایی ندارد.
 */
export async function writeSessionNote(
  bookingId: string,
  userId: string,
  content: string,
): Promise<{ content: string; updatedAt: string }> {
  await requireTeacherOfSession(bookingId, userId);

  const [row] = await db
    .insert(sessionNotes)
    .values({ bookingId, content })
    .onConflictDoUpdate({
      target: sessionNotes.bookingId,
      set: { content, updatedAt: new Date() },
    })
    .returning({ content: sessionNotes.content, updatedAt: sessionNotes.updatedAt });

  return { content: row!.content, updatedAt: row!.updatedAt.toISOString() };
}

// ---------------------------------------------------------------------------
// تمرین
// ---------------------------------------------------------------------------

export interface CreateAssignmentInput {
  title: string;
  description: string | null;
  dueDate: string | null;
  /** کلیدهای آبجکتی که همین استاد بلیتشان را گرفته */
  attachmentKeys: Array<{ objectKey: string; name: string }>;
}

export async function createAssignment(
  bookingId: string,
  userId: string,
  input: CreateAssignmentInput,
): Promise<AssignmentView> {
  await requireTeacherOfSession(bookingId, userId);

  // نشانی هر پیوست از بلیت درمی‌آید، نه از بدنه‌ی درخواست
  const attachments: Array<{ url: string; name: string }> = [];
  for (const attachment of input.attachmentKeys) {
    const { url } = await consumeUploadTicket(
      attachment.objectKey,
      userId,
      "ASSIGNMENT_ATTACHMENT",
    );
    attachments.push({ url, name: attachment.name });
  }

  const [created] = await db
    .insert(assignments)
    .values({
      bookingId,
      title: input.title,
      description: input.description,
      dueDate: input.dueDate,
      attachments,
    })
    .returning();

  return (await attachSubmissions([created!]))[0]!;
}

export interface UpdateAssignmentInput {
  title?: string;
  description?: string | null;
  dueDate?: string | null;
}

export async function updateAssignment(
  assignmentId: string,
  userId: string,
  input: UpdateAssignmentInput,
): Promise<AssignmentView> {
  const assignment = await requireAssignment(assignmentId);
  await requireTeacherOfSession(assignment.bookingId, userId);

  if (Object.keys(input).length > 0) {
    await db.update(assignments).set(input).where(eq(assignments.id, assignmentId));
  }

  return (await attachSubmissions([await requireAssignment(assignmentId)]))[0]!;
}

async function requireAssignment(
  assignmentId: string,
): Promise<typeof assignments.$inferSelect> {
  const [row] = await db
    .select()
    .from(assignments)
    .where(eq(assignments.id, assignmentId))
    .limit(1);

  if (!row) throw new AssignmentNotFoundError();

  return row;
}

// ---------------------------------------------------------------------------
// اجرای هنرجو
// ---------------------------------------------------------------------------

export interface CreateSubmissionInput {
  objectKey: string;
  durationSeconds: number | null;
}

/**
 * آپلود اجرای هنرجو.
 *
 * وضعیت تمرین همین‌جا `SUBMITTED` می‌شود. اجرای دوم مجاز است و وضعیت
 * را از `REVIEWED` به `SUBMITTED` برمی‌گرداند: هنرجویی که بعد از
 * بازخورد دوباره تمرین کرده و فرستاده، دوباره منتظر بازخورد است — و
 * فهرست کارهای استاد باید همین را نشان دهد.
 */
export async function createSubmission(
  assignmentId: string,
  userId: string,
  input: CreateSubmissionInput,
): Promise<SubmissionView> {
  const assignment = await requireAssignment(assignmentId);
  const { role } = await loadSession(assignment.bookingId, userId);

  if (role !== "STUDENT") throw new StudentOnlyActionError();

  const { url, contentType } = await consumeUploadTicket(
    input.objectKey,
    userId,
    "SUBMISSION",
  );

  const [created] = await db.transaction(async (tx) => {
    const inserted = await tx
      .insert(submissions)
      .values({
        assignmentId,
        studentId: userId,
        mediaUrl: url,
        mediaType: mediaTypeOf(contentType),
        durationSeconds: input.durationSeconds,
      })
      .returning();

    await tx
      .update(assignments)
      .set({ status: "SUBMITTED" })
      .where(eq(assignments.id, assignmentId));

    return inserted;
  });

  return {
    id: created!.id,
    mediaUrl: created!.mediaUrl,
    mediaType: created!.mediaType,
    durationSeconds: created!.durationSeconds,
    sizeBytes: created!.sizeBytes?.toString() ?? null,
    createdAt: created!.createdAt.toISOString(),
    feedback: null,
  };
}

// ---------------------------------------------------------------------------
// بازخورد
// ---------------------------------------------------------------------------

export interface CreateFeedbackInput {
  content: string | null;
  /** کلید آبجکت بازخورد صوتی */
  voiceObjectKey: string | null;
}

/**
 * بازخورد استاد روی یک اجرا.
 *
 * صوتی و متنی هر دو ممکن‌اند و دستِ‌کم یکی لازم است — قید
 * `feedbacks_has_content` در دیتابیس هم همین را می‌گوید. سند معماری
 * بازخورد صوتی را برای موسیقی طبیعی‌تر و ارزان‌تر می‌داند: سه دقیقه
 * صدا حدود سه مگابایت است و چیزی را منتقل می‌کند که نوشتنش صفحه‌ها
 * طول می‌کشد.
 *
 * upsert است چون `submission_id` یکتاست: استاد بازخوردش را ویرایش
 * می‌کند، دو بازخورد روی یک اجرا نمی‌گذارد.
 */
export async function writeFeedback(
  submissionId: string,
  userId: string,
  input: CreateFeedbackInput,
): Promise<FeedbackView> {
  const [submission] = await db
    .select({ id: submissions.id, bookingId: assignments.bookingId, assignmentId: assignments.id })
    .from(submissions)
    .innerJoin(assignments, eq(submissions.assignmentId, assignments.id))
    .where(eq(submissions.id, submissionId))
    .limit(1);

  if (!submission) throw new SubmissionNotFoundError();

  await requireTeacherOfSession(submission.bookingId, userId);

  const voiceNoteUrl = input.voiceObjectKey
    ? (await consumeUploadTicket(input.voiceObjectKey, userId, "FEEDBACK_VOICE")).url
    : null;

  const [row] = await db.transaction(async (tx) => {
    const upserted = await tx
      .insert(feedbacks)
      .values({ submissionId, content: input.content, voiceNoteUrl })
      .onConflictDoUpdate({
        target: feedbacks.submissionId,
        set: { content: input.content, voiceNoteUrl, updatedAt: new Date() },
      })
      .returning();

    await tx
      .update(assignments)
      .set({ status: "REVIEWED" })
      .where(eq(assignments.id, submission.assignmentId));

    return upserted;
  });

  return {
    content: row!.content,
    voiceNoteUrl: row!.voiceNoteUrl,
    createdAt: row!.createdAt.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// فهرست‌های میان‌جلسه‌ای
// ---------------------------------------------------------------------------

export interface PracticeItem extends AssignmentView {
  bookingId: string;
  scheduledAt: string;
  instrumentName: string;
  counterpartName: string;
}

/**
 * تمرین‌های کاربر در همه‌ی جلسه‌هایش.
 *
 * برای هنرجو «چه باید تمرین کنم» است و برای استاد «چه چیزی منتظر
 * بازخورد من است». یک اندپوینت هر دو را می‌دهد چون داده و دسترسی‌اش
 * یکی است و فقط جهت نگاه فرق می‌کند — همان تصمیمی که برای
 * `bookings/me` گرفته شد.
 */
export async function listPractice(userId: string): Promise<PracticeItem[]> {
  const student = db
    .select({ id: users.id, fullName: users.fullName })
    .from(users)
    .as("student");

  const teacher = db
    .select({ id: users.id, fullName: users.fullName })
    .from(users)
    .as("teacher");

  const rows = await db
    .select({
      assignment: assignments,
      bookingId: bookings.id,
      scheduledAt: bookings.scheduledAt,
      studentId: bookings.studentId,
      instrumentName: instruments.nameFa,
      studentName: student.fullName,
      teacherName: teacher.fullName,
    })
    .from(assignments)
    .innerJoin(bookings, eq(assignments.bookingId, bookings.id))
    .innerJoin(offerings, eq(bookings.offeringId, offerings.id))
    .innerJoin(instruments, eq(offerings.instrumentId, instruments.id))
    .innerJoin(student, eq(bookings.studentId, student.id))
    .innerJoin(teacher, eq(bookings.teacherId, teacher.id))
    // یک شرط برای هر دو نقش: کاربر یا هنرجوی جلسه است یا استادش
    .where(or(eq(bookings.studentId, userId), eq(bookings.teacherId, userId)))
    .orderBy(desc(bookings.scheduledAt))
    .limit(200);

  const views = await attachSubmissions(rows.map((row) => row.assignment));

  return views.map((view, index) => {
    const row = rows[index]!;

    return {
      ...view,
      bookingId: row.bookingId,
      scheduledAt: row.scheduledAt.toISOString(),
      instrumentName: row.instrumentName,
      // «طرف مقابل» یعنی آن یکی؛ کاربر نام خودش را لازم ندارد
      counterpartName:
        row.studentId === userId ? row.teacherName : row.studentName,
    };
  });
}
