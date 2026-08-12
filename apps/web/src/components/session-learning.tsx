"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { errorMessage } from "@/lib/api-client";
import {
  createAssignment,
  createSubmission,
  getSessionLearning,
  uploadFile,
  writeFeedback,
  writeSessionNote,
  type Assignment,
  type SessionLearning,
  type Submission,
} from "@/lib/app-api";
import { faNumber, formatJalaliDate } from "@/lib/format";

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
      <p className="alert-error">{error}</p>
    ) : (
      <p className="text-sm text-ink-muted">در حال بارگذاری…</p>
    );
  }

  const isTeacher = data.role === "TEACHER";

  return (
    <div className="space-y-10">
      {error ? <p className="alert-error">{error}</p> : null}

      {/*
        جلسه‌ی برگزارنشده حلقه ندارد و API هم ثبت روی آن را رد می‌کند.
        گفتنش بهتر از نشان دادن فرمی است که همیشه خطا می‌دهد.
      */}
      {data.teachable ? null : (
        <p className="alert-info">
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
        <h2 className="text-lg font-bold">نکات جلسه</h2>
        {note ? (
          <p className="mt-3 whitespace-pre-line rounded-lg border border-border p-4 text-sm">
            {note.content}
          </p>
        ) : (
          <p className="mt-3 text-sm text-ink-muted">
            استاد هنوز نکته‌ای برای این جلسه ننوشته است.
          </p>
        )}
      </section>
    );
  }

  return (
    <section>
      <h2 className="text-lg font-bold">نکات جلسه</h2>
      <form onSubmit={(event) => void save(event)} className="mt-3 space-y-3">
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
    <section>
      <h2 className="text-lg font-bold">برنامه‌ی تمرین</h2>

      {assignments.length === 0 ? (
        <p className="mt-3 text-sm text-ink-muted">
          {isTeacher
            ? "برای این جلسه هنوز تمرینی تعیین نکرده‌اید."
            : "استاد هنوز تمرینی برای این جلسه تعیین نکرده است."}
        </p>
      ) : (
        <ul className="mt-4 space-y-4">
          {assignments.map((assignment) => (
            <AssignmentCard
              key={assignment.id}
              assignment={assignment}
              isTeacher={isTeacher}
              onChanged={onChanged}
              onError={onError}
            />
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
        <span className={`badge ${badge.tone}`}>{badge.label}</span>
      </div>

      {assignment.description ? (
        <p className="mt-3 whitespace-pre-line text-sm">{assignment.description}</p>
      ) : null}

      {assignment.attachments.length > 0 ? (
        <ul className="mt-3 flex flex-wrap gap-3 text-sm">
          {assignment.attachments.map((attachment) => (
            <li key={attachment.url}>
              <a
                href={attachment.url}
                target="_blank"
                rel="noreferrer noopener"
                className="text-accent underline"
              >
                {attachment.name}
              </a>
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
  return (
    <div className="rounded-lg bg-surface-muted p-4">
      <p className="text-sm text-ink-muted">
        اجرای {formatJalaliDate(submission.createdAt.slice(0, 10))}
        {submission.durationSeconds
          ? ` · ${faNumber(Math.round(submission.durationSeconds))} ثانیه`
          : ""}
      </p>

      {/*
        فایلِ پاک‌شده صریح گفته می‌شود، نه با پخش‌کننده‌ی خراب.
        سطر اجرا برای همیشه می‌ماند ولی فایلش پس از مدت نگه‌داری می‌رود؛
        بدون این پیام، کاربر یک پخش‌کننده‌ی بی‌صدا می‌بیند و آن را باگ
        می‌خواند.
      */}
      {submission.mediaPurged ? (
        <p className="mt-3 rounded-lg bg-surface p-3 text-sm text-ink-muted">
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
      const objectKey = await uploadFile(file, "SUBMISSION");
      await createSubmission(assignmentId, { objectKey });
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
