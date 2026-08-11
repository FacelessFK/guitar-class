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
 */
const HEARTBEAT_KEY = "worker:maintenance:last-run";

/** بعد از این مدت بی‌خبری، وُرکر مرده حساب می‌شود. */
const STALE_AFTER_MS = 5 * 60_000;

export async function recordHeartbeat(at: Date = new Date()): Promise<void> {
  // TTL چند برابر آستانه است تا فرق «کهنه» و «هرگز اجرا نشده» گم نشود
  await redis.set(HEARTBEAT_KEY, at.toISOString(), "PX", STALE_AFTER_MS * 12);
}

export type WorkerHealth = "ok" | "stale" | "never";

export interface WorkerStatus {
  status: WorkerHealth;
  lastRunAt: string | null;
}

export async function readWorkerStatus(now: Date = new Date()): Promise<WorkerStatus> {
  const raw = await redis.get(HEARTBEAT_KEY);

  if (!raw) {
    return { status: "never", lastRunAt: null };
  }

  const age = now.getTime() - Date.parse(raw);

  return {
    status: age <= STALE_AFTER_MS ? "ok" : "stale",
    lastRunAt: raw,
  };
}
