"use client";

import Link from "next/link";
import { use, useCallback, useEffect, useRef, useState } from "react";

import { ApiError, errorMessage } from "@/lib/api-client";
import {
  getBooking,
  joinClassroom,
  reportAttendance,
  type BookingDetail,
  type JoinTicket,
} from "@/lib/app-api";
import { faDigits, formatCountdown, formatJalaliDayMonth } from "@/lib/format";
import { loadJitsiApi, type JitsiApi } from "@/lib/jitsi";
import { useNow } from "@/lib/use-now";

/**
 * اتاق کلاس.
 *
 * سه مرحله دارد و هیچ‌کدام قابل پرش نیست:
 *
 *   ۱. گرفتن بلیت از API. اگر خارج از پنجره‌ی مجاز باشیم، توکن اصلاً
 *      صادر نمی‌شود و به‌جایش `opensAt` می‌آید — همان که شمارش معکوس
 *      از رویش ساخته می‌شود.
 *   ۲. چک‌لیست پیش از ورود. هدفون سیمی الزامی است.
 *   ۳. ساخت IFrame با همان بلیت.
 *
 * ⚠️ فرانت هیچ‌وقت مستقیم با جیتسی احراز هویت نمی‌کند. توکن را فقط API
 * صادر می‌کند، بعد از بررسی اینکه کاربر طرف این رزرو است، پول داده، و
 * الان زمان کلاسش است.
 */
export default function RoomPage({
  params,
}: {
  params: Promise<{ bookingId: string }>;
}) {
  const { bookingId } = use(params);

  const [booking, setBooking] = useState<BookingDetail | null>(null);
  const [ticket, setTicket] = useState<JoinTicket | null>(null);
  const [opensAt, setOpensAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checklistDone, setChecklistDone] = useState(false);

  const now = useNow();

  useEffect(() => {
    getBooking(bookingId)
      .then(setBooking)
      .catch(() => setBooking(null));
  }, [bookingId]);

  const requestTicket = useCallback(async () => {
    setError(null);

    try {
      setTicket(await joinClassroom(bookingId));
      setOpensAt(null);
    } catch (caught) {
      // «هنوز باز نشده» خطا نیست، یک وضعیت است — و API لحظه‌ی باز شدن
      // را هم می‌گوید تا کاربر دکمه را بی‌هدف تکرار نکند
      if (caught instanceof ApiError && caught.code === "ROOM_NOT_OPEN") {
        const at = caught.body.opensAt;
        setOpensAt(typeof at === "string" ? Date.parse(at) : null);
        return;
      }

      setError(errorMessage(caught));
    }
  }, [bookingId]);

  useEffect(() => {
    void requestTicket();
  }, [requestTicket]);

  // وقتی لحظه‌ی باز شدن رسید، خودش دوباره تلاش می‌کند. کاربری که صفحه
  // را باز گذاشته نباید مجبور شود تازه‌سازی کند.
  useEffect(() => {
    if (opensAt === null || now === null || now < opensAt) return;
    void requestTicket();
  }, [opensAt, now, requestTicket]);

  if (error) {
    return <Notice title="ورود به کلاس ممکن نیست" body={error} />;
  }

  if (opensAt !== null) {
    return (
      <Notice
        title="اتاق هنوز باز نشده"
        body={
          now === null
            ? "در حال بررسی زمان کلاس…"
            : `اتاق ${formatCountdown(opensAt - now)} دیگر باز می‌شود. همین صفحه خودش به‌روز می‌شود.`
        }
        booking={booking}
      />
    );
  }

  if (!ticket) {
    return <Notice title="در حال آماده‌سازی کلاس…" body="کمی صبر کنید." />;
  }

  if (!checklistDone) {
    return (
      <Checklist
        booking={booking}
        moderator={ticket.moderator}
        onReady={() => setChecklistDone(true)}
      />
    );
  }

  return <JitsiRoom bookingId={bookingId} ticket={ticket} />;
}

/**
 * چک‌لیست پیش از ورود.
 *
 * هدفون سیمی «توصیه» نیست، شرط کار کردن است: در حالت موسیقی، حذف اکو
 * خاموش است تا صدای ساز بریده‌بریده نشود، و بدون هدفون همان لحظه
 * فیدبک‌لوپ راه می‌افتد. گفتنش بعد از ورود دیر است.
 */
