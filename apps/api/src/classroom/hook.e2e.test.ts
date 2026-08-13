import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import { eq } from "drizzle-orm";
import request from "supertest";
import type { App } from "supertest/types.js";

import { AppModule } from "../app.module.js";
import { AuthExceptionFilter } from "../common/auth-exception.filter.js";
import { DomainExceptionFilter } from "../common/domain-exception.filter.js";
import { BigIntSerializationInterceptor } from "../common/serialization.interceptor.js";
import { db } from "../db/client.js";
import { attendanceEvents, bookings } from "../db/schema/index.js";
import {
  closeDatabase,
  resetDatabase,
  resetRedis,
  seedFixture,
  type Fixture,
} from "../test/fixtures.js";

/**
 * هوک حضور، از سطح HTTP.
 *
 * چیزی که اینجا محافظت می‌شود، **قرارداد با ماژول prosody** است، نه
 * منطق دامنه (آن در `session-lifecycle.test.ts` است). سه بند این
 * قرارداد اگر بشکنند هیچ تستِ دیگری نمی‌گیردشان و خرابی‌شان در سرور
 * جیتسی دیده می‌شود نه اینجا:
 *
 *   ۱. مسیرها دقیقاً همان‌هایی‌اند که ماژول می‌سازد.
 *   ۲. راز مشترک اجباری است — بدون آن، این مسیر یعنی «هر کسی را حاضر
 *      ثبت کن»، که همان چیزی است که ماژول برای بستنش نوشته شده.
 *   ۳. «نادیده گرفتم» باید ۲۰۰ باشد. ماژول روی ۵xx دوباره می‌فرستد، پس
 *      رویدادِ اتاقی که نمی‌شناسیم با کد خطا تا ابد برمی‌گردد.
 */

const SECRET = "test-only-hook-secret";
const MINUTE_MS = 60_000;

let app: INestApplication;
let server: App;
let fixture: Fixture;

beforeAll(async () => {
  process.env.JITSI_WEBHOOK_SECRET = SECRET;

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

  app = moduleRef.createNestApplication();
  app.setGlobalPrefix("api");
  app.useGlobalFilters(new AuthExceptionFilter(), new DomainExceptionFilter());
  app.useGlobalInterceptors(new BigIntSerializationInterceptor());
  await app.init();

  server = app.getHttpServer() as App;
});

beforeEach(async () => {
  await resetDatabase();
  await resetRedis();
  fixture = await seedFixture();
});

afterAll(async () => {
  await app.close();
  await closeDatabase();
});

async function seedBooking(): Promise<{ id: string; roomId: string }> {
  const scheduledAt = new Date(Date.now() - 5 * MINUTE_MS);

  const [created] = await db
    .insert(bookings)
    .values({
      studentId: fixture.studentId,
      teacherId: fixture.teacherUserId,
      offeringId: fixture.offeringId,
      type: "SINGLE",
      scheduledAt,
      endsAt: new Date(scheduledAt.getTime() + 60 * MINUTE_MS),
      durationMinutes: 60,
      status: "CONFIRMED",
      holdExpiresAt: null,
      priceSnapshot: 3_000_000n,
      commissionSnapshot: "20",
    })
    .returning({ id: bookings.id, roomId: bookings.roomId });

  return created!;
}

/** دقیقاً همان بدنه‌ای که `mod_event_sync_component` می‌فرستد. */
const occupantJoined = (roomId: string, userId: string, secret = SECRET) =>
  request(server)
    .post("/api/classroom/hook/events/occupant/joined")
    .set("Authorization", `Bearer ${secret}`)
    .send({
      event_name: "muc-occupant-joined",
      is_breakout: false,
      room_jid: `${roomId}@conference.meet.jitsi`,
      room_name: roomId,
      active_occupants_count: 1,
      occupant: {
        occupant_jid: `${roomId}@conference.meet.jitsi/abc123`,
        joined_at: Math.floor(Date.now() / 1000),
        name: "نام نمایشی",
        id: userId,
        email: null,
      },
    });

const eventsOf = (bookingId: string) =>
  db.select().from(attendanceEvents).where(eq(attendanceEvents.bookingId, bookingId));

const bookingRow = async (bookingId: string) => {
  const [row] = await db
    .select({
      status: bookings.status,
      teacherVerifiedAt: bookings.teacherVerifiedAt,
      studentVerifiedAt: bookings.studentVerifiedAt,
      teacherJoinedAt: bookings.teacherJoinedAt,
    })
    .from(bookings)
    .where(eq(bookings.id, bookingId));

  return row!;
};

