import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { decodeProtectedHeader, jwtVerify } from "jose";
import request from "supertest";
import type { App } from "supertest/types.js";

import { AppModule } from "../app.module.js";
import { AuthExceptionFilter } from "../common/auth-exception.filter.js";
import { DomainExceptionFilter } from "../common/domain-exception.filter.js";
import { BigIntSerializationInterceptor } from "../common/serialization.interceptor.js";
import { db } from "../db/client.js";
import { bookings } from "../db/schema/index.js";
import {
  accessTokenFor,
  closeDatabase,
  resetDatabase,
  resetRedis,
  seedFixture,
  type Fixture,
} from "../test/fixtures.js";

/**
 * تست‌های end-to-end اتاق کلاس.
 *
 * ⚠️ مقدارهای جیتسی اینجا **جعلی و ثابت** گذاشته می‌شوند تا تست به
 * `.env` توسعه‌دهنده و به سرور واقعی وابسته نباشد. ولی نام‌ها همان‌های
 * قرارداد واقعی‌اند، چون همان‌ها هستند که باید محافظت شوند.
 *
 * مهم‌ترینش `sub` است: باید دامنه‌ی **XMPP داخلی** باشد نه دامنه‌ی
 * عمومی. یک بار همین اشتباه شد و توکنِ درست‌امضاشده را جیتسی بی‌توضیح
 * رد کرد. برای اینکه تست واقعاً این را بگیرد، دو مقدار عمداً متفاوت‌اند.
 */
const JITSI = {
  domain: "class.hyggemode.com",
  appId: "music-platform",
  audience: "jitsi",
  xmppDomain: "meet.jitsi",
  secret: "test-only-jitsi-secret-not-the-one-on-the-server",
} as const;

const MINUTE_MS = 60_000;

let app: INestApplication;
let server: App;
let fixture: Fixture;
let studentToken: string;
let otherStudentToken: string;
let teacherToken: string;

beforeAll(async () => {
  process.env.JITSI_DOMAIN = JITSI.domain;
  process.env.JITSI_APP_ID = JITSI.appId;
  process.env.JITSI_AUDIENCE = JITSI.audience;
  process.env.JITSI_XMPP_DOMAIN = JITSI.xmppDomain;
  process.env.JITSI_APP_SECRET = JITSI.secret;

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

  [studentToken, otherStudentToken, teacherToken] = await Promise.all([
    accessTokenFor(fixture.studentId),
    accessTokenFor(fixture.otherStudentId),
    accessTokenFor(fixture.teacherUserId),
  ]);
});

afterAll(async () => {
  await app.close();
  await closeDatabase();
});

/**
 * رزرو را مستقیم در دیتابیس می‌سازد.
 *
 * از مسیر HTTP ساخته نمی‌شود چون آنجا `MIN_LEAD_MINUTES` جلوی رزروِ
 * «۵ دقیقه‌ی دیگر» را می‌گیرد — و دقیقاً همان زمان‌هاست که این ماژول
 * باید رویشان تست شود. زمان‌ها نسبت به «الان» ساخته می‌شوند تا تست به
 * ساعت اجرا وابسته نباشد.
 */
async function seedBooking(
  options: {
    startsInMinutes?: number;
    durationMinutes?: number;
    status?: "PENDING_PAYMENT" | "CONFIRMED" | "IN_PROGRESS" | "CANCELLED_BY_STUDENT";
  } = {},
): Promise<{ id: string; roomId: string }> {
  const { startsInMinutes = -5, durationMinutes = 60, status = "CONFIRMED" } = options;

  const scheduledAt = new Date(Date.now() + startsInMinutes * MINUTE_MS);

  const [created] = await db
    .insert(bookings)
    .values({
      studentId: fixture.studentId,
      teacherId: fixture.teacherUserId,
      offeringId: fixture.offeringId,
      type: "SINGLE",
      scheduledAt,
      endsAt: new Date(scheduledAt.getTime() + durationMinutes * MINUTE_MS),
      durationMinutes,
      status,
      holdExpiresAt: null,
      priceSnapshot: 3_000_000n,
      commissionSnapshot: "20",
    })
    .returning({ id: bookings.id, roomId: bookings.roomId });

  return created!;
}

