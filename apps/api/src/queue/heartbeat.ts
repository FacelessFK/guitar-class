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
} as const;

export type SweepName = (typeof SWEEPS)[keyof typeof SWEEPS];

const ALL_SWEEPS: readonly SweepName[] = Object.values(SWEEPS);

const heartbeatKey = (sweep: SweepName): string => `worker:${sweep}:last-run`;

/** بعد از این مدت بی‌خبری، وُرکر مرده حساب می‌شود. */
const STALE_AFTER_MS = 5 * 60_000;

export async function recordHeartbeat(
  sweep: SweepName,
  at: Date = new Date(),
): Promise<void> {
  // TTL چند برابر آستانه است تا فرق «کهنه» و «هرگز اجرا نشده» گم نشود
  await redis.set(heartbeatKey(sweep), at.toISOString(), "PX", STALE_AFTER_MS * 12);
}

export type WorkerHealth = "ok" | "stale" | "never";

export interface WorkerStatus {
  status: WorkerHealth;
  lastRunAt: string | null;
}

/**
 * وضعیت وُرکر: بدترینِ وضعیتِ جاروها.
 *
 * «سالم» یعنی هر سه جارو تازه اجرا شده‌اند. `lastRunAt` هم قدیمی‌ترین
 * ضربان است، یعنی «همه‌ی کارهای پس‌زمینه دست‌کم تا این لحظه انجام
 * شده‌اند» — رقمی که می‌شود به آن تکیه کرد، برخلاف تازه‌ترین ضربان که
 * خوش‌بینانه‌ترین حالت را نشان می‌دهد.
 */
export async function readWorkerStatus(now: Date = new Date()): Promise<WorkerStatus> {
  const raw = await redis.mget(...ALL_SWEEPS.map(heartbeatKey));

  if (raw.some((value) => value === null)) {
    return { status: "never", lastRunAt: null };
  }

  const oldest = raw
    .filter((value): value is string => value !== null)
    .reduce((a, b) => (Date.parse(a) <= Date.parse(b) ? a : b));

  const age = now.getTime() - Date.parse(oldest);

  return {
    status: age <= STALE_AFTER_MS ? "ok" : "stale",
    lastRunAt: oldest,
  };
}
