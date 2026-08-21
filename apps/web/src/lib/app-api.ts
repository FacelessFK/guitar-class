/**
 * اندپوینت‌های اپِ پشت لاگین، با تایپ.
 *
 * تایپ‌ها مثل `lib/api.ts` دستی نوشته شده‌اند و از `apps/api` وارد
 * نمی‌شوند: مرز واقعی بین فرانت و بک، همان JSON روی سیم است. وارد کردن
 * تایپ کنترلر یعنی فرانت به Drizzle و کل درخت وابستگی نست گره بخورد.
 *
 * همه‌ی مبالغ رشته‌اند چون در API `bigint` و به ریال‌اند و JSON عدد بزرگ
 * را امن حمل نمی‌کند. تبدیل به تومان فقط در `lib/format.ts`.
 */

import { ApiError, apiFetch } from "./api-client";

// ---------------------------------------------------------------------------
// کاتالوگ (عمومی، ولی از مرورگر خوانده می‌شود)
// ---------------------------------------------------------------------------

export interface Instrument {
  id: string;
  slug: string;
  nameFa: string;
  descriptionFa: string | null;
  iconUrl: string | null;
}

export interface Offering {
  id: string;
  price: string;
  durationMinutes: number;
  instrumentSlug: string;
  instrumentName: string;
}

export interface Teacher {
  profileId: string;
  slug: string;
  fullName: string;
  avatarUrl: string | null;
  headline: string;
  bio: string | null;
  introVideoUrl: string | null;
  yearsExperience: number;
  offerings: Offering[];
}

export const getInstruments = () =>
  apiFetch<{ instruments: Instrument[] }>("/instruments", { anonymous: true }).then(
    (data) => data.instruments,
  );

export const getTeachers = (instrument?: string) =>
  apiFetch<{ teachers: Teacher[] }>("/teachers", {
    anonymous: true,
    query: { instrument },
  }).then((data) => data.teachers);

// ---------------------------------------------------------------------------
// پروفایل خودِ کاربر
// ---------------------------------------------------------------------------

/**
 * ویرایش نام و عکس پروفایل.
 *
 * `avatarObjectKey` **کلید** است نه نشانی؛ نشانی را سرور از روی کلید
 * می‌سازد. `null` صریح یعنی «عکس را بردار» و با نفرستادن فیلد فرق دارد.
 *
 * پس از این باید `loadUser()` صدا زده شود تا نام و عکس در پوسته‌ی اپ
 * هم تازه شوند — پاسخ این درخواست فقط دو فیلد دارد، نه کل نشست.
 */
export const updateOwnProfile = (body: {
  fullName?: string;
  avatarObjectKey?: string | null;
}) =>
  apiFetch<{ fullName: string; avatarUrl: string | null }>("/auth/me", {
    method: "PATCH",
    body,
  });

// ---------------------------------------------------------------------------
// دسترس‌پذیری
// ---------------------------------------------------------------------------

/**
 * یک اسلات آزاد.
 *
 * هم لحظه‌ی مطلق (`startAt`) می‌آید و هم ساعت دیواری تهران
 * (`date` + `startTime`). رزرو با دومی فرستاده می‌شود نه با اولی —
 * سرور تنها جایی است که تبدیل منطقه‌ی زمانی انجام می‌شود.
 */
export interface Slot {
  startAt: string;
  endAt: string;
  date: string;
  startTime: string;
  endTime: string;
  weekday: number;
  weekdayName: string;
}

export interface SlotQuery {
  offeringId: string;
  teacherProfileId: string;
  from: string;
  to: string;
  /** جلسه‌ی معارفه شبکه‌ی ساعت متفاوتی دارد چون ۲۰ دقیقه‌ای است */
  trial?: boolean;
}

export const getSlots = ({ offeringId, trial, ...query }: SlotQuery) =>
  apiFetch<{ slots: Slot[] }>(
    `/offerings/${offeringId}/availability${trial ? "/trial" : ""}`,
    { anonymous: true, query },
  ).then((data) => data.slots);

export interface PackagePreview {
  ok: boolean;
  sessions: Slot[];
  conflicts: Array<{ sessionIndex: number; date: string }>;
}

