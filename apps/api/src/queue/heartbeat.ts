import { redis } from "../redis/client.js";

/**
 * ضربان وُرکر.
 *
 * وُرکر پروسه‌ی جدایی است، پس API از مرگش خبردار نمی‌شود. تنها نشانه‌ی
 * قابل اتکا این است که جارو آخرین بار کِی تمام شده — اگر آن لحظه کهنه
 * شود یعنی یا وُرکر بالا نیست یا گیر کرده.
 *
 * این دقیقاً همان چیزی است که نبودنش باعث شد `expireStaleHolds` مدت‌ها
 * بی‌صدا اجرا نشود: کدش سبز بود، تستش سبز بود، و هیچ‌جا معلوم نبود که
 * هیچ‌وقت صدا زده نمی‌شود.
 *
 * هر جارو ضربان خودش را دارد، نه یک ضربان مشترک. یک کلید مشترک یعنی تا
 * وقتی *یکی* از جاروها کار می‌کند سیستم سالم گزارش می‌شود، و جاروی
 * بستن جلسه می‌تواند هفته‌ها خوابیده باشد بدون اینکه کسی بفهمد.
 */
export const SWEEPS = {
  EXPIRE_HOLDS: "expire-holds",
  CLOSE_SESSIONS: "close-sessions",
  SEND_REMINDERS: "send-reminders",
  CLEANUP_MEDIA: "cleanup-media",
  MONTHLY_PAYOUTS: "monthly-payouts",
} as const;

export type SweepName = (typeof SWEEPS)[keyof typeof SWEEPS];

const ALL_SWEEPS: readonly SweepName[] = Object.values(SWEEPS);

const heartbeatKey = (sweep: SweepName): string => `worker:${sweep}:last-run`;

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;

/**
 * آستانه‌ی کهنگی — **به ازای هر جارو**، نه یک عدد مشترک.
 *
 * تا وقتی هر سه جارو دقیقه‌ای بودند یک عدد کافی بود. با آمدن جاروهای
 * شبانه غلط شد: پنج دقیقه برای جارویی که شبی یک بار اجرا می‌شود یعنی
 * سیستم بیست‌وسه ساعت و پنجاه‌وپنج دقیقه از هر شبانه‌روز را `degraded`
 * گزارش کند. و هشداری که همیشه روشن است، هشدار نیست — بعد از دو روز
 * کسی نگاهش نمی‌کند و همان خرابیِ واقعی که ضربان برای دیدنش ساخته شد
 * دوباره نامرئی می‌شود.
 *
 * برای جاروی شبانه ۲۶ ساعت گرفته شده نه ۲۴: با ۲۴ دقیق، چند دقیقه
 * تأخیر یا جابه‌جایی ساعت تابستانیِ سرور، هر روز یک هشدار کاذب می‌سازد.
 * دو ساعت حاشیه یعنی فقط اجرای واقعاً ازدست‌رفته دیده شود.
 */
const STALE_AFTER_MS: Record<SweepName, number> = {
  [SWEEPS.EXPIRE_HOLDS]: 5 * MINUTE_MS,
  [SWEEPS.CLOSE_SESSIONS]: 5 * MINUTE_MS,
  [SWEEPS.SEND_REMINDERS]: 5 * MINUTE_MS,
  [SWEEPS.CLEANUP_MEDIA]: 26 * HOUR_MS,
  [SWEEPS.MONTHLY_PAYOUTS]: 26 * HOUR_MS,
};

export async function recordHeartbeat(
  sweep: SweepName,
  at: Date = new Date(),
): Promise<void> {
  // TTL چند برابر آستانه است تا فرق «کهنه» و «هرگز اجرا نشده» گم نشود
  await redis.set(
    heartbeatKey(sweep),
    at.toISOString(),
    "PX",
    STALE_AFTER_MS[sweep] * 12,
  );
}

export type WorkerHealth = "ok" | "stale" | "never";

export interface SweepStatus {
  sweep: SweepName;
  status: WorkerHealth;
  lastRunAt: string | null;
}

export interface WorkerStatus {
  status: WorkerHealth;
  lastRunAt: string | null;
  /** به تفکیک، تا معلوم شود کدام جارو خوابیده — نه فقط «یکی از آن‌ها» */
  sweeps: SweepStatus[];
}

/** بدترین وضعیت، به ترتیب شدت. */
const SEVERITY: Record<WorkerHealth, number> = { ok: 0, stale: 1, never: 2 };

/**
 * وضعیت وُرکر: بدترینِ وضعیتِ جاروها.
 *
 * «سالم» یعنی **همه‌ی** جاروها تازه اجرا شده‌اند، هر کدام نسبت به
 * آستانه‌ی خودش. با یک آستانه‌ی مشترک، تا وقتی *یکی* کار می‌کرد سیستم
 * سالم گزارش می‌شد و جاروی بستن جلسه می‌توانست هفته‌ها خوابیده باشد.
 *
 * `sweeps` هم برمی‌گردد چون «degraded» به‌تنهایی نمی‌گوید کجا را نگاه
 * کنی، و با پنج جارو این تفاوت واقعی است.
 *
 * `lastRunAt` قدیمی‌ترین ضربان است، یعنی «همه‌ی کارهای پس‌زمینه دست‌کم
 * تا این لحظه انجام شده‌اند» — رقمی که می‌شود به آن تکیه کرد، برخلاف
 * تازه‌ترین ضربان که خوش‌بینانه‌ترین حالت را نشان می‌دهد.
 */
export async function readWorkerStatus(now: Date = new Date()): Promise<WorkerStatus> {
  const raw = await redis.mget(...ALL_SWEEPS.map(heartbeatKey));

  const sweeps: SweepStatus[] = ALL_SWEEPS.map((sweep, index) => {
    const lastRunAt = raw[index] ?? null;

    if (lastRunAt === null) {
      return { sweep, status: "never" as const, lastRunAt: null };
    }

    const age = now.getTime() - Date.parse(lastRunAt);

    return {
      sweep,
      status: age <= STALE_AFTER_MS[sweep] ? ("ok" as const) : ("stale" as const),
      lastRunAt,
    };
  });

  const status = sweeps.reduce<WorkerHealth>(
    (worst, entry) => (SEVERITY[entry.status] > SEVERITY[worst] ? entry.status : worst),
    "ok",
  );

  const timestamps = sweeps
    .map((entry) => entry.lastRunAt)
    .filter((value): value is string => value !== null);

  return {
    status,
    lastRunAt:
      timestamps.length === ALL_SWEEPS.length
        ? timestamps.reduce((a, b) => (Date.parse(a) <= Date.parse(b) ? a : b))
        : null,
    sweeps,
  };
}