const join = (bookingId: string, token: string) =>
  request(server)
    .post(`/api/bookings/${bookingId}/join`)
    .set("Authorization", `Bearer ${token}`);

const reportAttendance = (bookingId: string, token: string, event: string) =>
  request(server)
    .post(`/api/bookings/${bookingId}/attendance`)
    .set("Authorization", `Bearer ${token}`)
    .send({ event });

const readBooking = async (bookingId: string) => {
  const [row] = await db
    .select({
      status: bookings.status,
      actualStartedAt: bookings.actualStartedAt,
      actualEndedAt: bookings.actualEndedAt,
      teacherJoinedAt: bookings.teacherJoinedAt,
      studentJoinedAt: bookings.studentJoinedAt,
    })
    .from(bookings)
    .where(eq(bookings.id, bookingId));

  return row!;
};

/** توکن جیتسی را با همان کلید مشترک باز و بررسی می‌کند. */
async function verifyJitsiToken(token: string) {
  const { payload } = await jwtVerify(token, new TextEncoder().encode(JITSI.secret), {
    issuer: JITSI.appId,
    audience: JITSI.audience,
  });

  return payload as typeof payload & {
    room?: string;
    context?: { user?: { name?: string; moderator?: string; id?: string } };
  };
}

// ---------------------------------------------------------------------------

