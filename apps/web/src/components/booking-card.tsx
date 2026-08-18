"use client";

import Link from "next/link";
import { useState } from "react";
import { BUSINESS_RULES, roomState, roomWindow } from "@music/shared";

import { errorMessage } from "@/lib/api-client";
import { cancelBooking, startCheckout, type BookingDetail } from "@/lib/app-api";
import { LIVE_STATUSES, statusDisplay, typeLabel } from "@/lib/booking-display";
import {
  faDigits,
  faNumber,
  formatCountdown,
  formatJalaliDayMonth,
  formatToman,
} from "@/lib/format";
import type { PaymentPlan } from "@/lib/payment-plan";
import { useNow } from "@/lib/use-now";

/**
 * یک کلاس در فهرست.
 *
 * سه کنش ممکن دارد و هر سه شرطی‌اند: پرداخت (وقتی مهلت هنوز نگذشته)،
 * ورود به کلاس (وقتی پنجره‌ی اتاق باز است)، و لغو (وقتی جلسه هنوز
 * برگزار نشده). هیچ‌کدام دکمه‌ی همیشه‌فعالی نیست که بعد از کلیک بگوید
 * «الان نمی‌شود».
 */
export function BookingCard({
  booking,
  paymentPlan,
  creditBalance = null,
  onChange,
}: {
  booking: BookingDetail;
  /** تهی یعنی این کارت کنش پرداختی ندارد — تمام‌شده یا مال استاد است */
  paymentPlan?: PaymentPlan;
  /** موجودی اعتبار هنرجو به ریال؛ صفحه‌ی استاد آن را نمی‌فرستد */
  creditBalance?: bigint | null;
  onChange: () => void;
}) {
  const now = useNow();
  const status = statusDisplay(booking.status, booking.role);

  return (
    <li className="card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-bold">
            {booking.instrumentName} با {booking.counterpartName}
          </h3>
          <p className="mt-1 text-sm text-ink-muted">
            {formatJalaliDayMonth(booking.date)}
            {" · "}
            {faDigits(booking.startTime)} تا {faDigits(booking.endTime)}
            {" · "}
            {typeLabel(booking.type)}
          </p>
        </div>

        <span className={`badge ${status.tone}`}>{status.label}</span>
      </div>

      {booking.status === "PENDING_PAYMENT" ? (
        <PaymentPanel
          booking={booking}
          plan={paymentPlan}
          creditBalance={creditBalance}
          now={now}
          onChange={onChange}
        />
      ) : null}

      {booking.status === "CONFIRMED" || booking.status === "IN_PROGRESS" ? (
        <RoomPanel booking={booking} now={now} />
      ) : null}

      {LIVE_STATUSES.includes(booking.status) ? (
        <CancelPanel booking={booking} now={now} onChange={onChange} />
      ) : null}

      {/*
        پرونده‌ی جلسه — نکات، تمرین و بازخورد.

        فقط روی جلسه‌های برگزارشده می‌آید چون حلقه‌ی یادگیری بعد از کلاس
        شروع می‌شود و API ثبت روی جلسه‌ی برگزارنشده را رد می‌کند. لینک
        دادن به صفحه‌ای که همیشه خالی است، همان اندازه گمراه‌کننده است
        که نبودنش.
      */}
      {SESSION_FILE_STATUSES.includes(booking.status) ? (
        <Link
          href={`/sessions/${booking.id}`}
          className="mt-4 inline-block text-sm text-accent-strong underline"
        >
          نکات جلسه و تمرین‌ها
        </Link>
      ) : null}
    </li>
  );
}

/**
 * وضعیت‌هایی که پرونده‌ی جلسه برایشان معنا دارد.
 *
 * با `TEACHABLE_STATUSES` سمت سرور یکی است. جلسه‌ی لغوشده اینجا نیست:
 * کلاسی نداشت، پس نکته و تمرینی هم ندارد.
 */
const SESSION_FILE_STATUSES: readonly BookingDetail["status"][] = [
  "IN_PROGRESS",
  "COMPLETED",
  "NO_SHOW_STUDENT",
  "NO_SHOW_TEACHER",
  "NO_SHOW",
];

/**
 * مهلت پرداخت.
 *
 * شمارش معکوس از `holdExpiresAt` می‌آید که خودِ API داده است. وقتی
 * تمام شد دکمه برداشته می‌شود ولی وضعیت هنوز `PENDING_PAYMENT` است:
 * جاروی پس‌زمینه هر دقیقه یک بار آن را `EXPIRED` می‌کند، پس تا یک
 * دقیقه اختلاف طبیعی است و کارت باید همان را بگوید نه اینکه دکمه‌ی
 * پرداختِ محکوم‌به‌شکست نشان دهد.
 */
