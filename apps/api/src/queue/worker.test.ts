import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { Queue, Worker } from "bullmq";
import { eq } from "drizzle-orm";
import { fromTehranWallClock } from "@music/shared";

import { db } from "../db/client.js";
import { bookings, orders } from "../db/schema/index.js";
import { createSingleBooking } from "../booking/booking.service.js";
import { startCheckout } from "../payment/payment.service.js";
import { FakePaymentGateway } from "../payment/gateway.port.js";
import {
  closeDatabase,
  resetDatabase,
  resetRedis,
  seedFixture,
  type Fixture,
} from "../test/fixtures.js";
import { createQueueConnection } from "./connection.js";
import { readWorkerStatus } from "./heartbeat.js";
import {
  EXPIRE_HOLDS_INTERVAL_MS,
  EXPIRE_HOLDS_JOB,
  MAINTENANCE_QUEUE,
  runMaintenance,
} from "./maintenance.job.js";
import { registerSchedulers } from "./queues.js";
import { createMaintenanceWorker, processMaintenanceJob } from "./worker.js";

/**
 * تست‌های وُرکر، روی ردیس و پستگرس واقعی.
 *
 * اینجا عمداً وُرکر واقعی BullMQ بالا می‌آید و جاب واقعی در صف گذاشته
 * می‌شود، چون چیزی که باید اثبات شود «سیم‌کشی» است نه منطق: منطقِ جارو
 * از قبل تست دارد، ولی همان منطق ماه‌ها اجرا نمی‌شد چون هیچ‌کس صدایش
 * نمی‌زد. تستی که هندلر را مستقیم صدا بزند دوباره همان اشتباه را
 * نمی‌گیرد.
 */

const SATURDAY = "2026-08-15";
const NOW = new Date("2026-08-01T00:00:00Z");

let fixture: Fixture;
let queue: Queue;
let worker: Worker;

beforeEach(async () => {
  await resetDatabase();
  await resetRedis();
  fixture = await seedFixture();

  queue = new Queue(MAINTENANCE_QUEUE, { connection: createQueueConnection() });
});

afterEach(async () => {
  await worker?.close();
  await queue.obliterate({ force: true }).catch(() => undefined);
  await queue.close();
});

afterAll(async () => {
  await closeDatabase();
});

async function makeStaleBooking(): Promise<string> {
  const booking = await createSingleBooking({
    studentId: fixture.studentId,
    teacherProfileId: fixture.teacherProfileId,
    offeringId: fixture.offeringId,
    scheduledAt: fromTehranWallClock(SATURDAY, 17 * 60),
    now: NOW,
  });

  // مهلت را به گذشته می‌بریم تا جارو کاری برای انجام دادن داشته باشد
  await db
    .update(bookings)
    .set({ holdExpiresAt: new Date(Date.now() - 60_000) })
    .where(eq(bookings.id, booking.id));

  return booking.id;
}

/** منتظر می‌ماند تا شرط برقرار شود، وگرنه تست را با خطا تمام می‌کند. */
async function waitFor(
  predicate: () => Promise<boolean>,
  timeoutMs = 10_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  throw new Error("شرط در مهلت مقرر برقرار نشد");
}

// ---------------------------------------------------------------------------

describe("وُرکر نگه‌داری", () => {
  it("جاب صف را برمی‌دارد و رزروِ منقضی را آزاد می‌کند", async () => {
    const bookingId = await makeStaleBooking();

    worker = createMaintenanceWorker();
    await queue.add(EXPIRE_HOLDS_JOB, {});

    await waitFor(async () => {
      const [row] = await db
        .select({ status: bookings.status })
        .from(bookings)
        .where(eq(bookings.id, bookingId));
      return row?.status === "EXPIRED";
    });

    const [row] = await db
      .select({ status: bookings.status, holdExpiresAt: bookings.holdExpiresAt })
      .from(bookings)
      .where(eq(bookings.id, bookingId));

    expect(row?.status).toBe("EXPIRED");
    expect(row?.holdExpiresAt).toBeNull();
  });

  it("سفارشِ در انتظارِ همان رزرو را هم ناموفق می‌کند", async () => {
    const bookingId = await makeStaleBooking();
    const checkout = await startCheckout({
      studentId: fixture.studentId,
      bookingId,
      gateway: new FakePaymentGateway(),
      now: NOW,
    });

    // سفارش هم باید کهنه شمرده شود
    await db
      .update(orders)
      .set({ createdAt: new Date(Date.now() - 60 * 60_000) })
      .where(eq(orders.id, checkout.orderId));

    worker = createMaintenanceWorker();
    await queue.add(EXPIRE_HOLDS_JOB, {});

    await waitFor(async () => {
      const [row] = await db
        .select({ status: orders.status })
        .from(orders)
        .where(eq(orders.id, checkout.orderId));
      return row?.status === "FAILED";
    });
  });

  it("ضربان را ثبت می‌کند تا اندپوینت سلامت بتواند وُرکر مرده را ببیند", async () => {
    expect((await readWorkerStatus()).status).toBe("never");

    worker = createMaintenanceWorker();
    await queue.add(EXPIRE_HOLDS_JOB, {});

    await waitFor(async () => (await readWorkerStatus()).status === "ok");

    const status = await readWorkerStatus();
    expect(status.status).toBe("ok");
    expect(status.lastRunAt).not.toBeNull();
  });

  /**
   * اگر نام جاب یک طرف عوض شود و طرف دیگر نه، باید سر و صدا کند. رد
   * شدن بی‌صدا یعنی صف پر از جاب می‌شود و هیچ کاری انجام نمی‌گیرد.
   */
  it("جاب ناشناخته را با خطا رد می‌کند", async () => {
    await expect(
      processMaintenanceJob({ name: "no-such-job" } as never),
    ).rejects.toThrow(/جاب ناشناخته/);
  });

  it("اجرای دوباره‌ی جارو چیز تازه‌ای عوض نمی‌کند", async () => {
    await makeStaleBooking();

    const first = await runMaintenance();
    const second = await runMaintenance();

    expect(first.expiredBookings).toBe(1);
    expect(second.expiredBookings).toBe(0);
  });
});

// ---------------------------------------------------------------------------

describe("زمان‌بند تکرارشونده", () => {
  it("ثبت می‌شود و با هر بار بالا آمدن روی هم انباشته نمی‌شود", async () => {
    await registerSchedulers(queue);
    await registerSchedulers(queue);
    await registerSchedulers(queue);

    const schedulers = await queue.getJobSchedulers();

    expect(schedulers).toHaveLength(1);
    expect(schedulers[0]?.key).toBe(EXPIRE_HOLDS_JOB);
    expect(Number(schedulers[0]?.every)).toBe(EXPIRE_HOLDS_INTERVAL_MS);
  });
});