function Checklist({
  booking,
  moderator,
  onReady,
}: {
  booking: BookingDetail | null;
  moderator: boolean;
  onReady: () => void;
}) {
  const [confirmed, setConfirmed] = useState(false);

  return (
    <div className="mx-auto max-w-lg px-5 py-16">
      <h1 className="text-2xl font-bold">پیش از ورود به کلاس</h1>

      {booking ? (
        <p className="mt-2 text-sm text-ink-muted">
          {booking.instrumentName} با {booking.counterpartName} ·{" "}
          {formatJalaliDayMonth(booking.date)} ساعت {faDigits(booking.startTime)}
        </p>
      ) : null}

      <ul className="mt-8 space-y-4 text-sm">
        <Item title="هدفون سیمی وصل کنید">
          در کلاس موسیقی، حذف اکوی جیتسی خاموش است تا صدای ساز خراب نشود.
          نتیجه‌اش این است که بدون هدفون، صدای طرف مقابل از بلندگو به میکروفون
          برمی‌گردد و سوت می‌کشد. هدفون بی‌سیم هم کیفیت را پایین می‌آورد.
        </Item>

        <Item title="نوبتی بنوازید">
          تأخیر شبکه حدود یک‌سوم ثانیه است و راه‌حلی ندارد؛ نواختن هم‌زمان با
          طرف مقابل ممکن نیست. اول یکی می‌نوازد، بعد دیگری.
        </Item>

        <Item title="میکروفون را نزدیک ساز بگذارید، نه نزدیک دهان">
          صدای ساز باید برسد، نه نفس کشیدن.
        </Item>

        {moderator ? (
          <Item title="شما مدیر این جلسه‌اید">
            کنترل قطع و وصل و قفل اتاق دست شماست.
          </Item>
        ) : null}
      </ul>

      <label className="mt-8 flex items-start gap-3 text-sm">
        <input
          type="checkbox"
          className="mt-1"
          checked={confirmed}
          onChange={(event) => setConfirmed(event.target.checked)}
        />
        هدفون سیمی وصل است و آماده‌ام.
      </label>

      <button
        type="button"
        className="btn-primary mt-6 w-full"
        disabled={!confirmed}
        onClick={onReady}
      >
        ورود به کلاس
      </button>
    </div>
  );
}

function Item({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <li className="card">
      <h2 className="font-bold">{title}</h2>
      <p className="mt-2 text-ink-muted">{children}</p>
    </li>
  );
}

/**
 * خودِ اتاق.
 *
 * ⚠️ `ticket.config` **عیناً** به `configOverwrite` می‌رود. این پروفایل
 * «حالت موسیقی» است: پردازش‌های صوتی گفتارمحور جیتسی خاموش، استریو
 * روشن، بیت‌ریت اوپوس بالا. سمت سرور تولید می‌شود تا در ارتقای بعدی
 * جیتسی یک جا اصلاح شود، و دست بردن در آن اینجا یعنی صدای ساز خراب
 * شود بدون اینکه چیزی خطا بدهد — جیتسی کلید ناشناخته را بی‌صدا دور
 * می‌ریزد.
 */
function JitsiRoom({ bookingId, ticket }: { bookingId: string; ticket: JoinTicket }) {
  const container = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const node = container.current;
    if (!node) return;

    let api: JitsiApi | null = null;
    let cancelled = false;

    loadJitsiApi(ticket.domain)
      .then((JitsiMeetExternalAPI) => {
        if (cancelled || !container.current) return;

        api = new JitsiMeetExternalAPI(ticket.domain, {
          roomName: ticket.roomName,
          jwt: ticket.jwt,
          parentNode: container.current,
          configOverwrite: ticket.config,
          interfaceConfigOverwrite: {
            // دعوت کردن معنا ندارد: اتاق مال یک رزرو مشخص است و توکن
            // فقط برای دو طرف همان رزرو صادر می‌شود
            HIDE_INVITE_MORE_HEADER: true,
            SHOW_JITSI_WATERMARK: false,
            MOBILE_APP_PROMO: false,
          },
          width: "100%",
          height: "100%",
        });

        /**
         * نگاشت رویدادها به ثبت حضور.
         *
         * `participantLeft` و `readyToClose` هر دو `LEFT` می‌شوند و
         * سرور آخرین خروج را نگه می‌دارد — یعنی «لحظه‌ای که اتاق خالی
         * شد». لحظه‌ی رویداد فرستاده نمی‌شود؛ ساعت سرور ملاک است.
         *
         * ⚠️ این داده از کلاینت می‌آید و قابل جعل است. بدهی آگاهانه
         * است (سند معماری، بخش ۶.۵) و راه‌حل واقعی‌اش هوک سمت سرور
         * جیتسی است.
         */
        api.addListener("videoConferenceJoined", () => {
          void reportAttendance(bookingId, "JOINED").catch(() => undefined);
        });

        for (const event of ["participantLeft", "readyToClose"]) {
          api.addListener(event, () => {
            void reportAttendance(bookingId, "LEFT").catch(() => undefined);
          });
        }

        api.addListener("readyToClose", () => {
          window.location.href = "/dashboard";
        });
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : "کلاس بار نشد.");
        }
      });

    return () => {
      cancelled = true;
      api?.dispose();
    };
  }, [bookingId, ticket]);

  if (error) {
    return <Notice title="کلاس بار نشد" body={error} />;
  }

  return <div ref={container} className="h-screen w-screen" />;
}

function Notice({
  title,
  body,
  booking,
}: {
  title: string;
  body: string;
  booking?: BookingDetail | null;
}) {
  return (
    <div className="mx-auto max-w-lg px-5 py-16 text-center">
      <h1 className="text-2xl font-bold">{title}</h1>
      <p className="mt-3 text-ink-muted">{body}</p>

      {booking ? (
        <p className="mt-4 text-sm text-ink-muted">
          {booking.instrumentName} با {booking.counterpartName} ·{" "}
          {formatJalaliDayMonth(booking.date)} ساعت {faDigits(booking.startTime)}
        </p>
      ) : null}

      <Link href="/dashboard" className="btn-secondary mt-8">
        بازگشت به کلاس‌های من
      </Link>
    </div>
  );
}