function PaymentPanel({
  booking,
  plan,
  creditBalance,
  now,
  onChange,
}: {
  booking: BookingDetail;
  plan: PaymentPlan | undefined;
  /** موجودی اعتبار هنرجو به ریال — تهی یعنی هنوز خوانده نشده */
  creditBalance: bigint | null;
  now: number | null;
  onChange: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [useCredit, setUseCredit] = useState(true);

  const expiresAt = booking.holdExpiresAt ? Date.parse(booking.holdExpiresAt) : null;
  const remaining = expiresAt !== null && now !== null ? expiresAt - now : null;
  const expired = remaining !== null && remaining <= 0;
  const hasCredit = creditBalance !== null && creditBalance > 0n;

  async function pay() {
    if (!plan || plan.kind === "COVERED_BY_PACKAGE") return;

    setPending(true);
    setError(null);

    try {
      const order = await startCheckout({
        ...(plan.kind === "ENROLLMENT"
          ? { enrollmentId: plan.enrollmentId }
          : { bookingId: booking.id }),
        useCredit: hasCredit && useCredit,
      });

      /**
       * اعتبار کل مبلغ را پوشانده و سفارش همان‌جا قطعی شده — درگاهی در
       * کار نبود.
       *
       * `redirectUrl` تهی است و فرستادن مرورگر به رشته‌ی تهی یعنی رفتن
       * به همان صفحه. تصمیم به `settled` گره خورده نه به تهی بودن
       * آدرس: اگر روزی مسیر سومی اضافه شود، این شرط باید صریح بشکند نه
       * اینکه بی‌صدا به شاخه‌ی درگاه بیفتد.
       */
      if (order.settled) {
        const outcome = order.unmatched ? "paid_unmatched" : "paid";
        window.location.href = `/payment/result?order=${order.orderId}&status=${outcome}`;
        return;
      }

      if (!order.redirectUrl) {
        throw new Error("درگاه پرداخت آدرسی برنگرداند.");
      }

      // درگاه بیرون از دامنه‌ی ماست، پس `router.push` کار نمی‌کند
      window.location.href = order.redirectUrl;
    } catch (caught) {
      setError(errorMessage(caught));
      setPending(false);
      onChange();
    }
  }

  if (booking.role === "TEACHER") {
    return (
      <p className="mt-4 text-sm text-ink-muted">
        هنرجو هنوز پرداخت نکرده است. تا پرداخت نشود این ساعت قطعی نیست.
      </p>
    );
  }

  if (expired) {
    return (
      <p className="mt-4 text-sm text-ink-muted">
        مهلت پرداخت تمام شد و این ساعت آزاد شد. اگر هنوز می‌خواهید، دوباره رزرو
        کنید.
      </p>
    );
  }

  // جلسه‌ی دیگرِ همان پکیج: دکمه ندارد، ولی باید بگوید چرا
  if (plan?.kind === "COVERED_BY_PACKAGE") {
    return (
      <p className="mt-4 text-sm text-ink-muted">
        بخشی از یک پکیج است و با پرداخت جلسه‌ی اول قطعی می‌شود.
      </p>
    );
  }

  return (
    <div className="mt-4">
      <p className="text-sm">
        {/*
          برای پکیج مبلغی نوشته نمی‌شود.
          قیمت کل را `enrollments.price_total` تعیین می‌کند — جایی که
          تخفیف احتمالی پکیج هم خواهد نشست — و جمع زدن قیمت جلسات در
          فرانت یعنی همان قاعده‌ی قیمت‌گذاری دو جا نوشته شود و روزی
          عددی نشان داده شود که با مبلغ درگاه نمی‌خواند.
        */}
        {plan?.kind === "ENROLLMENT"
          ? `پکیج ${faNumber(plan.sessionCount)} جلسه‌ای`
          : `مبلغ ${formatToman(booking.price)} تومان`}
        {remaining !== null ? (
          <>
            {" · "}
            <span className="text-ink-muted">
              مهلت پرداخت: {formatCountdown(remaining)}
            </span>
          </>
        ) : null}
      </p>

      {/*
        خرج کردن اعتبار انتخابی است و تیکش از پیش زده شده.

        پیش‌فرضِ روشن، کاری است که بیشتر آدم‌ها می‌خواهند؛ ولی هنرجویی که
        اعتبارش را برای پکیج ماه بعد نگه داشته باید بتواند برش دارد.
        نشان دادن این گزینه به کسی که اعتباری ندارد فقط سؤال می‌سازد،
        پس وقتی موجودی صفر است اصلاً نمی‌آید.
      */}
      {hasCredit ? (
        <label className="mt-3 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={useCredit}
            onChange={(event) => setUseCredit(event.target.checked)}
          />
          <span>
            استفاده از اعتبار ({formatToman(creditBalance!.toString())} تومان موجودی)
          </span>
        </label>
      ) : null}

      <button
        type="button"
        className="btn-primary mt-3"
        disabled={pending || !plan}
        onClick={() => void pay()}
      >
        {pending
          ? "کمی صبر کنید…"
          : plan?.kind === "ENROLLMENT"
            ? "پرداخت کل پکیج"
            : "پرداخت"}
      </button>

      {error ? <p className="alert-error mt-3">{error}</p> : null}
    </div>
  );
}

/**
 * ورود به کلاس.
 *
 * پنجره‌ی باز بودن اتاق با منطق مشترک `roomState` حساب می‌شود — همان
 * تابعی که سمت سرور هم مصرف می‌شود. دکمه تا لحظه‌ی درست خاموش است و
 * شمارش معکوس نشان می‌دهد.
 *
 * ⚠️ این فقط ظاهر است. ساعت مرورگر قابل جابه‌جایی است، ولی توکن ورود
 * را فقط API صادر می‌کند و خارج از پنجره اصلاً صادر نمی‌شود. جلو بردن
 * ساعت دکمه را زودتر روشن می‌کند، نه در اتاق را.
 */
function RoomPanel({ booking, now }: { booking: BookingDetail; now: number | null }) {
  if (now === null) return null;

  const session = {
    start: Date.parse(booking.scheduledAt),
    end: Date.parse(booking.endsAt),
  };
  const state = roomState(session, now);

  if (state === "CLOSED") {
    return (
      <p className="mt-4 text-sm text-ink-muted">
        این جلسه تمام شده است. وضعیت نهایی‌اش تا چند دقیقه‌ی دیگر ثبت می‌شود.
      </p>
    );
  }

  if (state === "TOO_EARLY") {
    return (
      <p className="mt-4 text-sm text-ink-muted">
        اتاق کلاس {formatCountdown(roomWindow(session).start - now)} دیگر باز می‌شود.
      </p>
    );
  }

  return (
    <div className="mt-4">
      <Link href={`/room/${booking.id}`} className="btn-primary">
        ورود به کلاس
      </Link>
      <p className="mt-2 text-sm text-ink-muted">
        هدفون سیمی حتماً وصل باشد — بدون آن صدای ساز اکو می‌شود.
      </p>
    </div>
  );
}

/**
 * لغو.
 *
 * سیاست لغو (سند معماری، بخش ۵) از روی فاصله تا کلاس تصمیم می‌گیرد و
 * همان‌جا در متن گفته می‌شود، نه بعد از کلیک: کسی که سه ساعت مانده به
 * کلاس لغو می‌کند باید **پیش از** تأیید بداند جلسه‌اش می‌سوزد.
 */
function CancelPanel({
  booking,
  now,
  onChange,
}: {
  booking: BookingDetail;
  now: number | null;
  onChange: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [credited, setCredited] = useState<string | null>(null);

  const hoursLeft =
    now === null ? null : (Date.parse(booking.scheduledAt) - now) / 3_600_000;
  const freeCancellation =
    hoursLeft === null || hoursLeft >= BUSINESS_RULES.FREE_CANCELLATION_HOURS;

  async function submit() {
    setPending(true);
    setError(null);

    try {
      const result = await cancelBooking(booking.id, reason.trim() || undefined);
      setOpen(false);
      setCredited(result.creditGranted);
      onChange();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setPending(false);
    }
  }

  /**
   * پس از لغو، مبلغی که به اعتبار رفت همان‌جا گفته می‌شود.
   *
   * کارت با `onChange` تازه می‌شود و وضعیتش عوض؛ ولی «پولم کجا رفت؟»
   * جوابی است که باید در همان لحظه دیده شود، نه بعد از رفتن به صفحه‌ی
   * دیگری. `null` یعنی چیزی اضافه نشد — یا جلسه سوخته یا پرداخت‌نشده
   * بوده — و در آن حالت چیزی هم نوشته نمی‌شود.
   */
  if (credited) {
    return (
      <p className="alert-info mt-4">
        {formatToman(credited)} تومان به اعتبار شما اضافه شد و در رزرو بعدی خرج
        می‌شود.
      </p>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        className="mt-4 text-sm text-ink-muted underline"
        onClick={() => setOpen(true)}
      >
        لغو این جلسه
      </button>
    );
  }

  return (
    <div className="mt-4 space-y-3">
      <p className="alert-info">
        {booking.role === "TEACHER"
          ? "لغو از سمت شما یعنی مبلغ به اعتبار هنرجو برمی‌گردد و برایش پیامک اطلاع‌رسانی می‌رود."
          : freeCancellation
            ? `تا ${faNumber(BUSINESS_RULES.FREE_CANCELLATION_HOURS)} ساعت پیش از کلاس، لغو بدون سوخت شدن است و مبلغ به اعتبار شما برمی‌گردد تا در رزرو بعدی خرج شود.`
            : `کمتر از ${faNumber(BUSINESS_RULES.FREE_CANCELLATION_HOURS)} ساعت به کلاس مانده؛ با لغو، این جلسه می‌سوزد و مبلغ برنمی‌گردد.`}
      </p>

      <input
        className="input"
        type="text"
        placeholder="دلیل لغو (اختیاری)"
        value={reason}
        maxLength={500}
        onChange={(event) => setReason(event.target.value)}
      />

      {error ? <p className="alert-error">{error}</p> : null}

      <div className="flex gap-3">
        <button
          type="button"
          className="btn-danger"
          disabled={pending}
          onClick={() => void submit()}
        >
          {pending ? "کمی صبر کنید…" : "بله، لغو کن"}
        </button>
        <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>
          پشیمان شدم
        </button>
      </div>
    </div>
  );
}