export const previewPackage = (input: {
  offeringId: string;
  teacherProfileId: string;
  firstSessionDate: string;
  startMinute: number;
}) =>
  apiFetch<PackagePreview>(`/offerings/${input.offeringId}/availability/package-preview`, {
    method: "POST",
    anonymous: true,
    body: {
      teacherProfileId: input.teacherProfileId,
      firstSessionDate: input.firstSessionDate,
      startMinute: input.startMinute,
    },
  });

// ---------------------------------------------------------------------------
// رزرو
// ---------------------------------------------------------------------------

export type BookingStatus =
  | "PENDING_PAYMENT"
  | "CONFIRMED"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "CANCELLED_BY_STUDENT"
  | "CANCELLED_BY_TEACHER"
  | "NO_SHOW_STUDENT"
  | "NO_SHOW_TEACHER"
  | "NO_SHOW"
  | "EXPIRED";

export interface Booking {
  id: string;
  roomId: string;
  type: "TRIAL" | "SINGLE" | "PACKAGE";
  status: BookingStatus;
  scheduledAt: string;
  endsAt: string;
  date: string;
  startTime: string;
  endTime: string;
  weekdayName: string;
  durationMinutes: number;
  holdExpiresAt: string | null;
  price: string;
}

/** همان رزرو، با چیزهایی که فقط در فهرست معنا دارند. */
export interface BookingDetail extends Booking {
  role: "STUDENT" | "TEACHER";
  counterpartName: string;
  teacherSlug: string | null;
  instrumentName: string;
  /** پر بودنش یعنی این جلسه بخشی از یک پکیج است و جدا پرداخت نمی‌شود */
  enrollmentId: string | null;
  sessionIndex: number | null;
  /** هنرجو می‌تواند به این جلسه امتیاز بدهد: تمام‌شده و هنوز نظر نداده */
  canReview: boolean;
}

export interface SlotSelection {
  teacherProfileId: string;
  offeringId: string;
  date: string;
  /** دقیقه از نیمه‌شب به وقت تهران */
  startMinute: number;
}

export const bookTrial = (body: SlotSelection) =>
  apiFetch<Booking>("/bookings/trial", { method: "POST", body });

export const bookSingle = (body: SlotSelection) =>
  apiFetch<Booking>("/bookings/single", { method: "POST", body });

export interface PackageResult {
  enrollmentId: string;
  priceTotal: string;
  bookings: Booking[];
}

export const bookPackage = (body: {
  teacherProfileId: string;
  offeringId: string;
  firstSessionDate: string;
  startMinute: number;
}) => apiFetch<PackageResult>("/bookings/package", { method: "POST", body });

export const getMyBookings = () =>
  apiFetch<{ bookings: BookingDetail[] }>("/bookings/me").then((data) => data.bookings);

export const getBooking = (bookingId: string) =>
  apiFetch<BookingDetail | null>(`/bookings/${bookingId}`);

/**
 * امتیاز و نظر هنرجو به استاد، بسته به یک جلسه‌ی تمام‌شده.
 *
 * `bookingId` می‌رود نه `teacherId`: کدام استاد و آیا این کاربر حق نظر
 * دارد، سرور از روی خود رزرو تصمیم می‌گیرد.
 */
export const submitReview = (body: {
  bookingId: string;
  rating: number;
  comment?: string;
}) => apiFetch<{ id: string }>("/reviews", { method: "POST", body });

export interface CancellationResult {
  status: BookingStatus;
  /** تصمیم سیاست لغو */
  refundable: boolean;
  /** آیا سطر مالی واقعاً نوشته شد */
  refunded: boolean;
  /** مبلغی که همین لحظه به اعتبار رفت، به ریال. تهی یعنی چیزی اضافه نشد. */
  creditGranted: string | null;
}

export const cancelBooking = (bookingId: string, reason?: string) =>
  apiFetch<CancellationResult>(`/bookings/${bookingId}/cancel`, {
    method: "POST",
    body: { ...(reason ? { reason } : {}) },
  });

// ---------------------------------------------------------------------------
// پرداخت
// ---------------------------------------------------------------------------

export interface CheckoutResult {
  orderId: string;
  /** کل مبلغ سفارش، به ریال */
  amount: string;
  /** سهمی که از اعتبار برداشته می‌شود */
  creditApplied: string;
  /** سهمی که به درگاه می‌رود */
  gatewayAmount: string;
  gateway: string | null;
  /**
   * تهی یعنی درگاهی در کار نبود — اعتبار کل مبلغ را پوشاند و سفارش
   * همان‌جا قطعی شد.
   */
  redirectUrl: string | null;
  /** سفارش بدون رفتن به درگاه قطعی شد */
  settled: boolean;
  /** مبلغ کم شد ولی جلسه‌ای قطعی نشد — مهلت رزرو در همان لحظه تمام شده */
  unmatched: boolean;
}

