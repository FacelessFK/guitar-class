"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { errorMessage } from "@/lib/api-client";
import {
  createAssignment,
  createSubmission,
  deleteAssignment,
  deleteAttachment,
  deleteSubmission,
  getSessionLearning,
  readMediaDuration,
  setAssignmentCompletion,
  updateAssignment,
  uploadFile,
  writeFeedback,
  writeSessionNote,
  type Assignment,
  type SessionLearning,
  type Submission,
} from "@/lib/app-api";
import { faNumber, formatJalaliDate } from "@/lib/format";
import { CheckIcon } from "@/components/ui/icons";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * حلقه‌ی یادگیریِ یک جلسه.
 *
 * یک کامپوننت برای هر دو نقش، نه دو تا: داده و دسترسی یکسان‌اند و فقط
 * این فرق می‌کند که چه کسی کجا می‌نویسد. دو نسخه‌ی جدا یعنی هر تغییر
 * در شکل تمرین باید دو بار انجام شود و اولین فراموشی، دو طرفِ یک
 * گفت‌وگو را چیزهای متفاوتی نشان می‌دهد.
 *
 * `role` از خودِ API می‌آید نه از مقایسه‌ی شناسه‌ها در مرورگر — سرور
 * قبلاً می‌داند کاربر کدام طرف است.
 */
export function SessionLearning({ bookingId }: { bookingId: string }) {
  const [data, setData] = useState<SessionLearning | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await getSessionLearning(bookingId));
      setError(null);
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }, [bookingId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (data === null) {
    return error ? (
      <p className="alert-error mt-6">{error}</p>
    ) : (
      <SessionLearningSkeleton />
    );
  }

  const isTeacher = data.role === "TEACHER";

  return (
    <div className="mt-9 md:mt-12">
      {error ? <p className="alert-error mb-6">{error}</p> : null}

      {/*
        جلسه‌ی برگزارنشده حلقه ندارد و API هم ثبت روی آن را رد می‌کند.
        گفتنش بهتر از نشان دادن فرمی است که همیشه خطا می‌دهد.
      */}
      {data.teachable ? null : (
        <p className="notice mb-8">
          نکات جلسه و برنامه‌ی تمرین بعد از برگزاری کلاس ثبت می‌شوند.
        </p>
      )}

      <NoteSection
        bookingId={bookingId}
        note={data.note}
        editable={isTeacher && data.teachable}
        onSaved={load}
        onError={setError}
      />

      <AssignmentsSection
        bookingId={bookingId}
        assignments={data.assignments}
        isTeacher={isTeacher}
        teachable={data.teachable}
        onChanged={load}
        onError={setError}
      />
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="flex items-center gap-2.5 text-[13px] font-medium tracking-[0.08em] text-meta">
      <span className="h-px w-5 bg-wood" />
      {children}
    </h2>
  );
}

