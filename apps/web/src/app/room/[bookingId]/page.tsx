"use client";

import Link from "next/link";
import { use, useCallback, useEffect, useRef, useState } from "react";

import { Dialog } from "@/components/ui/dialog";
import { ApiError, errorMessage } from "@/lib/api-client";
import {
  getBooking,
  joinClassroom,
  reportAttendance,
  type BookingDetail,
  type JoinTicket,
} from "@/lib/app-api";
import {
  attendanceEventForJitsiEvent,
  classroomCounterpartLabel,
  classroomDashboardHref,
  classroomSessionTypeLabel,
  classroomTimingPresentation,
  jitsiEventBoolean,
  mediaControlLabel,
} from "@/lib/classroom-presentation";
import { faDigits, formatCountdown, formatJalaliDayMonth } from "@/lib/format";
import { loadJitsiApi, type JitsiApi } from "@/lib/jitsi";
import { useNow } from "@/lib/use-now";

type MediaState = {
  ready: boolean;
  muted: boolean;
  available: boolean;
};

const UNKNOWN_MEDIA: MediaState = {
  ready: false,
  muted: true,
  available: true,
};

/**
 * اتاق کلاس سه مرز مستقل را نگه می‌دارد: API درباره‌ی اجازه و زمان تصمیم
 * می‌گیرد، چک‌لیست الزام هدفون را توضیح می‌دهد، و خود جیتسی رسانه و اتصال
 * را مدیریت می‌کند. ظاهر هیچ‌کدام جای قرارداد دیگری تصمیم نمی‌گیرد.
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
  const [bookingFailed, setBookingFailed] = useState(false);
  const [bookingAttempt, setBookingAttempt] = useState(0);
  const mounted = useRef(false);
  const now = useNow();

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    setBookingFailed(false);

    getBooking(bookingId)
      .then((result) => {
        if (!active) return;
        setBooking(result);
        setBookingFailed(result === null);
      })
      .catch(() => {
        // پاسخ join مرجع خطای ورود است و پیام دامنه‌ی دقیق‌تری می‌دهد.
        if (active) {
          setBooking(null);
          setBookingFailed(true);
        }
      });

    return () => {
      active = false;
    };
  }, [bookingAttempt, bookingId]);

  const requestTicket = useCallback(async () => {
    setError(null);

    try {
      const nextTicket = await joinClassroom(bookingId);
      if (!mounted.current) return;
      setTicket(nextTicket);
      setOpensAt(null);
    } catch (caught) {
      if (!mounted.current) return;
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

  useEffect(() => {
    if (opensAt === null || now === null || now < opensAt) return;
    void requestTicket();
  }, [opensAt, now, requestTicket]);

  if (error) {
    return (
      <RoomNotice
        title="ورود به کلاس ممکن نیست"
        body={error}
        booking={booking}
        action={
          <button type="button" className="room-button-primary" onClick={requestTicket}>
            تلاش دوباره
          </button>
        }
      />
    );
  }

  if (opensAt !== null) {
    return (
      <RoomNotice
        eyebrow="اتاق کلاس هوگه"
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
    return (
      <RoomNotice
        eyebrow="اتاق کلاس هوگه"
        title="در حال آماده‌سازی کلاس…"
        body="اجازه‌ی ورود و زمان جلسه در حال بررسی است."
        busy
      />
    );
  }

  if (!checklistDone) {
    return (
      <Checklist
        booking={booking}
        now={now}
        bookingFailed={bookingFailed}
        moderator={ticket.moderator}
        onRetryBooking={() => setBookingAttempt((attempt) => attempt + 1)}
        onReady={() => setChecklistDone(true)}
      />
    );
  }

  return <JitsiRoom bookingId={bookingId} booking={booking} ticket={ticket} now={now} />;
}

function Checklist({
  booking,
  now,
  bookingFailed,
  moderator,
  onRetryBooking,
  onReady,
}: {
  booking: BookingDetail | null;
  now: number | null;
  bookingFailed: boolean;
  moderator: boolean;
  onRetryBooking: () => void;
  onReady: () => void;
}) {
  const [confirmed, setConfirmed] = useState(false);
  const timing = booking ? classroomTimingPresentation(booking, now) : null;
  const closed = timing?.phase === "CLOSED";

  return (
    <main className="room-center-screen overflow-y-auto">
      <div className="w-full max-w-[720px] py-6">
        <RoomEyebrow>اتاق کلاس هوگه</RoomEyebrow>
        <h1 className="mt-3 text-[clamp(24px,5vw,30px)] font-semibold tracking-[-0.02em] text-ivory">
          پیش از ورود آماده شو
        </h1>

        {booking ? (
          <div className="mt-1.5 text-[14.5px] leading-8 text-ink-2">
            <p>
              {booking.instrumentName} · {classroomSessionTypeLabel(booking)} · با {booking.counterpartName}
            </p>
            <p className="text-meta">
              {formatJalaliDayMonth(booking.date)}، ساعت {faDigits(booking.startTime)} تا {faDigits(booking.endTime)}
            </p>
          </div>
        ) : bookingFailed ? (
          <div className="mt-3 flex flex-wrap items-center gap-3" role="alert">
            <p className="text-sm text-error">اطلاعات جلسه دریافت نشد.</p>
            <button type="button" className="min-h-11 px-2 text-sm text-violet-strong underline" onClick={onRetryBooking}>
              تلاش دوباره
            </button>
          </div>
        ) : (
          <p className="mt-2 text-sm text-meta">اطلاعات جلسه در حال دریافت است.</p>
        )}

        <div className="mt-7 grid gap-4 md:grid-cols-[minmax(0,1.2fr)_minmax(240px,.8fr)]">
          <section className="rounded-stage bg-surface-2 p-5 shadow-float sm:p-6" aria-labelledby="headphone-title">
            <div className="flex items-start gap-3">
              <span className="grid size-11 shrink-0 place-items-center rounded-full bg-violet-surface text-violet-strong">
                <HeadphonesIcon />
              </span>
              <div>
                <h2 id="headphone-title" className="text-[17px] font-semibold text-ivory">
                  هدفون سیمی وصل باشد
                </h2>
                <p className="mt-1 text-sm leading-7 text-ink-2">
                  حالت موسیقی برای حفظ صدای ساز، حذف اکو را خاموش می‌کند. بدون هدفون صدای کلاس به میکروفون برمی‌گردد.
                </p>
              </div>
            </div>

            <label className="mt-5 flex min-h-11 cursor-pointer items-start gap-3 rounded-control border border-divider px-3 py-2.5 text-sm leading-7 text-ink">
              <input
                type="checkbox"
                className="mt-1 size-4 accent-violet"
                checked={confirmed}
                onChange={(event) => setConfirmed(event.target.checked)}
              />
              هدفون سیمی وصل است و آماده‌ام.
            </label>
          </section>

          <section className="flex flex-col rounded-stage border border-divider bg-surface p-5 sm:p-6" aria-label="راهنمای ورود">
            <ul className="space-y-3 text-sm leading-7 text-ink-2">
              <ChecklistItem>برای تأخیر طبیعی شبکه، نوبتی بنوازید.</ChecklistItem>
              <ChecklistItem>میکروفون را نزدیک ساز قرار دهید.</ChecklistItem>
              <ChecklistItem>اجازه‌ی میکروفون و دوربین را خود پنجره‌ی امن کلاس درخواست می‌کند.</ChecklistItem>
              {moderator ? <ChecklistItem>نقش شما در این رزرو استاد و مدیر اتاق است.</ChecklistItem> : null}
            </ul>

            {timing?.notice ? (
              <p className="mt-4 rounded-control bg-violet-surface px-3 py-2 text-[13px] leading-6 text-violet-strong" role="status">
                {timing.notice}
              </p>
            ) : null}

            <button
              type="button"
              className="room-button-primary mt-5 w-full md:mt-auto"
              disabled={!confirmed || closed || !booking}
              onClick={onReady}
            >
              ورود به کلاس
            </button>
          </section>
        </div>
      </div>
    </main>
  );
}

function ChecklistItem({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-2.5">
      <span className="mt-[11px] size-1.5 shrink-0 rounded-full bg-violet" />
      <span>{children}</span>
    </li>
  );
}

function JitsiRoom({
  bookingId,
  booking,
  ticket,
  now,
}: {
  bookingId: string;
  booking: BookingDetail | null;
  ticket: JoinTicket;
  now: number | null;
}) {
  const container = useRef<HTMLDivElement>(null);
  const apiRef = useRef<JitsiApi | null>(null);
  const leaveFallback = useRef<ReturnType<typeof setTimeout> | null>(null);
  const leftReported = useRef(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [joined, setJoined] = useState(false);
  const [counterpartPresent, setCounterpartPresent] = useState(false);
  const [microphone, setMicrophone] = useState<MediaState>(UNKNOWN_MEDIA);
  const [camera, setCamera] = useState<MediaState>(UNKNOWN_MEDIA);
  const [sharing, setSharing] = useState(false);
  const [screenShareAvailable, setScreenShareAvailable] = useState(false);
  const [mediaNotice, setMediaNotice] = useState<string | null>(null);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [headphoneNotice, setHeadphoneNotice] = useState(true);
  const timing = booking ? classroomTimingPresentation(booking, now) : null;
  const dashboardHref = booking ? classroomDashboardHref(booking.role) : "/dashboard";

  useEffect(() => {
    setScreenShareAvailable(
      typeof navigator.mediaDevices?.getDisplayMedia === "function",
    );
  }, []);

  const reportLocalAttendance = useCallback(
    (jitsiEvent: string) => {
      const attendance = attendanceEventForJitsiEvent(jitsiEvent);
      if (!attendance) return;
      if (attendance === "LEFT") {
        if (leftReported.current) return;
        leftReported.current = true;
      }
      void reportAttendance(bookingId, attendance).catch(() => undefined);
    },
    [bookingId],
  );

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
          // این پروفایلِ حالت موسیقی باید دقیقاً همان شیء صادرشده از API باشد.
          configOverwrite: ticket.config,
          interfaceConfigOverwrite: {
            HIDE_INVITE_MORE_HEADER: true,
            SHOW_JITSI_WATERMARK: false,
            MOBILE_APP_PROMO: false,
          },
          width: "100%",
          height: "100%",
        });
        apiRef.current = api;

        const updateParticipantPresence = () => {
          const count = api?.getNumberOfParticipants?.();
          if (!cancelled && typeof count === "number") setCounterpartPresent(count > 1);
        };

        api.addListener("videoConferenceJoined", () => {
          if (cancelled) return;
          setJoined(true);
          reportLocalAttendance("videoConferenceJoined");
          updateParticipantPresence();

          void api?.isAudioMuted?.().then((muted) => {
            if (!cancelled) setMicrophone({ ready: true, muted, available: true });
          });
          void api?.isVideoMuted?.().then((muted) => {
            if (!cancelled) setCamera({ ready: true, muted, available: true });
          });
        });

        api.addListener("videoConferenceLeft", () => {
          if (cancelled) return;
          setJoined(false);
          reportLocalAttendance("videoConferenceLeft");
        });
        api.addListener("participantJoined", updateParticipantPresence);
        api.addListener("participantLeft", updateParticipantPresence);
        api.addListener("audioMuteStatusChanged", (payload) => {
          const muted = jitsiEventBoolean(payload, "muted");
          if (!cancelled && muted !== null) {
            setMicrophone({ ready: true, muted, available: true });
            setMediaNotice(null);
          }
        });
        api.addListener("videoMuteStatusChanged", (payload) => {
          const muted = jitsiEventBoolean(payload, "muted");
          if (!cancelled && muted !== null) {
            setCamera({ ready: true, muted, available: true });
            setMediaNotice(null);
          }
        });
        api.addListener("screenSharingStatusChanged", (payload) => {
          const on = jitsiEventBoolean(payload, "on");
          if (!cancelled && on !== null) setSharing(on);
        });
        api.addListener("micError", () => {
          if (cancelled) return;
          setMicrophone((state) => ({ ...state, ready: true, available: false }));
          setMediaNotice("میکروفون در دسترس نیست. اجازه و دستگاه صدا را از تنظیمات پنجره‌ی کلاس بررسی کنید.");
        });
        api.addListener("cameraError", () => {
          if (cancelled) return;
          setCamera((state) => ({ ...state, ready: true, available: false }));
          setMediaNotice("دوربین در دسترس نیست. اجازه و دستگاه تصویر را از تنظیمات پنجره‌ی کلاس بررسی کنید.");
        });
        api.addListener("readyToClose", () => {
          if (cancelled) return;
          reportLocalAttendance("readyToClose");
          window.location.assign(dashboardHref);
        });
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setLoadError(caught instanceof Error ? caught.message : "کلاس بار نشد.");
        }
      });

    return () => {
      cancelled = true;
      if (leaveFallback.current) clearTimeout(leaveFallback.current);
      apiRef.current = null;
      api?.dispose();
    };
  }, [dashboardHref, reportLocalAttendance, ticket]);

  const leaveRoom = () => {
    setLeaveOpen(false);
    setLeaving(true);
    const api = apiRef.current;

    if (!api) {
      window.location.assign(dashboardHref);
      return;
    }

    api.executeCommand("hangup");
    leaveFallback.current = setTimeout(() => {
      reportLocalAttendance("videoConferenceLeft");
      window.location.assign(dashboardHref);
    }, 1500);
  };

  if (loadError) {
    return (
      <RoomNotice
        title="کلاس بار نشد"
        body={loadError}
        booking={booking}
        action={
          <button type="button" className="room-button-primary" onClick={() => window.location.reload()}>
            تلاش دوباره
          </button>
        }
      />
    );
  }

  const counterpartRole = booking?.role === "TEACHER" ? "هنرجو" : "استاد";
  const connectionLabel = !joined
    ? "در حال اتصال"
    : counterpartPresent
      ? "متصل به کلاس"
      : `منتظر ${counterpartRole}`;

  return (
    <main className="flex min-h-0 flex-1 flex-col bg-bg" aria-label="کلاس آنلاین">
      <header className="flex h-[66px] shrink-0 items-center gap-3 border-b border-divider bg-surface px-3 sm:px-[18px]">
        <div className="flex min-w-0 items-center gap-2.5 sm:gap-3">
          <span className="text-[18px] font-bold tracking-[-0.02em] text-ivory">هوگه</span>
          <span className="h-px w-[18px] shrink-0 bg-wood" />
          <span className="truncate text-[13px] text-meta sm:text-sm">اتاق کلاس</span>
        </div>

        {booking ? (
          <div className="hidden min-w-0 flex-1 flex-col items-center justify-center md:flex">
            <div className="flex items-center gap-2 truncate text-[15px] text-ivory">
              <span className="truncate">{booking.instrumentName} · {classroomSessionTypeLabel(booking)}</span>
              <span className="size-1.5 shrink-0 rounded-full bg-violet" />
              <span className="shrink-0 text-[13px] text-ink-2">{timing?.live ? "زنده" : "در انتظار شروع"}</span>
            </div>
            <span className="truncate text-[13px] text-meta">{classroomCounterpartLabel(booking)}</span>
          </div>
        ) : <div className="flex-1" />}

        <div className="mr-auto flex shrink-0 items-center gap-3 sm:gap-4" aria-live="polite">
          <span className="flex items-center gap-2 text-[12.5px] text-ink-2 sm:text-[13.5px]">
            <span className={`size-1.5 rounded-full ${joined ? "bg-ok" : "animate-pulse bg-violet"}`} />
            <span className="hidden sm:inline">{connectionLabel}</span>
          </span>
          <span className="min-w-[40px] text-left text-sm tabular-nums text-ink-2" dir="ltr">
            {timing?.timerLabel ?? "—"}
          </span>
        </div>
      </header>

      <div className="relative flex min-h-0 flex-1 p-2 sm:p-3">
        <div
          ref={container}
          className="min-h-0 flex-1 overflow-hidden rounded-stage bg-surface-2 shadow-[inset_0_0_0_1px_var(--color-divider)] [&>iframe]:block"
          aria-label="پنجره‌ی ویدئویی کلاس"
        />

        <div className="pointer-events-none absolute inset-x-4 top-4 z-10 flex flex-col items-end gap-2 sm:inset-x-6 sm:top-6">
          {headphoneNotice ? (
            <div className="pointer-events-auto flex max-w-[420px] items-center gap-2.5 rounded-panel border border-divider bg-violet-surface/95 px-3 py-2.5 text-[13px] leading-6 text-ivory shadow-float">
              <HeadphonesIcon size={17} />
              <span>برای جلوگیری از اکو، هدفون سیمی وصل باشد.</span>
              <button
                type="button"
                aria-label="بستن یادآوری هدفون"
                className="grid size-8 shrink-0 place-items-center rounded-control text-meta hover:bg-surface-2 hover:text-ivory"
                onClick={() => setHeadphoneNotice(false)}
              >
                ×
              </button>
            </div>
          ) : null}

          {mediaNotice ? (
            <div className="pointer-events-auto max-w-[460px] rounded-panel border border-error-border bg-surface-2/95 px-3 py-2.5 text-[13px] leading-6 text-ivory shadow-float" role="alert">
              {mediaNotice}
            </div>
          ) : null}

          {timing?.notice && timing.phase !== "BEFORE_START" ? (
            <div className="rounded-pill border border-divider bg-surface-2/95 px-3 py-2 text-[13px] text-ink-2 shadow-float" role="status">
              {timing.notice}
            </div>
          ) : null}
        </div>
      </div>

      <footer className="relative flex min-h-[70px] shrink-0 items-center border-t border-divider bg-surface px-2 pb-[max(0px,env(safe-area-inset-bottom))] sm:px-4">
        <button
          type="button"
          className="room-leave-button"
          onClick={() => setLeaveOpen(true)}
          disabled={leaving}
          aria-label="خروج از کلاس"
        >
          <LeaveIcon />
          <span className="hidden sm:inline">{leaving ? "در حال خروج…" : "خروج از کلاس"}</span>
        </button>

        <div className="mx-auto flex items-center justify-center gap-1 sm:gap-2" aria-label="کنترل‌های رسانه">
          <MediaButton
            label={microphone.ready ? mediaControlLabel("MICROPHONE", microphone.muted, microphone.available) : "میکروفون در حال آماده‌سازی است"}
            text={microphone.muted ? "میکروفون خاموش" : "میکروفون"}
            active={!microphone.muted}
            error={!microphone.available}
            disabled={!joined || !microphone.ready || !microphone.available}
            onClick={() => apiRef.current?.executeCommand("toggleAudio")}
            icon={<MicrophoneIcon muted={microphone.muted} />}
          />
          <MediaButton
            label={camera.ready ? mediaControlLabel("CAMERA", camera.muted, camera.available) : "دوربین در حال آماده‌سازی است"}
            text={camera.muted ? "دوربین خاموش" : "دوربین"}
            active={!camera.muted}
            error={!camera.available}
            disabled={!joined || !camera.ready || !camera.available}
            onClick={() => apiRef.current?.executeCommand("toggleVideo")}
            icon={<CameraIcon muted={camera.muted} />}
          />
          {screenShareAvailable ? (
            <MediaButton
              label={sharing ? "پایان اشتراک صفحه" : "اشتراک صفحه"}
              text={sharing ? "پایان اشتراک" : "اشتراک صفحه"}
              active={sharing}
              disabled={!joined}
              onClick={() => apiRef.current?.executeCommand("toggleShareScreen")}
              icon={<ShareScreenIcon />}
            />
          ) : null}
        </div>

        <div className="hidden w-[132px] shrink-0 text-left text-[12px] text-meta lg:block">
          دستگاه‌ها در تنظیمات کلاس
        </div>
      </footer>

      <Dialog
        open={leaveOpen}
        onClose={() => setLeaveOpen(false)}
        title="از کلاس خارج شوی؟"
        actions={
          <>
            <button type="button" className="room-button-danger" onClick={leaveRoom}>
              خروج از کلاس
            </button>
            <button type="button" className="room-button-secondary" onClick={() => setLeaveOpen(false)}>
              ادامه کلاس
            </button>
          </>
        }
      >
        تا پایان پنجره‌ی این جلسه می‌توانی دوباره وارد شوی. خروج، رزرو را تمام یا تکمیل نمی‌کند.
      </Dialog>
    </main>
  );
}

function MediaButton({
  label,
  text,
  icon,
  active,
  error = false,
  disabled,
  onClick,
}: {
  label: string;
  text: string;
  icon: React.ReactNode;
  active: boolean;
  error?: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={`flex min-h-11 w-14 flex-col items-center justify-center gap-0.5 rounded-panel px-1 text-[12px] transition-colors sm:w-[84px] ${
        error ? "text-error" : active ? "text-violet-strong" : "text-ink-2"
      } hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-45`}
    >
      {icon}
      <span className="hidden max-w-full truncate sm:block">{text}</span>
    </button>
  );
}

function RoomNotice({
  eyebrow,
  title,
  body,
  booking,
  action,
  busy = false,
}: {
  eyebrow?: string;
  title: string;
  body: string;
  booking?: BookingDetail | null;
  action?: React.ReactNode;
  busy?: boolean;
}) {
  const destination = booking ? classroomDashboardHref(booking.role) : "/dashboard";

  return (
    <main className="room-center-screen overflow-y-auto">
      <div className="w-full max-w-[520px] py-6">
        {eyebrow ? <RoomEyebrow>{eyebrow}</RoomEyebrow> : null}
        {busy ? (
          <div className="mb-4 flex gap-1.5" aria-hidden="true">
            <span className="size-1.5 animate-dot rounded-full bg-violet" />
            <span className="size-1.5 animate-dot rounded-full bg-violet [animation-delay:160ms]" />
            <span className="size-1.5 animate-dot rounded-full bg-violet [animation-delay:320ms]" />
          </div>
        ) : null}
        <h1 className="mt-3 text-[clamp(24px,6vw,28px)] font-semibold tracking-[-0.02em] text-ivory">{title}</h1>
        <p className="mt-2 text-[15px] leading-8 text-ink-2" role={busy ? "status" : "alert"}>{body}</p>

        {booking ? (
          <p className="mt-4 text-sm leading-7 text-meta">
            {booking.instrumentName} · {classroomSessionTypeLabel(booking)} · با {booking.counterpartName}<br />
            {formatJalaliDayMonth(booking.date)}، ساعت {faDigits(booking.startTime)}
          </p>
        ) : null}

        <div className="mt-7 flex flex-wrap gap-2.5">
          {action}
          <Link href={destination} className="room-button-secondary">
            بازگشت به کلاس‌های من
          </Link>
        </div>
      </div>
    </main>
  );
}

function RoomEyebrow({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2.5 text-[13px] tracking-[0.04em] text-meta">
      <span className="h-px w-5 bg-wood" />
      <span>{children}</span>
    </div>
  );
}

function HeadphonesIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 256 256" fill="currentColor" aria-hidden="true">
      <path d="M201.9 62.1A103.3 103.3 0 0 0 128.7 32h-.7a104 104 0 0 0-104 104v56a24 24 0 0 0 24 24h24a24 24 0 0 0 24-24v-40a24 24 0 0 0-24-24H40v-8a88 88 0 0 1 88-88h.6a88.3 88.3 0 0 1 87.4 88v8h-32a24 24 0 0 0-24 24v40a24 24 0 0 0 24 24h24a24 24 0 0 0 24-24v-56a103.3 103.3 0 0 0-30.1-73.9" />
    </svg>
  );
}

function MicrophoneIcon({ muted }: { muted: boolean }) {
  return (
    <svg width="21" height="21" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true">
      <path d="M128 176a48.05 48.05 0 0 0 48-48V64a48 48 0 0 0-96 0v64a48.05 48.05 0 0 0 48 48m8 31.6V232a8 8 0 0 1-16 0v-24.4A80.11 80.11 0 0 1 48 128a8 8 0 0 1 16 0 64 64 0 0 0 128 0 8 8 0 0 1 16 0 80.11 80.11 0 0 1-72 79.6" />
      {muted ? <path d="M40 32 216 224" stroke="currentColor" strokeWidth="18" strokeLinecap="round" fill="none" /> : null}
    </svg>
  );
}

function CameraIcon({ muted }: { muted: boolean }) {
  return (
    <svg width="21" height="21" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true">
      <path d="M251.8 73a8 8 0 0 0-8.2.2L200 100.4V80a16 16 0 0 0-16-16H32a16 16 0 0 0-16 16v96a16 16 0 0 0 16 16h152a16 16 0 0 0 16-16v-20.4l43.6 27.2A8 8 0 0 0 256 176V80a8 8 0 0 0-4.2-7" />
      {muted ? <path d="M40 32 216 224" stroke="currentColor" strokeWidth="18" strokeLinecap="round" fill="none" /> : null}
    </svg>
  );
}

function ShareScreenIcon() {
  return (
    <svg width="21" height="21" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true">
      <path d="M208 40H48a24 24 0 0 0-24 24v112a24 24 0 0 0 24 24h72v16H96a8 8 0 0 0 0 16h64a8 8 0 0 0 0-16h-24v-16h72a24 24 0 0 0 24-24V64a24 24 0 0 0-24-24m-74.3 33.4 28 28a8 8 0 0 1-11.4 11.3L136 99.3V152a8 8 0 0 1-16 0V99.3l-14.3 14.4a8 8 0 0 1-11.4-11.3l28-28a8 8 0 0 1 11.4 0" />
    </svg>
  );
}

function LeaveIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true">
      <path d="M120 216a8 8 0 0 1-8 8H48a16 16 0 0 1-16-16V48a16 16 0 0 1 16-16h64a8 8 0 0 1 0 16H48v160h64a8 8 0 0 1 8 8m109.7-93.7-40-40a8 8 0 0 0-11.4 11.4l26.4 26.3H104a8 8 0 0 0 0 16h100.7l-26.4 26.3a8 8 0 0 0 11.4 11.4l40-40a8 8 0 0 0 0-11.4" />
    </svg>
  );
}