export const startCheckout = (body: {
  bookingId?: string;
  enrollmentId?: string;
  useCredit?: boolean;
}) => apiFetch<CheckoutResult>("/payments/checkout", { method: "POST", body });

// ---------------------------------------------------------------------------
// اعتبار
// ---------------------------------------------------------------------------

export interface CreditEntry {
  reason: "CANCELLATION" | "SPEND" | "ADMIN_ADJUSTMENT";
  /** ریال. مثبت یعنی اعطا، منفی یعنی خرج. */
  amount: string;
  bookingId: string | null;
  description: string;
  createdAt: string;
}

export const getCredit = () =>
  apiFetch<{ balance: string; entries: CreditEntry[] }>("/payments/credit");

export interface Order {
  id: string;
  amount: string;
  /** سهمی که با اعتبار پرداخت شد، به ریال */
  creditApplied: string;
  status: "PENDING" | "PAID" | "FAILED" | "REFUNDED";
  gateway: string;
  refId: string | null;
  paidAt: string | null;
  createdAt: string;
}

export const getOrder = (orderId: string) =>
  apiFetch<Order | null>(`/payments/orders/${orderId}`);

export const getOrders = () =>
  apiFetch<{ orders: Order[] }>("/payments/orders").then((data) => data.orders);

export interface Earnings {
  /** فروش ناخالص — تسویه‌ها در آن نیستند */
  gross: string;
  commission: string;
  /** مانده‌ی پرداختنی. هم‌معنی `outstanding` است و برای سازگاری مانده */
  net: string;
  /** آنچه تا امروز به استاد تعلق گرفته، پیش از کسر تسویه‌ها */
  earned: string;
  /** جمع تسویه‌های انجام‌شده */
  paidOut: string;
  outstanding: string;
  entries: Array<{
    type: "EARNING" | "REFUND" | "PAYOUT" | "ADJUSTMENT";
    gross: string;
    commission: string;
    net: string;
    description: string;
    createdAt: string;
  }>;
}

export const getEarnings = () => apiFetch<Earnings>("/payments/earnings");

// ---------------------------------------------------------------------------
// پنل استاد
// ---------------------------------------------------------------------------

export interface TeacherProfile {
  profileId: string;
  slug: string;
  headline: string;
  bio: string | null;
  introVideoUrl: string | null;
  yearsExperience: number;
  status: "PENDING" | "APPROVED" | "SUSPENDED";
  bufferMinutes: number;
  offerings: Array<{
    id: string;
    instrumentSlug: string;
    instrumentName: string;
    price: string;
    durationMinutes: number;
    isActive: boolean;
  }>;
}

export const getTeacherProfile = () => apiFetch<TeacherProfile>("/teacher/me");

/**
 * درخواست استاد شدن.
 *
 * `slug` اختیاری است؛ نفرستادنش یعنی سرور یکی بسازد. نه وضعیت و نه
 * درصد کمیسیون در این بدنه جا ندارند — سرور هرچه بفرستی دور می‌ریزد و
 * پروفایل همیشه `PENDING` ساخته می‌شود.
 */
export const applyAsTeacher = (body: {
  headline: string;
  bio?: string;
  yearsExperience?: number;
  introVideoUrl?: string;
  slug?: string;
}) => apiFetch<TeacherProfile>("/teacher/apply", { method: "POST", body });

/**
 * ویرایش پروفایل توسط خود استاد.
 *
 * `null` یعنی «پاکش کن» و نبودنِ کلید یعنی «دست نزن» — پس فرم باید فقط
 * فیلدهای عوض‌شده را بفرستد، وگرنه یک فیلد خالی‌مانده چیزی را که در
 * دیتابیس هست پاک می‌کند.
 */
export const updateTeacherProfile = (body: {
  headline?: string;
  bio?: string | null;
  yearsExperience?: number;
  introVideoUrl?: string | null;
  slug?: string;
}) => apiFetch<TeacherProfile>("/teacher/me", { method: "PATCH", body });