function SessionLearningSkeleton() {
  return (
    <div className="mt-10" aria-label="در حال بارگذاری محتوای جلسه">
      <Skeleton className="h-4 w-32" />
      <Skeleton className="mt-5 h-24 w-[62ch] max-w-full" delay={1} />
      <Skeleton className="mt-14 h-4 w-36" />
      <div className="mt-5 space-y-3">
        <Skeleton className="h-44 w-full" />
        <Skeleton className="h-44 w-full" delay={1} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// نکات جلسه
// ---------------------------------------------------------------------------

function NoteSection({
  bookingId,
  note,
  editable,
  onSaved,
  onError,
}: {
  bookingId: string;
  note: SessionLearning["note"];
  editable: boolean;
  onSaved: () => Promise<void>;
  onError: (message: string | null) => void;
}) {
  const [content, setContent] = useState(note?.content ?? "");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setContent(note?.content ?? "");
  }, [note]);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setSaved(false);
    onError(null);

    try {
      await writeSessionNote(bookingId, content.trim());
      await onSaved();
      setSaved(true);
    } catch (caught) {
      onError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  if (!editable) {
    return (
      <section>
        <SectionLabel>خلاصه این جلسه</SectionLabel>
        {note ? (
          <div className="mt-4.5 max-w-[62ch]">
            <p className="whitespace-pre-line text-[17px] leading-[2.05] text-ink">
            {note.content}
            </p>
            <div className="mt-4.5 flex items-center gap-2.5 text-[13.5px] text-meta">
              <span className="h-px w-6 bg-divider" />
              <span>یادداشت استاد</span>
            </div>
          </div>
        ) : (
          <p className="mt-4 max-w-[52ch] text-[15px] leading-[1.95] text-ink-2">
            استاد هنوز نکته‌ای برای این جلسه ننوشته است.
          </p>
        )}
      </section>
    );
  }

  return (
    <section>
      <SectionLabel>خلاصه این جلسه</SectionLabel>
      <form onSubmit={(event) => void save(event)} className="mt-4 space-y-3">
        <textarea
          className="input min-h-32"
          value={content}
          onChange={(event) => {
            setContent(event.target.value);
            setSaved(false);
          }}
          placeholder="چه چیزی کار شد، چه چیزی باید اصلاح شود…"
        />
        <div className="flex items-center gap-3">
          <button
            type="submit"
            className="btn-primary"
            disabled={busy || content.trim().length === 0}
          >
            {busy ? "در حال ذخیره…" : "ذخیره‌ی نکات"}
          </button>
          {saved ? <span className="text-sm text-success">ذخیره شد.</span> : null}
        </div>
      </form>
    </section>
  );
}

// ---------------------------------------------------------------------------
// تمرین‌ها
// ---------------------------------------------------------------------------

const STATUS_BADGE: Record<Assignment["status"], { label: string; tone: string }> = {
  ASSIGNED: { label: "در انتظار اجرا", tone: "badge-wait" },
  SUBMITTED: { label: "منتظر بازخورد", tone: "badge-neutral" },
  REVIEWED: { label: "بازخورد داده شد", tone: "badge-ok" },
};

function AssignmentsSection({
  bookingId,
  assignments,
  isTeacher,
  teachable,
  onChanged,
  onError,
}: {
  bookingId: string;
  assignments: Assignment[];
  isTeacher: boolean;
  teachable: boolean;
  onChanged: () => Promise<void>;
  onError: (message: string | null) => void;
}) {
  return (
    <section className="pt-11 md:pt-16">
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <SectionLabel>تمرین تا جلسه بعد</SectionLabel>
        {!isTeacher && assignments.length > 0 ? (
          <span className="text-[13.5px] text-meta">
            {faNumber(assignments.filter((assignment) => assignment.completedAt).length)} از {faNumber(assignments.length)} تمرین انجام شده
          </span>
        ) : null}
      </div>

      {assignments.length === 0 ? (
        <p className="mt-4 text-[15px] text-ink-2">
          {isTeacher
            ? "برای این جلسه هنوز تمرینی تعیین نکرده‌اید."
            : "استاد هنوز تمرینی برای این جلسه تعیین نکرده است."}
        </p>
      ) : (
        <ul className="mt-5 space-y-3">
          {assignments.map((assignment) => (
            isTeacher ? (
              <AssignmentCard
                key={assignment.id}
                assignment={assignment}
                isTeacher
                onChanged={onChanged}
                onError={onError}
              />
            ) : (
              <StudentAssignmentCard
                key={assignment.id}
                assignment={assignment}
                onChanged={onChanged}
                onError={onError}
              />
            )
          ))}
        </ul>
      )}

      {isTeacher && teachable ? (
        <NewAssignmentForm
          bookingId={bookingId}
          onCreated={onChanged}
          onError={onError}
        />
      ) : null}
    </section>
  );
}

function StudentAssignmentCard({
  assignment,
  onChanged,
  onError,
}: {
  assignment: Assignment;
  onChanged: () => Promise<void>;
  onError: (message: string | null) => void;
}) {
  const [done, setDone] = useState(Boolean(assignment.completedAt));
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setDone(Boolean(assignment.completedAt));
  }, [assignment.completedAt]);

  async function toggle() {
    const next = !done;
    setDone(next);
    setBusy(true);
    onError(null);
    try {
      await setAssignmentCompletion(assignment.id, next);
      await onChanged();
    } catch (caught) {
      setDone(!next);
      onError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  const stateLabel = assignment.status === "REVIEWED"
    ? done ? "بازخورد گرفته · انجام شد" : "بازخورد گرفته"
    : assignment.status === "SUBMITTED"
      ? done ? "ارسال شد · انجام شد" : "ارسال شد"
      : done ? "انجام شد" : "انجام نشده";
  const stateColor = assignment.status === "REVIEWED" || assignment.status === "SUBMITTED"
    ? "text-violet-strong"
    : done ? "text-ok" : "text-meta";

  return (
    <li
      className={`overflow-hidden rounded-panel bg-surface shadow-[inset_0_0_0_1px_var(--color-divider)] ${
        done && assignment.status === "ASSIGNED" ? "opacity-85" : ""
      }`}
    >
      <div className="flex flex-col gap-4 p-4.5 md:flex-row md:items-start md:gap-5.5 md:p-5.5">
        <div className="flex min-w-0 flex-1 items-start gap-2.5 md:gap-3.5">
          <button
            type="button"
            aria-label={done ? `برداشتن علامت انجام‌شده از ${assignment.title}` : `علامت زدن ${assignment.title} به‌عنوان انجام‌شده`}
            aria-pressed={done}
            disabled={busy}
            onClick={() => void toggle()}
            className="-m-2 grid size-11 shrink-0 place-items-center rounded-full disabled:opacity-50"
          >
            <span
              className={`grid size-[22px] place-items-center rounded-full ${
                done
                  ? "bg-ok-surface text-ok shadow-[inset_0_0_0_1px_var(--color-ok)]"
                  : assignment.status === "ASSIGNED"
                    ? "text-transparent shadow-[inset_0_0_0_1px_var(--color-divider-strong)]"
                    : "text-transparent shadow-[inset_0_0_0_1px_var(--color-violet)]"
              }`}
            >
              {done ? <CheckIcon /> : null}
            </span>
          </button>
          <div className="min-w-0 flex-1">
            <h3 className={`text-[16.5px] font-semibold ${done && assignment.status === "ASSIGNED" ? "text-ink-2" : "text-ink"}`}>
              {assignment.title}
            </h3>
            {assignment.description ? (
              <p className="mt-1.5 whitespace-pre-line text-[14.5px] leading-[1.9] text-ink-2">
                {assignment.description}
              </p>
            ) : null}
            {assignment.dueDate ? (
              <p className="notice notice-wood mt-3 text-[13px]">
                مهلت: {formatJalaliDate(assignment.dueDate)}
              </p>
            ) : null}
          </div>
        </div>
        <div className="flex items-center justify-between gap-4 border-t border-divider pt-4 md:w-40 md:flex-col md:items-end md:border-0 md:pt-0 md:text-end">
          <span className={`text-[13px] ${stateColor}`}>{busy ? "در حال ذخیره…" : stateLabel}</span>
        </div>
      </div>

      {assignment.attachments.length > 0 ? (
        <div className="border-t border-divider px-4.5 py-4 md:px-5.5">
          <p className="text-[12.5px] text-meta">منابع تمرین</p>
          <ul className="mt-2 space-y-2 text-sm">
            {assignment.attachments.map((attachment) => (
              <li key={attachment.url} className="min-w-0">
                <a
                  href={attachment.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-block max-w-full break-all py-1"
                >
                  {attachment.name} ←
                </a>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="border-t border-divider bg-surface-2/40 px-4.5 py-4 md:px-5.5">
        {assignment.submissions.length === 0 ? (
          <p className="mb-4 text-[13.5px] text-meta">هنوز اجرایی نفرستاده‌ای.</p>
        ) : (
          <div className="mb-4 space-y-4">
            {assignment.submissions.map((submission) => (
              <SubmissionRow
                key={submission.id}
                submission={submission}
                isTeacher={false}
                onChanged={onChanged}
                onError={onError}
              />
            ))}
          </div>
        )}
        <SubmissionUpload
          assignmentId={assignment.id}
          hasPrevious={assignment.submissions.length > 0}
          onUploaded={onChanged}
          onError={onError}
        />
      </div>
    </li>
  );
}

function AssignmentCard({
  assignment,
  isTeacher,
  onChanged,
  onError,
}: {
  assignment: Assignment;
  isTeacher: boolean;
  onChanged: () => Promise<void>;
  onError: (message: string | null) => void;
}) {
  const badge = STATUS_BADGE[assignment.status];
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    onError(null);
    try {
      await action();
      await onChanged();
    } catch (caught) {
      onError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    /**
     * تأیید می‌گیرد چون برگشت‌ناپذیر است و بیش از چیزی که دیده می‌شود
     * را می‌برد: اجراهای هنرجو و بازخوردها هم با کاسکید می‌روند، و
     * فایل‌هایشان از باکت پاک می‌شوند.
     */
    const count = assignment.submissions.length;
    const warning = count
      ? `\n${faNumber(count)} اجرای هنرجو و بازخوردهایشان هم پاک می‌شوند.`
      : "";

    if (!window.confirm(`تمرین «${assignment.title}» حذف شود؟${warning}`)) return;

    await run(() => deleteAssignment(assignment.id));
  }

  if (editing) {
    return (
      <li className="card">
        <EditAssignmentForm
          assignment={assignment}
          onDone={async (changed) => {
            setEditing(false);
            if (changed) await onChanged();
          }}
          onError={onError}
        />
      </li>
    );
  }

  return (
    <li className="card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-bold">{assignment.title}</p>
          {assignment.dueDate ? (
            <p className="mt-1 text-sm text-ink-muted">
              مهلت: {formatJalaliDate(assignment.dueDate)}
            </p>
          ) : null}
        </div>

        <div className="flex items-center gap-3">
          <span className={`badge ${badge.tone}`}>{badge.label}</span>

          {isTeacher ? (
            <>
              <button
                type="button"
                onClick={() => setEditing(true)}
                disabled={busy}
                className="text-sm text-ink-muted underline"
              >
                ویرایش
              </button>
              <button
                type="button"
                onClick={() => void remove()}
                disabled={busy}
                className="text-sm text-danger underline"
              >
                حذف
              </button>
            </>
          ) : null}
        </div>
      </div>

      {assignment.description ? (
        <p className="mt-3 whitespace-pre-line text-sm">{assignment.description}</p>
      ) : null}

      {assignment.attachments.length > 0 ? (
        <ul className="mt-3 flex flex-wrap gap-3 text-sm">
          {assignment.attachments.map((attachment) => (
            <li key={attachment.url} className="flex items-center gap-2">
              <a
                href={attachment.url}
                target="_blank"
                rel="noreferrer noopener"
                className="text-accent-strong underline"
              >
                {attachment.name}
              </a>
              {isTeacher ? (
                <button
                  type="button"
                  onClick={() =>
                    void run(() => deleteAttachment(assignment.id, attachment.url))
                  }
                  disabled={busy}
                  className="text-xs text-ink-muted underline"
                >
                  حذف
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-4 space-y-4 border-t border-border pt-4">
        {assignment.submissions.length === 0 ? (
          <p className="text-sm text-ink-muted">
            {isTeacher ? "هنوز اجرایی نفرستاده است." : "هنوز اجرایی نفرستاده‌اید."}
          </p>
        ) : (
          assignment.submissions.map((submission) => (
            <SubmissionRow
              key={submission.id}
              submission={submission}
              isTeacher={isTeacher}
              onChanged={onChanged}
              onError={onError}
            />
          ))
        )}

        {isTeacher ? null : (
          <SubmissionUpload
            assignmentId={assignment.id}
            hasPrevious={assignment.submissions.length > 0}
            onUploaded={onChanged}
            onError={onError}
          />
        )}
      </div>
    </li>
  );
}

/**
 * یک اجرا و بازخوردش.
 *
 * پخش‌کننده‌ی بومی مرورگر استفاده می‌شود نه کتابخانه: کاربر ایرانی روی
 * اینترنت کند فایل را دانلود می‌کند و هر کیلوبایت جاوااسکریپت اضافه،
 * تأخیر شنیدن است. `preload="none"` هم به همین دلیل — کلیپ فقط وقتی
 * دانلود شود که کسی واقعاً پخشش کند.
 */
function SubmissionRow({
  submission,
  isTeacher,
  onChanged,
  onError,
}: {
  submission: Submission;
  isTeacher: boolean;
  onChanged: () => Promise<void>;
  onError: (message: string | null) => void;
}) {
  const [busy, setBusy] = useState(false);

  /**
   * حذف فقط برای هنرجو، و فقط تا وقتی بازخورد نگرفته.
   *
   * دکمه پس از آمدن بازخورد هم پنهان می‌شود — سرور ۴۰۹ می‌دهد، ولی
   * دکمه‌ای که همیشه خطا می‌دهد بدتر از دکمه‌ای است که وجود ندارد.
   */
  const canDelete = !isTeacher && !submission.feedback;

  async function remove() {
    if (!window.confirm("این اجرا و فایلش حذف شود؟")) return;

    setBusy(true);
    onError(null);
    try {
      await deleteSubmission(submission.id);
      await onChanged();
    } catch (caught) {
      onError(errorMessage(caught));
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg bg-surface-muted p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-ink-muted">
          اجرای {formatJalaliDate(submission.createdAt.slice(0, 10))}
          {submission.durationSeconds
            ? ` · ${faNumber(Math.round(submission.durationSeconds))} ثانیه`
            : ""}
        </p>

        {canDelete ? (
          <button
            type="button"
            onClick={() => void remove()}
            disabled={busy}
            className="text-xs text-ink-muted underline"
          >
            حذف اجرا
          </button>
        ) : null}
      </div>

      {/*
        فایلِ پاک‌شده صریح گفته می‌شود، نه با پخش‌کننده‌ی خراب.
        سطر اجرا برای همیشه می‌ماند ولی فایلش پس از مدت نگه‌داری می‌رود؛
        بدون این پیام، کاربر یک پخش‌کننده‌ی بی‌صدا می‌بیند و آن را باگ
        می‌خواند.
      */}
      {submission.mediaPurged ? (
        <p className="mt-3 rounded-lg bg-surface-2 p-3 text-sm text-ink-muted">
          فایل این اجرا طبق سیاست نگه‌داری پاک شده است.
        </p>
      ) : submission.mediaType === "VIDEO" ? (
        <video src={submission.mediaUrl} controls preload="none" className="mt-3 w-full rounded-lg" />
      ) : (
        <audio src={submission.mediaUrl} controls preload="none" className="mt-3 w-full" />
      )}

      {submission.feedback ? (
        <div className="mt-4 border-t border-border pt-3">
          <p className="text-sm font-medium">بازخورد استاد</p>
          {submission.feedback.content ? (
            <p className="mt-2 whitespace-pre-line text-sm">
              {submission.feedback.content}
            </p>
          ) : null}
          {submission.feedback.voicePurged ? (
            <p className="mt-2 text-sm text-ink-muted">
              بازخورد صوتی طبق سیاست نگه‌داری پاک شده است.
            </p>
          ) : submission.feedback.voiceNoteUrl ? (
            <audio
              src={submission.feedback.voiceNoteUrl}
              controls
              preload="none"
              className="mt-2 w-full"
            />
          ) : null}
        </div>
      ) : isTeacher ? (
        <FeedbackForm
          submissionId={submission.id}
          onSaved={onChanged}
          onError={onError}
        />
      ) : (
        <p className="mt-3 text-sm text-ink-muted">در انتظار بازخورد استاد.</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// فرم‌ها
// ---------------------------------------------------------------------------

/**
 * ویرایش تمرین.
 *
 * `PATCH /assignments/:id` از فاز قبل وجود داشت و هیچ صفحه‌ای صدایش
 * نمی‌زد: استادی که عنوان را غلط تایپ کرده بود، تنها راهش حذف و ساختن
 * دوباره بود — که اجراهای هنرجو را هم می‌برد.
 *
 * پیوست‌ها اینجا نیستند و جدا حذف می‌شوند: تمرینِ در حال ویرایش
 * نمی‌تواند فایلی را که هنرجو همین حالا دارد دانلود می‌کند، با یک
 * ذخیره‌ی ناخواسته از بین ببرد.
 *
 * فقط فیلدهای **عوض‌شده** فرستاده می‌شوند. فرستادن همه یعنی مقدار
 * تهیِ یک فیلد دست‌نخورده، آن را روی سرور پاک کند.
 */
function EditAssignmentForm({
  assignment,
  onDone,
  onError,
}: {
  assignment: Assignment;
  onDone: (changed: boolean) => Promise<void>;
  onError: (message: string | null) => void;
}) {
  const [title, setTitle] = useState(assignment.title);
  const [description, setDescription] = useState(assignment.description ?? "");
  const [dueDate, setDueDate] = useState(assignment.dueDate ?? "");
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();

    const body: { title?: string; description?: string | null; dueDate?: string | null } =
      {};

    if (title.trim() !== assignment.title) body.title = title.trim();
    if (description.trim() !== (assignment.description ?? "")) {
      // رشته‌ی خالی یعنی «پاکش کن»، و `null` همان را به سرور می‌گوید
      body.description = description.trim() || null;
    }
    if (dueDate !== (assignment.dueDate ?? "")) body.dueDate = dueDate || null;

    if (Object.keys(body).length === 0) {
      await onDone(false);
      return;
    }

    setBusy(true);
    onError(null);

    try {
      await updateAssignment(assignment.id, body);
      await onDone(true);
    } catch (caught) {
      onError(errorMessage(caught));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(event) => void submit(event)} className="space-y-4">
      <div>
        <label className="label" htmlFor={`edit-title-${assignment.id}`}>
          عنوان تمرین
        </label>
        <input
          id={`edit-title-${assignment.id}`}
          className="input"
          value={title}
          maxLength={160}
          onChange={(event) => setTitle(event.target.value)}
          required
        />
      </div>

      <div>
        <label className="label" htmlFor={`edit-description-${assignment.id}`}>
          توضیح
        </label>
        <textarea
          id={`edit-description-${assignment.id}`}
          className="input min-h-24"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
      </div>

      <div>
        <label className="label" htmlFor={`edit-due-${assignment.id}`}>
          مهلت
        </label>
        <input
          id={`edit-due-${assignment.id}`}
          className="input"
          type="date"
          value={dueDate}
          onChange={(event) => setDueDate(event.target.value)}
        />
      </div>

      <div className="flex gap-3">
        <button type="submit" className="btn-primary" disabled={busy}>
          {busy ? "در حال ذخیره…" : "ذخیره"}
        </button>
        <button
          type="button"
          className="btn-secondary"
          disabled={busy}
          onClick={() => void onDone(false)}
        >
          انصراف
        </button>
      </div>
    </form>
  );
}

function NewAssignmentForm({
  bookingId,
  onCreated,
  onError,
}: {
  bookingId: string;
  onCreated: () => Promise<void>;
  onError: (message: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    onError(null);

    try {
      // پیوست‌ها اول آپلود می‌شوند و فقط کلیدشان به API می‌رود
      const files = [...(fileInput.current?.files ?? [])];
      const attachments = [];
      for (const file of files) {
        attachments.push({
          objectKey: await uploadFile(file, "ASSIGNMENT_ATTACHMENT"),
          name: file.name,
        });
      }

      await createAssignment(bookingId, {
        title: title.trim(),
        ...(description.trim() ? { description: description.trim() } : {}),
        ...(dueDate ? { dueDate } : {}),
        ...(attachments.length ? { attachments } : {}),
      });

      setTitle("");
      setDescription("");
      setDueDate("");
      if (fileInput.current) fileInput.current.value = "";
      setOpen(false);
      await onCreated();
    } catch (caught) {
      onError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button type="button" className="btn-secondary mt-4" onClick={() => setOpen(true)}>
        تعیین تمرین تازه
      </button>
    );
  }

  return (
    <form
      onSubmit={(event) => void submit(event)}
      className="mt-6 space-y-4 rounded-lg border border-border p-4"
    >
      <div>
        <label className="label" htmlFor="title">
          عنوان تمرین
        </label>
        <input
          id="title"
          className="input"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="آرپژ ۱-۲-۳"
          required
        />
      </div>

      <div>
        <label className="label" htmlFor="description">
          توضیح
        </label>
        <textarea
          id="description"
          className="input min-h-24"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="هر روز ده دقیقه، آهسته و با مترونوم."
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="dueDate">
            مهلت
          </label>
          <input
            id="dueDate"
            className="input"
            type="date"
            dir="ltr"
            value={dueDate}
            onChange={(event) => setDueDate(event.target.value)}
          />
        </div>

        <div>
          <label className="label" htmlFor="attachments">
            پیوست
          </label>
          <input
            id="attachments"
            ref={fileInput}
            className="input"
            type="file"
            multiple
            accept="audio/*,image/*,application/pdf"
          />
          <p className="mt-2 text-xs text-ink-muted">نت، تبلچر یا نمونه‌ی صوتی.</p>
        </div>
      </div>

      <div className="flex gap-3">
        <button type="submit" className="btn-primary" disabled={busy}>
          {busy ? "در حال ارسال…" : "ثبت تمرین"}
        </button>
        <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>
          انصراف
        </button>
      </div>
    </form>
  );
}

/**
 * آپلود اجرای هنرجو.
 *
 * فایل مستقیم به آبجکت‌استوریج می‌رود و از API عبور نمی‌کند؛ کلیپ
 * موبایلی حدود ۲۰ مگابایت است و روی اینترنت خانگی دقایقی طول می‌کشد.
 * دکمه تا پایان آپلود قفل می‌ماند، وگرنه کاربری که فکر می‌کند چیزی
 * نشده دوباره می‌زند و دو نسخه از یک اجرا ثبت می‌شود.
 */
function SubmissionUpload({
  assignmentId,
  hasPrevious,
  onUploaded,
  onError,
}: {
  assignmentId: string;
  hasPrevious: boolean;
  onUploaded: () => Promise<void>;
  onError: (message: string | null) => void;
}) {
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  async function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setBusy(true);
    onError(null);

    try {
      /**
       * مدت پیش از آپلود خوانده می‌شود، از روی خودِ فایل در مرورگر.
       *
       * تنها جای ممکن همین است: فایل مستقیم به باکت می‌رود و هرگز از
       * سرور عبور نمی‌کند. عدد اختیاری است و شکست خواندنش `null` است،
       * پس ارسال اجرا را متوقف نمی‌کند.
       */
      const durationSeconds = await readMediaDuration(file);
      const objectKey = await uploadFile(file, "SUBMISSION");
      await createSubmission(assignmentId, {
        objectKey,
        ...(durationSeconds === null ? {} : { durationSeconds }),
      });
      await onUploaded();
    } catch (caught) {
      onError(errorMessage(caught));
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  return (
    <div>
      <label className="label" htmlFor={`upload-${assignmentId}`}>
        {hasPrevious ? "ارسال اجرای تازه" : "ارسال اجرای شما"}
      </label>
      <input
        id={`upload-${assignmentId}`}
        ref={fileInput}
        className="input"
        type="file"
        accept="audio/*,video/*"
        disabled={busy}
        onChange={(event) => void handleChange(event)}
      />
      <p className="mt-2 text-xs text-ink-muted">
        {busy
          ? "در حال ارسال… صفحه را نبندید."
          : "یک کلیپ کوتاه از تمرینتان ضبط کنید و بفرستید. صدا کافی است."}
      </p>
    </div>
  );
}

/** بازخورد استاد — متنی، صوتی، یا هر دو. */
function FeedbackForm({
  submissionId,
  onSaved,
  onError,
}: {
  submissionId: string;
  onSaved: () => Promise<void>;
  onError: (message: string | null) => void;
}) {
  const [content, setContent] = useState("");
  const [busy, setBusy] = useState(false);
  const voiceInput = useRef<HTMLInputElement>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    onError(null);

    try {
      const voice = voiceInput.current?.files?.[0];
      const voiceObjectKey = voice
        ? await uploadFile(voice, "FEEDBACK_VOICE")
        : undefined;

      await writeFeedback(submissionId, {
        ...(content.trim() ? { content: content.trim() } : {}),
        ...(voiceObjectKey ? { voiceObjectKey } : {}),
      });

      setContent("");
      if (voiceInput.current) voiceInput.current.value = "";
      await onSaved();
    } catch (caught) {
      onError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(event) => void submit(event)} className="mt-4 space-y-3 border-t border-border pt-3">
      <label className="label" htmlFor={`feedback-${submissionId}`}>
        بازخورد شما
      </label>
      <textarea
        id={`feedback-${submissionId}`}
        className="input min-h-20"
        value={content}
        onChange={(event) => setContent(event.target.value)}
        placeholder="چه چیزی خوب بود، چه چیزی را اصلاح کند…"
      />

      {/*
        بازخورد صوتی برجسته گفته می‌شود چون سند معماری آن را برای موسیقی
        طبیعی‌تر و ارزان‌تر می‌داند: سه دقیقه صدا حدود سه مگابایت است و
        چیزی را منتقل می‌کند که نوشتنش صفحه‌ها طول می‌کشد.
      */}
      <div>
        <label className="label" htmlFor={`voice-${submissionId}`}>
          یا بازخورد صوتی
        </label>
        <input
          id={`voice-${submissionId}`}
          ref={voiceInput}
          className="input"
          type="file"
          accept="audio/*"
        />
        <p className="mt-2 text-xs text-ink-muted">
          برای موسیقی معمولاً گویاتر از متن است — می‌توانید همان لحظه بنوازید و
          نشان دهید.
        </p>
      </div>

      <button type="submit" className="btn-primary" disabled={busy}>
        {busy ? "در حال ارسال…" : "ثبت بازخورد"}
      </button>
    </form>
  );
}