describe("POST /api/bookings/:id/join", () => {
  it("بدون توکن ۴۰۱ می‌دهد", async () => {
    const booking = await seedBooking();
    await request(server).post(`/api/bookings/${booking.id}/join`).expect(401);
  });

  it("رزرو ناموجود ۴۰۴ می‌دهد", async () => {
    const response = await join("00000000-0000-4000-8000-000000000000", studentToken).expect(
      404,
    );

    expect(response.body.code).toBe("BOOKING_NOT_FOUND");
  });

  /**
   * نام اتاق uuid غیرقابل حدس است، ولی امنیت نباید به آن تکیه کند.
   * کسی که طرف رزرو نیست حتی اگر شناسه را بداند توکن نمی‌گیرد.
   */
  it("غیرطرفِ رزرو ۴۰۳ می‌گیرد", async () => {
    const booking = await seedBooking();

    const response = await join(booking.id, otherStudentToken).expect(403);

    expect(response.body.code).toBe("NOT_PARTICIPANT");
  });

  it("رزرو پرداخت‌نشده توکن نمی‌گیرد", async () => {
    const booking = await seedBooking({ status: "PENDING_PAYMENT" });

    const response = await join(booking.id, studentToken).expect(409);

    expect(response.body.code).toBe("NOT_JOINABLE");
    expect(response.body.message).toContain("پرداخت");
  });

  it("رزرو لغوشده توکن نمی‌گیرد", async () => {
    const booking = await seedBooking({ status: "CANCELLED_BY_STUDENT" });

    const response = await join(booking.id, studentToken).expect(409);

    expect(response.body.code).toBe("NOT_JOINABLE");
  });

  /**
   * قاعده‌ی این ماژول: خارج از بازه توکن **صادر نمی‌شود**، نه اینکه صادر
   * شود و جیتسی ردش کند.
   */
  it("پیش از باز شدن اتاق توکن نمی‌دهد و می‌گوید کِی باز می‌شود", async () => {
    const booking = await seedBooking({ startsInMinutes: 60 });

    const response = await join(booking.id, studentToken).expect(409);

    expect(response.body.code).toBe("ROOM_NOT_OPEN");
    expect(response.body.jwt).toBeUndefined();

    // ۱۰ دقیقه پیش از شروع، یعنی ۵۰ دقیقه‌ی دیگر
    const opensIn = (Date.parse(response.body.opensAt) - Date.now()) / MINUTE_MS;
    expect(opensIn).toBeGreaterThan(48);
    expect(opensIn).toBeLessThan(51);
  });

  it("پس از بسته شدن اتاق توکن نمی‌دهد", async () => {
    // جلسه‌ی ۶۰ دقیقه‌ای که ۲ ساعت پیش شروع شده: مهلت ۱۵ دقیقه‌ای هم گذشته
    const booking = await seedBooking({ startsInMinutes: -120 });

    const response = await join(booking.id, studentToken).expect(409);

    expect(response.body.code).toBe("ROOM_CLOSED");
    expect(response.body.jwt).toBeUndefined();
  });

  it("در آخرین دقایق مهلتِ پس از جلسه هنوز توکن می‌دهد", async () => {
    // شروع ۷۰ دقیقه پیش، پایان ۱۰ دقیقه پیش، مهلت تا ۵ دقیقه‌ی دیگر
    const booking = await seedBooking({ startsInMinutes: -70 });

    await join(booking.id, studentToken).expect(200);
  });

  it("رزروِ در حال برگزاری هم توکن می‌گیرد", async () => {
    const booking = await seedBooking({ status: "IN_PROGRESS" });

    await join(booking.id, teacherToken).expect(200);
  });

  it("توکنِ هنرجو ادعاهای درست دارد", async () => {
    const booking = await seedBooking();

    const response = await join(booking.id, studentToken).expect(200);

    expect(response.body.domain).toBe(JITSI.domain);
    expect(response.body.roomName).toBe(booking.roomId);
    expect(response.body.moderator).toBe(false);

    const claims = await verifyJitsiToken(response.body.jwt);

    expect(claims.iss).toBe(JITSI.appId);
    expect(claims.aud).toBe(JITSI.audience);
    expect(claims.room).toBe(booking.roomId);
    expect(claims.context?.user?.name).toBe("هنرجوی الف");
    expect(claims.context?.user?.id).toBe(fixture.studentId);
    // نبودن این کلید یعنی شرکت‌کننده‌ی عادی
    expect(claims.context?.user?.moderator).toBeUndefined();
  });

  /**
   * `typ` در هدر اجباری است.
   *
   * `jose` پیش‌فرض نمی‌گذاردش و prosody بدون آن توکن را رد می‌کند
   * (`reason:Invalid typ`). مرورگر همان «Sorry, you're not allowed to
   * join this call» را نشان می‌دهد که برای اتاقِ اشتباه هم می‌آید، پس
   * حذف تصادفی‌اش بدون این تست تا سرور کشف نمی‌شود.
   */
  it("هدر توکن typ=JWT دارد", async () => {
    const booking = await seedBooking();

    const response = await join(booking.id, studentToken).expect(200);

    expect(decodeProtectedHeader(response.body.jwt)).toEqual({
      alg: "HS256",
      typ: "JWT",
    });
  });

  /**
   * این تست به‌خاطر یک اشتباه واقعی نوشته شده: `sub` دامنه‌ی XMPP داخلی
   * است، نه دامنه‌ی عمومی که مرورگر می‌بیند. توکنی که دامنه‌ی عمومی را
   * در `sub` بگذارد امضای معتبر دارد ولی prosody ردش می‌کند.
   */
  it("ادعای sub دامنه‌ی XMPP داخلی است نه دامنه‌ی عمومی", async () => {
    const booking = await seedBooking();

    const response = await join(booking.id, studentToken).expect(200);
    const claims = await verifyJitsiToken(response.body.jwt);

    expect(claims.sub).toBe(JITSI.xmppDomain);
    expect(claims.sub).not.toBe(JITSI.domain);
  });

  it("فقط استاد مدیر جلسه است", async () => {
    const booking = await seedBooking();

    const response = await join(booking.id, teacherToken).expect(200);

    expect(response.body.moderator).toBe(true);

    const claims = await verifyJitsiToken(response.body.jwt);
    // prosody این را به صورت رشته می‌خواند نه بولین
    expect(claims.context?.user?.moderator).toBe("true");
    expect(claims.context?.user?.name).toBe("استاد رضایی");
  });

  /**
   * `nbf` و `exp` باید دقیقاً دو لبه‌ی پنجره‌ی مجاز باشند، وگرنه توکنِ
   * یک جلسه کلیدِ همیشگی همان اتاق می‌شود.
   */
  it("عمر توکن به همان پنجره‌ی مجاز ورود محدود است", async () => {
    const booking = await seedBooking({ startsInMinutes: -5, durationMinutes: 60 });

    const response = await join(booking.id, studentToken).expect(200);
    const claims = await verifyJitsiToken(response.body.jwt);

    const scheduledAt = Date.now() - 5 * MINUTE_MS;
    const endsAt = scheduledAt + 60 * MINUTE_MS;

    expect(claims.nbf! * 1000).toBeCloseTo(scheduledAt - 10 * MINUTE_MS, -4);
    expect(claims.exp! * 1000).toBeCloseTo(endsAt + 15 * MINUTE_MS, -4);
    expect(Date.parse(response.body.expiresAt)).toBeCloseTo(endsAt + 15 * MINUTE_MS, -4);
  });

  /**
   * حالت موسیقی. بدون این، پردازش‌های پیش‌فرض صوتی جیتسی صدای ساز را
   * تخریب می‌کنند — بحرانی‌ترین بخش فنی این ماژول.
   */
  it("پروفایل حالت موسیقی را برمی‌گرداند", async () => {
    const booking = await seedBooking();

    const { body } = await join(booking.id, studentToken).expect(200);

    expect(body.config).toMatchObject({
      disableAP: true,
      disableAEC: true,
      disableNS: true,
      disableAGC: true,
      enableNoisyMicDetection: false,
      enableNoAudioDetection: false,
      audioQuality: { stereo: true },
    });

    expect(body.config.audioQuality.opusMaxAverageBitrate).toBeGreaterThan(40_000);

    /**
     * `stereo` و `opusMaxAverageBitrate` نباید سطح بالا بیایند: لایه‌ی
     * سازگاری جیتسی اگر آن‌ها را ببیند کل `audioQuality` را بازنویسی
     * می‌کند و بقیه‌ی کلیدها را می‌خورد.
     */
    expect(body.config.stereo).toBeUndefined();
    expect(body.config.opusMaxAverageBitrate).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------

describe("POST /api/bookings/:id/attendance", () => {
  it("ورود را ثبت می‌کند و جلسه را در حال برگزاری علامت می‌زند", async () => {
    const booking = await seedBooking();

    const response = await reportAttendance(booking.id, teacherToken, "JOINED").expect(200);

    expect(response.body.status).toBe("IN_PROGRESS");
    expect(response.body.actualStartedAt).not.toBeNull();

    const stored = await readBooking(booking.id);
    expect(stored.status).toBe("IN_PROGRESS");
    expect(stored.actualStartedAt).not.toBeNull();
  });

  /** «کِی جلسه شروع شد» یعنی لحظه‌ی ورود اولین نفر، نه آخرین نفر. */
  it("ورود نفر دوم لحظه‌ی شروع را جابه‌جا نمی‌کند", async () => {
    const booking = await seedBooking();

    const first = await reportAttendance(booking.id, teacherToken, "JOINED").expect(200);
    const second = await reportAttendance(booking.id, studentToken, "JOINED").expect(200);

    expect(second.body.actualStartedAt).toBe(first.body.actualStartedAt);
  });

  /**
   * تفکیک طرف‌ها، چیزی که جاروی عدم حضور رویش بنا شده.
   *
   * `actual_started_at` فقط می‌گوید «کسی آمد». اگر ستون طرفِ اشتباه پر
   * شود، جارو عدم حضور استاد را با عدم حضور هنرجو عوضی می‌گیرد و پول
   * در جهت اشتباه جابه‌جا می‌شود.
   */
  it("ورود هر طرف را جدا ثبت می‌کند", async () => {
    const booking = await seedBooking();

    await reportAttendance(booking.id, teacherToken, "JOINED").expect(200);

    const afterTeacher = await readBooking(booking.id);
    expect(afterTeacher.teacherJoinedAt).not.toBeNull();
    expect(afterTeacher.studentJoinedAt).toBeNull();

    await reportAttendance(booking.id, studentToken, "JOINED").expect(200);

    const afterStudent = await readBooking(booking.id);
    expect(afterStudent.studentJoinedAt).not.toBeNull();
    // ورود هنرجو نباید لحظه‌ی ورود استاد را جابه‌جا کند
    expect(afterStudent.teacherJoinedAt).toEqual(afterTeacher.teacherJoinedAt);
  });

  /** قطع و وصل شدن شبکه‌ی استاد نباید ورود اولش را عقب بیندازد. */
  it("ورود دوباره‌ی همان نفر لحظه‌ی ورودش را جابه‌جا نمی‌کند", async () => {
    const booking = await seedBooking();

    await reportAttendance(booking.id, teacherToken, "JOINED").expect(200);
    const first = await readBooking(booking.id);

    await reportAttendance(booking.id, teacherToken, "JOINED").expect(200);
    const second = await readBooking(booking.id);

    expect(second.teacherJoinedAt).toEqual(first.teacherJoinedAt);
  });

  it("خروج پس از ورود، پایان واقعی را ثبت می‌کند", async () => {
    const booking = await seedBooking();

    await reportAttendance(booking.id, teacherToken, "JOINED").expect(200);
    const response = await reportAttendance(booking.id, teacherToken, "LEFT").expect(200);

    expect(response.body.actualEndedAt).not.toBeNull();

    const stored = await readBooking(booking.id);
    expect(stored.actualEndedAt).not.toBeNull();
    expect(stored.actualStartedAt!.getTime()).toBeLessThanOrEqual(
      stored.actualEndedAt!.getTime(),
    );
  });

  /** پایانِ بدونِ شروع داده‌ی بی‌معنایی است؛ نوشته نمی‌شود. */
  it("خروجِ بدون ورود چیزی ثبت نمی‌کند", async () => {
    const booking = await seedBooking();

    const response = await reportAttendance(booking.id, teacherToken, "LEFT").expect(200);

    expect(response.body.actualEndedAt).toBeNull();
    expect((await readBooking(booking.id)).actualEndedAt).toBeNull();
  });

  it("غیرطرفِ رزرو نمی‌تواند حضور ثبت کند", async () => {
    const booking = await seedBooking();

    const response = await reportAttendance(booking.id, otherStudentToken, "JOINED").expect(
      403,
    );

    expect(response.body.code).toBe("NOT_PARTICIPANT");
    expect((await readBooking(booking.id)).status).toBe("CONFIRMED");
  });

  it("خارج از پنجره‌ی اتاق حضور ثبت نمی‌شود", async () => {
    const booking = await seedBooking({ startsInMinutes: 60 });

    const response = await reportAttendance(booking.id, teacherToken, "JOINED").expect(409);

    expect(response.body.code).toBe("ROOM_NOT_OPEN");
    expect((await readBooking(booking.id)).actualStartedAt).toBeNull();
  });

  it("رویداد ناشناخته رد می‌شود", async () => {
    const booking = await seedBooking();

    const response = await reportAttendance(booking.id, teacherToken, "MAYBE").expect(400);

    expect(response.body.code).toBe("VALIDATION_ERROR");
  });
});