export interface ScheduleRule {
  id: string;
  /** شنبه = ۰ ... جمعه = ۶ */
  weekday: number;
  startMinute: number;
  endMinute: number;
  validFrom: string;
  validUntil: string | null;
}

export interface ScheduleException {
  id: string;
  date: string;
  type: "BLOCK" | "EXTRA";
  startMinute: number | null;
  endMinute: number | null;
  reason: string | null;
}

export const getSchedule = () =>
  apiFetch<{ rules: ScheduleRule[]; exceptions: ScheduleException[] }>(
    "/teacher/availability",
  );

export const addRule = (body: {
  weekday: number;
  startMinute: number;
  endMinute: number;
  validFrom: string;
  validUntil?: string | null;
}) => apiFetch<ScheduleRule>("/teacher/availability/rules", { method: "POST", body });

export const removeRule = (ruleId: string) =>
  apiFetch<{ affectedBookings: number }>(`/teacher/availability/rules/${ruleId}`, {
    method: "DELETE",
  });

export const addException = (body: {
  date: string;
  type: "BLOCK" | "EXTRA";
  startMinute?: number | null;
  endMinute?: number | null;
  reason?: string;
}) =>
  apiFetch<ScheduleException>("/teacher/availability/exceptions", {
    method: "POST",
    body,
  });

export const removeException = (exceptionId: string) =>
  apiFetch<{ message: string }>(`/teacher/availability/exceptions/${exceptionId}`, {
    method: "DELETE",
  });

// ---------------------------------------------------------------------------
// اعلان درون‌اپ
// ---------------------------------------------------------------------------

export interface AppNotification {
  id: string;
  type: string;
  /** متن آماده‌ی نمایش — سرور می‌سازدش، نه فرانت */
  message: string;
  /** مسیر درون‌اپ برای رفتن به موضوع اعلان */
  href: string | null;
  bookingId: string | null;
  read: boolean;
  createdAt: string;
}

/**
 * شمارنده‌ی نخوانده‌ها در همان پاسخ فهرست می‌آید.
 *
 * نشانِ زنگ به آن نیاز دارد و درخواست دوم فقط یک رفت‌وبرگشت اضافه روی
 * اینترنتی است که کند است.
 */
export const getNotifications = () =>
  apiFetch<{ notifications: AppNotification[]; unread: number }>("/notifications");

/** `ids` ندهید یعنی «همه را خوانده کن». */
export const markNotificationsRead = (ids?: string[]) =>
  apiFetch<{ updated: number }>("/notifications/read", {
    method: "POST",
    body: ids?.length ? { ids } : {},
  });

// ---------------------------------------------------------------------------
// حلقه‌ی یادگیری
// ---------------------------------------------------------------------------

export type MediaPurpose =
  | "SUBMISSION"
  | "FEEDBACK_VOICE"
  | "ASSIGNMENT_ATTACHMENT"
  | "AVATAR"
  | "POST_COVER";

export interface UploadTicket {
  objectKey: string;
  uploadUrl: string;
  headers: Record<string, string>;
  expiresAt: string;
}

const requestUploadTicket = (body: {
  purpose: MediaPurpose;
  fileName: string;
  contentType: string;
  sizeBytes: number;
}) => apiFetch<UploadTicket>("/media/upload-url", { method: "POST", body });

/**
 * فایل را مستقیم به آبجکت‌استوریج می‌فرستد و `objectKey` را برمی‌گرداند.
 *
 * ⚠️ `PUT` با `fetch` خام انجام می‌شود و نه با `apiFetch`: مقصد سرویس
 * ذخیره‌سازی است نه API ما، و فرستادن هدر `Authorization` به آن هم
 * بی‌فایده است و هم امضا را در بعضی سرویس‌ها خراب می‌کند.
 *
 * چیزی که به اندپوینت بعدی داده می‌شود **کلید** است نه نشانی. نشانی را
 * سرور از روی کلید می‌سازد؛ اگر نشانی از اینجا می‌رفت، هر رشته‌ای
 * می‌توانست به‌عنوان فایل ثبت شود.
 */