describe("هوک حضور سرور جیتسی", () => {
  it("ورود استاد را تأیید می‌کند و جلسه را جلو می‌برد", async () => {
    const booking = await seedBooking();

    const response = await occupantJoined(booking.roomId, fixture.teacherUserId).expect(
      200,
    );

    expect(response.body).toMatchObject({ ok: true, outcome: "RECORDED" });

    const row = await bookingRow(booking.id);
    expect(row.teacherVerifiedAt).not.toBeNull();
    expect(row.status).toBe("IN_PROGRESS");

    /**
     * ستون گزارش کلاینت دست‌نخورده می‌ماند و همین نکته‌ی اصلی است: دو
     * منبع نباید در یک ستون قاطی شوند، وگرنه «مرورگر گفت آمدم ولی سرور
     * ندیدش» دیگر قابل پرسیدن نیست.
     */
    expect(row.teacherJoinedAt).toBeNull();

    expect(await eventsOf(booking.id)).toMatchObject([{ source: "SERVER_HOOK" }]);
  });

  it("بدون راز مشترک رد می‌شود و چیزی ثبت نمی‌کند", async () => {
    const booking = await seedBooking();

    await request(server)
      .post("/api/classroom/hook/events/occupant/joined")
      .send({ room_name: booking.roomId, occupant: { id: fixture.teacherUserId } })
      .expect(401);

    await occupantJoined(booking.roomId, fixture.teacherUserId, "wrong-secret").expect(
      401,
    );

    expect(await eventsOf(booking.id)).toEqual([]);
    expect((await bookingRow(booking.id)).teacherVerifiedAt).toBeNull();
  });

  /**
   * سرور جیتسی اتاق‌های دیگری هم دارد و ماژول همه‌شان را می‌فرستد.
   * پاسخ باید ۲۰۰ باشد وگرنه ماژول تا ابد دوباره می‌فرستد.
   */
  it("اتاق ناشناس ۲۰۰ می‌گیرد، نه خطا", async () => {
    const response = await occupantJoined(
      "0d1f4e3a-0000-4000-8000-000000000000",
      fixture.teacherUserId,
    ).expect(200);

    expect(response.body).toMatchObject({ outcome: "UNKNOWN_ROOM" });
  });

  it("رویداد بدون هویت را رد می‌کند ولی ۲۰۰ می‌دهد", async () => {
    const booking = await seedBooking();

    const response = await request(server)
      .post("/api/classroom/hook/events/occupant/joined")
      .set("Authorization", `Bearer ${SECRET}`)
      .send({
        event_name: "muc-occupant-joined",
        room_name: booking.roomId,
        occupant: { occupant_jid: "x", joined_at: 1_786_000_000 },
      })
      .expect(200);

    expect(response.body).toMatchObject({ outcome: "NO_IDENTITY" });
    expect(await eventsOf(booking.id)).toEqual([]);
  });

  /**
   * جبرانِ تحویلِ گم‌شده.
   *
   * ماژول موقع نابود شدن اتاق فهرست کامل کسانی که آمده بودند را
   * می‌فرستد. اگر رویداد تکیِ استاد گم شده باشد، اینجا برمی‌گردد — و
   * همین یک مسیر، فاصله‌ی بین «بازپرداخت ناحق» و «جلسه‌ی درست ثبت‌شده»
   * است.
   */
  it("موقع بسته شدن اتاق، ورودهای گم‌شده را جبران می‌کند", async () => {
    const booking = await seedBooking();
    const joinedAt = Math.floor(Date.now() / 1000);

    // فقط ورود هنرجو رسیده بود
    await occupantJoined(booking.roomId, fixture.studentId).expect(200);

    const response = await request(server)
      .post("/api/classroom/hook/events/room/destroyed")
      .set("Authorization", `Bearer ${SECRET}`)
      .send({
        event_name: "muc-room-destroyed",
        room_name: booking.roomId,
        room_jid: `${booking.roomId}@conference.meet.jitsi`,
        created_at: joinedAt - 60,
        destroyed_at: joinedAt + 60,
        all_occupants: [
          { id: fixture.studentId, joined_at: joinedAt, left_at: joinedAt + 60 },
          { id: fixture.teacherUserId, joined_at: joinedAt, left_at: joinedAt + 60 },
        ],
      })
      .expect(200);

    const row = await bookingRow(booking.id);
    expect(row.teacherVerifiedAt).not.toBeNull();
    expect(row.studentVerifiedAt).not.toBeNull();

    /**
     * ورودِ هنرجو که قبلاً رسیده بود دوباره ثبت نمی‌شود — قید یکتای
     * تحویل. سه سطر تازه: ورود استاد و خروج هر دو.
     */
    expect(response.body.recovered).toBe(3);
    expect(await eventsOf(booking.id)).toHaveLength(4);
  });

  it("همان رویداد دوباره بفرستد، سطر دوم نمی‌سازد", async () => {
    const booking = await seedBooking();
    const at = Math.floor(Date.now() / 1000);

    const body = {
      event_name: "muc-occupant-joined",
      room_name: booking.roomId,
      occupant: { id: fixture.studentId, joined_at: at, occupant_jid: "x" },
    };

    const send = () =>
      request(server)
        .post("/api/classroom/hook/events/occupant/joined")
        .set("Authorization", `Bearer ${SECRET}`)
        .send(body);

    await send().expect(200);
    const second = await send().expect(200);

    expect(second.body).toMatchObject({ outcome: "DUPLICATE" });
    expect(await eventsOf(booking.id)).toHaveLength(1);
  });

  /** بعد از اولین رویداد، سلامت باید بگوید هوک زنده است. */
  it("در پاسخ health دیده می‌شود", async () => {
    const booking = await seedBooking();

    const before = await request(server).get("/api/health").expect(200);
    expect(before.body.classroomHookLastEventAt).toBeNull();

    await occupantJoined(booking.roomId, fixture.studentId).expect(200);

    const after = await request(server).get("/api/health").expect(200);
    expect(after.body.classroomHookLastEventAt).not.toBeNull();
  });
});
