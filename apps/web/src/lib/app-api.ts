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

import { apiFetch } from "./api-client";

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

export const cancelBooking = (bookingId: string, reason?: string) =>
  apiFetch<{ status: BookingStatus; refundable: boolean; refunded: boolean }>(
    `/bookings/${bookingId}/cancel`,
    { method: "POST", body: { ...(reason ? { reason } : {}) } },
  );

// ---------------------------------------------------------------------------
// پرداخت
// ---------------------------------------------------------------------------

export const startCheckout = (body: { bookingId?: string; enrollmentId?: string }) =>
  apiFetch<{ orderId: string; amount: string; gateway: string; redirectUrl: string }>(
    "/payments/checkout",
    { method: "POST", body },
  );

export interface Order {
  id: string;
  amount: string;
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
  gross: string;
  commission: string;
  net: string;
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