export async function uploadFile(
  file: File,
  purpose: MediaPurpose,
): Promise<string> {
  const ticket = await requestUploadTicket({
    purpose,
    fileName: file.name,
    contentType: file.type || "application/octet-stream",
    sizeBytes: file.size,
  });

  const response = await fetch(ticket.uploadUrl, {
    method: "PUT",
    headers: ticket.headers,
    body: file,
  });

  if (!response.ok) {
    throw new ApiError(
      response.status,
      "UPLOAD_FAILED",
      "ارسال فایل ناموفق بود. اتصال اینترنت را بررسی کنید و دوباره تلاش کنید.",
    );
  }

  return ticket.objectKey;
}

/**
 * مدت یک فایل صوتی یا ویدیویی، به ثانیه.
 *
 * ستون `duration_seconds` و اندپوینتش از روز اول وجود داشتند و همیشه
 * تهی می‌ماندند، چون تنها جایی که این عدد را می‌شود گرفت همین‌جاست:
 * سرور فایل را نمی‌بیند (آپلود مستقیم به باکت است) و کتابخانه‌ی
 * استخراج متادیتا هم برای عددی که مرورگر رایگان می‌دهد گران است.
 *
 * `null` برمی‌گرداند به‌جای خطا. مدت، آرایش فهرست است نه بخشی از خودِ
 * اجرا؛ فرمتی که مرورگر نمی‌شناسد یا فایل خرابی که متادیتایش خوانده
 * نمی‌شود، نباید جلوی ارسال تمرینِ هنرجو را بگیرد.
 */
export function readMediaDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const element = file.type.startsWith("video/")
      ? document.createElement("video")
      : document.createElement("audio");

    const url = URL.createObjectURL(file);

    // نشانی موقت باید در هر مسیری آزاد شود، وگرنه فایل تا رفرش صفحه در
    // حافظه می‌ماند — و اینجا فایل‌ها ده‌ها مگابایتی‌اند
    const finish = (value: number | null) => {
      URL.revokeObjectURL(url);
      resolve(value);
    };

    element.preload = "metadata";
    element.onloadedmetadata = () => {
      // فایلِ در حال پخشِ زنده یا کانتینرِ بدون مدت، `Infinity` می‌دهد
      finish(Number.isFinite(element.duration) ? Math.round(element.duration) : null);
    };
    element.onerror = () => finish(null);
    element.src = url;
  });
}

export interface Feedback {
  content: string | null;
  voiceNoteUrl: string | null;
  /** صدا طبق سیاست نگه‌داری پاک شده — نشانی هست ولی فایل نیست */
  voicePurged: boolean;
  createdAt: string;
}

export interface Submission {
  id: string;
  mediaUrl: string;
  mediaType: "AUDIO" | "VIDEO";
  durationSeconds: number | null;
  sizeBytes: string | null;
  /**
   * فایل طبق سیاست نگه‌داری پاک شده.
   *
   * نشانی همچنان پر است، پس نبودِ فایل از روی آن معلوم نمی‌شود و باید
   * صریح پرسیده شود — وگرنه کاربر پخش‌کننده‌ی خراب می‌بیند.
   */
  mediaPurged: boolean;
  createdAt: string;
  feedback: Feedback | null;
}

export interface Assignment {
  id: string;
  title: string;
  description: string | null;
  attachments: Array<{ url: string; name: string }>;
  dueDate: string | null;
  status: "ASSIGNED" | "SUBMITTED" | "REVIEWED";
  createdAt: string;
  submissions: Submission[];
}

export interface SessionLearning {
  bookingId: string;
  role: "STUDENT" | "TEACHER";
  /** جلسه به مرحله‌ی ثبت نکات رسیده یا هنوز برگزار نشده */
  teachable: boolean;
  note: { content: string; updatedAt: string } | null;
  assignments: Assignment[];
}

export const getSessionLearning = (bookingId: string) =>
  apiFetch<SessionLearning>(`/bookings/${bookingId}/learning`);

export const writeSessionNote = (bookingId: string, content: string) =>
  apiFetch<{ content: string; updatedAt: string }>(`/bookings/${bookingId}/notes`, {
    method: "PUT",
    body: { content },
  });

export const createAssignment = (
  bookingId: string,
  body: {
    title: string;
    description?: string;
    dueDate?: string;
    attachments?: Array<{ objectKey: string; name: string }>;
  },
) => apiFetch<Assignment>(`/bookings/${bookingId}/assignments`, {
  method: "POST",
  body,
});

export const updateAssignment = (
  assignmentId: string,
  body: {
    title?: string;
    description?: string | null;
    dueDate?: string | null;
  },
) => apiFetch<Assignment>(`/assignments/${assignmentId}`, { method: "PATCH", body });

/** تمرین را با اجراها، بازخوردها و فایل‌هایشان می‌برد. */
export const deleteAssignment = (assignmentId: string) =>
  apiFetch<void>(`/assignments/${assignmentId}`, { method: "DELETE" });

/** پیوست شناسه‌ی خودش را ندارد، پس با نشانی‌اش شناسایی می‌شود. */
export const deleteAttachment = (assignmentId: string, url: string) =>
  apiFetch<Assignment>(`/assignments/${assignmentId}/attachments`, {
    method: "DELETE",
    body: { url },
  });

export const createSubmission = (
  assignmentId: string,
  body: { objectKey: string; durationSeconds?: number },
) => apiFetch<Submission>(`/assignments/${assignmentId}/submissions`, {
  method: "POST",
  body,
});

/** فقط تا وقتی بازخورد نگرفته — بعد از آن سرور ۴۰۹ می‌دهد. */
export const deleteSubmission = (submissionId: string) =>
  apiFetch<void>(`/submissions/${submissionId}`, { method: "DELETE" });

export const writeFeedback = (
  submissionId: string,
  body: { content?: string; voiceObjectKey?: string },
) => apiFetch<Feedback>(`/submissions/${submissionId}/feedback`, {
  method: "PUT",
  body,
});

export interface PracticeItem extends Assignment {
  bookingId: string;
  scheduledAt: string;
  instrumentName: string;
  counterpartName: string;
}

export const getPractice = () =>
  apiFetch<{ assignments: PracticeItem[] }>("/practice").then(
    (data) => data.assignments,
  );

// ---------------------------------------------------------------------------
// پنل ادمین
// ---------------------------------------------------------------------------

/**
 * همه‌ی این مسیرها پشت `AdminGuard` هستند و برای کاربر غیرادمین **۴۰۳**
 * برمی‌گردانند، نه ۴۰۱ — وگرنه `apiFetch` آن را «نشست تمام شد» می‌خواند
 * و کاربر را از حساب بیرون می‌انداخت.
 */

export type TeacherStatus = "PENDING" | "APPROVED" | "SUSPENDED";
export type SkillLevel = "BEGINNER" | "INTERMEDIATE" | "ADVANCED";

export interface AdminOverview {
  pendingTeachers: number;
  approvedTeachers: number;
  activeInstruments: number;
  upcomingBookings: number;
  pendingPayouts: number;
  openReviews: number;
  outstandingTotal: string;
}

export const getAdminOverview = () => apiFetch<AdminOverview>("/admin/overview");

export interface AdminTeacher {
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

export interface AdminTeacherDetail extends AdminTeacher {
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

export const getAdminTeachers = (status?: TeacherStatus) =>
  apiFetch<{ teachers: AdminTeacher[] }>("/admin/teachers", {
    query: { status },
  }).then((data) => data.teachers);

export const getAdminTeacher = (profileId: string) =>
  apiFetch<AdminTeacherDetail>(`/admin/teachers/${profileId}`);

export const updateAdminTeacher = (
  profileId: string,
  body: {
    status?: TeacherStatus;
    commissionRate?: string;
    bufferMinutes?: number;
    slug?: string;
  },
) => apiFetch<AdminTeacherDetail>(`/admin/teachers/${profileId}`, {
  method: "PATCH",
  body,
});

export interface AdminInstrument {
  id: string;
  slug: string;
  nameFa: string;
  descriptionFa: string | null;
  iconUrl: string | null;
  sortOrder: number;
  isActive: boolean;
  offeringCount: number;
}

export const getAdminInstruments = () =>
  apiFetch<{ instruments: AdminInstrument[] }>("/admin/instruments").then(
    (data) => data.instruments,
  );

export const createInstrument = (body: {
  slug: string;
  nameFa: string;
  descriptionFa?: string;
  sortOrder?: number;
}) => apiFetch<AdminInstrument>("/admin/instruments", { method: "POST", body });

export const updateInstrument = (
  instrumentId: string,
  body: {
    slug?: string;
    nameFa?: string;
    descriptionFa?: string | null;
    sortOrder?: number;
    isActive?: boolean;
  },
) => apiFetch<AdminInstrument>(`/admin/instruments/${instrumentId}`, {
  method: "PATCH",
  body,
});

/** مبلغ رشته و به ریال است — هیچ محاسبه‌ی پولی در فرانت انجام نمی‌شود. */
export const createOffering = (
  profileId: string,
  body: {
    instrumentId: string;
    price: string;
    durationMinutes?: number;
    levels?: SkillLevel[];
  },
) => apiFetch<AdminTeacherDetail>(`/admin/teachers/${profileId}/offerings`, {
  method: "POST",
  body,
});

export const updateOffering = (
  offeringId: string,
  body: {
    price?: string;
    durationMinutes?: number;
    levels?: SkillLevel[];
    isActive?: boolean;
  },
) => apiFetch<AdminTeacherDetail>(`/admin/offerings/${offeringId}`, {
  method: "PATCH",
  body,
});

export interface AdminBooking {
  id: string;
  type: "TRIAL" | "SINGLE" | "PACKAGE";
  status: BookingStatus;
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
  /** پرونده‌ی بررسیِ باز، اگر این جلسه داشته باشد */
  openReviewId: string | null;
}

/**
 * فهرست‌های رشدکننده‌ی پنل ادمین صفحه‌بندی دارند.
 *
 * `total` کل سطرهای منطبق با فیلتر است، نه طول این صفحه — بدون آن،
 * صفحه نمی‌داند صفحه‌ی بعدی وجود دارد یا نه.
 */
export interface AdminPage<T> {
  rows: T[];
  total: number;
  limit: number;
  offset: number;
}

/**
 * `type` است و نه `interface`، و این عمدی است.
 *
 * `apiFetch` پارامترهای کوئری را `Record<string, …>` می‌گیرد، و
 * تایپ‌اسکریپت فقط به **type alias**ها ایندکس‌سیگنچر ضمنی می‌دهد نه به
 * اینترفیس‌ها. با `interface`، هر صدازننده‌ای که این را با فیلترش ترکیب
 * کند خطای «Index signature is missing» می‌گیرد.
 */
export type PageQuery = {
  limit?: number;
  offset?: number;
};

export const ADMIN_PAGE_SIZE = 50;

export const getAdminBookings = (
  filter: {
    /** چند وضعیت با کاما */
    status?: string;
    teacherProfileId?: string;
    from?: string;
    to?: string;
  } & PageQuery,
) =>
  apiFetch<{ bookings: AdminBooking[] } & Omit<AdminPage<never>, "rows">>(
    "/admin/bookings",
    { query: filter },
  ).then(({ bookings, ...page }) => ({ rows: bookings, ...page }));

export interface AdminOrder {
  id: string;
  amount: string;
  status: "PENDING" | "PAID" | "FAILED" | "REFUNDED";
  gateway: string;
  refId: string | null;
  paidAt: string | null;
  createdAt: string;
  studentName: string;
  studentPhone: string;
}

export const getAdminOrders = (query: { status?: string } & PageQuery = {}) =>
  apiFetch<{ orders: AdminOrder[] } & Omit<AdminPage<never>, "rows">>("/admin/orders", {
    query,
  }).then(({ orders, ...page }) => ({ rows: orders, ...page }));

export interface AdminPayout {
  id: string;
  teacherProfileId: string;
  teacherName: string;
  periodStart: string;
  periodEnd: string;
  amount: string;
  status: "PENDING" | "PAID";
  paidAt: string | null;
  trackingCode: string | null;
  note: string | null;
  createdAt: string;
}

export const getAdminPayouts = (
  query: { teacherProfileId?: string } & PageQuery = {},
) =>
  apiFetch<{ payouts: AdminPayout[] } & Omit<AdminPage<never>, "rows">>(
    "/admin/payouts",
    { query },
  ).then(({ payouts, ...page }) => ({ rows: payouts, ...page }));

export const createPayout = (body: {
  teacherProfileId: string;
  periodStart: string;
  periodEnd: string;
  amount: string;
  note?: string;
}) => apiFetch<AdminPayout>("/admin/payouts", { method: "POST", body });

/** پول واقعاً رفت — سطر منفی در دفتر کل همین‌جا نوشته می‌شود. */
export const markPayoutPaid = (payoutId: string, trackingCode?: string) =>
  apiFetch<AdminPayout>(`/admin/payouts/${payoutId}/paid`, {
    method: "POST",
    body: { ...(trackingCode ? { trackingCode } : {}) },
  });

export type PostStatus = "DRAFT" | "PUBLISHED";

export interface AdminPostSummary {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  coverUrl: string | null;
  authorName: string;
  instrumentSlug: string | null;
  instrumentName: string | null;
  publishedAt: string | null;
  status: PostStatus;
}

export interface AdminPostDetail extends AdminPostSummary {
  content: string;
  updatedAt: string;
  instrumentId: string | null;
}

export const getAdminPosts = (query: { status?: PostStatus } & PageQuery = {}) =>
  apiFetch<{ posts: AdminPostSummary[] } & Omit<AdminPage<never>, "rows">>(
    "/admin/posts",
    { query },
  ).then(({ posts, ...page }) => ({ rows: posts, ...page }));

export const getAdminPost = (postId: string) =>
  apiFetch<AdminPostDetail>(`/admin/posts/${postId}`);

export interface PostBody {
  slug: string;
  title: string;
  excerpt: string;
  content: string;
  instrumentId?: string | null;
  /** کلید آبجکت، نه نشانی — سرور نشانی را از روی کلید می‌سازد */
  coverObjectKey?: string | null;
  status?: PostStatus;
}

export const createPost = (body: PostBody) =>
  apiFetch<AdminPostDetail>("/admin/posts", { method: "POST", body });

export const updatePost = (postId: string, body: Partial<PostBody>) =>
  apiFetch<AdminPostDetail>(`/admin/posts/${postId}`, { method: "PATCH", body });

export const deletePost = (postId: string) =>
  apiFetch<void>(`/admin/posts/${postId}`, { method: "DELETE" });

export type SessionReviewReason =
  | "NO_SHOW_TEACHER"
  | "NO_SHOW"
  /** حضور فقط گزارش مرورگر بوده و سرور جیتسی تأییدش نکرده — پول جابه‌جا نشده */
  | "ATTENDANCE_UNVERIFIED";
export type SessionReviewStatus = "OPEN" | "RESOLVED";

export interface AdminReview {
  id: string;
  bookingId: string;
  reason: SessionReviewReason;
  status: SessionReviewStatus;
  resolution: string | null;
  resolvedByName: string | null;
  resolvedAt: string | null;
  createdAt: string;
  bookingStatus: BookingStatus;
  scheduledAt: string;
  durationMinutes: number;
  price: string;
  studentName: string;
  studentPhone: string;
  teacherName: string;
  teacherPhone: string;
  teacherProfileId: string | null;
  instrumentName: string;
}

/** پیش‌فرض سمت سرور `OPEN` است — صف، فهرست کارِ مانده است. */
export const getAdminReviews = (
  query: { status?: SessionReviewStatus } & PageQuery = {},
) =>
  apiFetch<{ reviews: AdminReview[] } & Omit<AdminPage<never>, "rows">>(
    "/admin/reviews",
    { query },
  ).then(({ reviews, ...page }) => ({ rows: reviews, ...page }));

export const resolveReview = (reviewId: string, resolution?: string) =>
  apiFetch<AdminReview>(`/admin/reviews/${reviewId}/resolve`, {
    method: "POST",
    body: { ...(resolution ? { resolution } : {}) },
  });

// ---------------------------------------------------------------------------
// اتاق کلاس
// ---------------------------------------------------------------------------

/**
 * بلیت ورود به کلاس.
 *
 * ⚠️ `config` باید **عیناً** به `configOverwrite` داده شود. این پروفایل
 * «حالت موسیقی» است و پردازش‌های صوتی گفتارمحور جیتسی را خاموش می‌کند؛
 * دست بردن در آن کیفیت صدای ساز را خراب می‌کند. سمت سرور تولید می‌شود
 * تا در ارتقای بعدی جیتسی یک جا اصلاح شود.
 */
export interface JoinTicket {
  domain: string;
  roomName: string;
  jwt: string;
  expiresAt: string;
  moderator: boolean;
  config: Record<string, unknown>;
}

export const joinClassroom = (bookingId: string) =>
  apiFetch<JoinTicket>(`/bookings/${bookingId}/join`, { method: "POST" });

export const reportAttendance = (bookingId: string, event: "JOINED" | "LEFT") =>
  apiFetch<{ status: BookingStatus }>(`/bookings/${bookingId}/attendance`, {
    method: "POST",
    body: { event },
  });
