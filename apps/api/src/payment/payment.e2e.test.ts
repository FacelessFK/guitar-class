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
import { bookings } from "../db/schema/index.js";
import {
  accessTokenFor,
  closeDatabase,
  resetDatabase,
  resetRedis,
  seedFixture,
  type Fixture,
} from "../test/fixtures.js";
import { FakePaymentGateway, setPaymentGateway } from "./gateway.port.js";

/**
 * تست‌های end-to-end مسیر پرداخت.
 *
 * درگاه جعلی است ولی جای دیگری ماک نشده: اپ واقعی نست بالا می‌آید،
 * گارد سراسری سر جایش است، و کال‌بک همان‌طور که مرورگر کاربر صدایش
 * می‌زند صدا زده می‌شود — بدون هدر `Authorization`.
 */

const SATURDAY = "2026-08-15";

let app: INestApplication;
let server: App;
let fixture: Fixture;
let studentToken: string;
let otherStudentToken: string;
let teacherToken: string;
let gateway: FakePaymentGateway;

beforeAll(async () => {
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

  // درگاه تازه در هر تست، تا شناسه‌های تست قبلی نشت نکنند
  gateway = new FakePaymentGateway();
  setPaymentGateway(gateway);

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

/** رزرو جلسه‌ی تکی از راه HTTP، همان مسیری که فرانت می‌رود. */
async function bookSingle(hour = 17): Promise<string> {
  const response = await request(server)
    .post("/api/bookings/single")
    .set("Authorization", `Bearer ${studentToken}`)
    .send({
      teacherProfileId: fixture.teacherProfileId,
      offeringId: fixture.offeringId,
      date: SATURDAY,
      startMinute: hour * 60,
    })
    .expect(201);

  return response.body.id as string;
}

async function checkout(bookingId: string): Promise<{ orderId: string; authority: string }> {
  const response = await request(server)
    .post("/api/payments/checkout")
    .set("Authorization", `Bearer ${studentToken}`)
    .send({ bookingId })
    .expect(201);

  const authority = new URL(response.body.redirectUrl as string).searchParams.get(
    "Authority",
  );

  return { orderId: response.body.orderId as string, authority: authority! };
}

// ---------------------------------------------------------------------------

describe("POST /api/payments/checkout", () => {
  it("بدون توکن ۴۰۱ می‌دهد", async () => {
    await request(server).post("/api/payments/checkout").send({}).expect(401);
  });

  it("سفارش می‌سازد و آدرس درگاه می‌دهد", async () => {
    const bookingId = await bookSingle();

    const response = await request(server)
      .post("/api/payments/checkout")
      .set("Authorization", `Bearer ${studentToken}`)
      .send({ bookingId })
      .expect(201);

    // مبلغ باید رشته باشد نه عدد، تا در کلاینت به ممیز شناور تبدیل نشود
    expect(response.body.amount).toBe("3000000");
    expect(typeof response.body.amount).toBe("string");
    expect(response.body.gateway).toBe("fake");
    expect(response.body.redirectUrl).toContain("Authority=");
  });

  it("رزرو کاربر دیگر پیدا نمی‌شود", async () => {
    const bookingId = await bookSingle();

    const response = await request(server)
      .post("/api/payments/checkout")
      .set("Authorization", `Bearer ${otherStudentToken}`)
      .send({ bookingId })
      .expect(404);

    expect(response.body.code).toBe("BOOKING_NOT_FOUND");
  });

  it("فرستادن هم‌زمان رزرو و پکیج رد می‌شود", async () => {
    const bookingId = await bookSingle();

    const response = await request(server)
      .post("/api/payments/checkout")
      .set("Authorization", `Bearer ${studentToken}`)
      .send({ bookingId, enrollmentId: bookingId })
      .expect(400);

    expect(response.body.code).toBe("VALIDATION_ERROR");
  });

  it("جلسه‌ی معارفه پرداخت نمی‌خواهد", async () => {
    const trial = await request(server)
      .post("/api/bookings/trial")
      .set("Authorization", `Bearer ${studentToken}`)
      .send({
        teacherProfileId: fixture.teacherProfileId,
        offeringId: fixture.offeringId,
        date: SATURDAY,
        startMinute: 19 * 60,
      })
      .expect(201);

    const response = await request(server)
      .post("/api/payments/checkout")
      .set("Authorization", `Bearer ${studentToken}`)
      .send({ bookingId: trial.body.id })
      .expect(409);

    expect(response.body.code).toBe("NOT_PAYABLE");
  });
});

// ---------------------------------------------------------------------------

describe("GET /api/payments/callback", () => {
  /**
   * کال‌بک باید بدون توکن کار کند: کاربر با ریدایرکت مرورگر برمی‌گردد و
   * هدر `Authorization` همراهش نیست. اگر این مسیر `@Public()` نباشد،
   * هیچ پرداختی هرگز قطعی نمی‌شود.
   */
  it("بدون توکن رزرو را قطعی می‌کند و به صفحه‌ی نتیجه می‌فرستد", async () => {
    const bookingId = await bookSingle();
    const { orderId, authority } = await checkout(bookingId);

    const response = await request(server)
      .get("/api/payments/callback")
      .query({ Authority: authority, Status: "OK" })
      .expect(302);

    const location = new URL(response.headers.location!);
    expect(location.pathname).toBe("/payment/result");
    expect(location.searchParams.get("status")).toBe("paid");
    expect(location.searchParams.get("order")).toBe(orderId);

    const [stored] = await db
      .select({ status: bookings.status })
      .from(bookings)
      .where(eq(bookings.id, bookingId));
    expect(stored?.status).toBe("CONFIRMED");
  });

  /**
   * این آدرس عمومی است و هر کسی می‌تواند با هر پارامتری صدایش بزند.
   * شناسه‌ی ساختگی نباید هیچ رزروی را قطعی کند.
   */
  it("شناسه‌ی ساختگی هیچ رزروی را قطعی نمی‌کند", async () => {
    const bookingId = await bookSingle();
    await checkout(bookingId);

    const response = await request(server)
      .get("/api/payments/callback")
      .query({ Authority: "FAKE-fabricated", Status: "OK" })
      .expect(302);

    const location = new URL(response.headers.location!);
    expect(location.searchParams.get("status")).toBe("error");
    expect(location.searchParams.get("code")).toBe("ORDER_NOT_FOUND");

    const [stored] = await db
      .select({ status: bookings.status })
      .from(bookings)
      .where(eq(bookings.id, bookingId));
    expect(stored?.status).toBe("PENDING_PAYMENT");
  });

  /**
   * برعکسش هم درست است: `Status` مرورگر در تصمیم‌گیری نقشی ندارد. تنها
   * منبع حقیقت، تأیید سرور به سرور است.
   */
  it("پرداختِ واقعاً ناموفق، با Status=OK هم قطعی نمی‌شود", async () => {
    const bookingId = await bookSingle();
    const { authority } = await checkout(bookingId);

    gateway.fail(authority);

    const response = await request(server)
      .get("/api/payments/callback")
      .query({ Authority: authority, Status: "OK" })
      .expect(302);

    expect(new URL(response.headers.location!).searchParams.get("status")).toBe("failed");

    const [stored] = await db
      .select({ status: bookings.status })
      .from(bookings)
      .where(eq(bookings.id, bookingId));
    expect(stored?.status).toBe("PENDING_PAYMENT");
  });

  it("رفرش صفحه‌ی بازگشت دوباره چیزی ثبت نمی‌کند", async () => {
    const bookingId = await bookSingle();
    const { authority } = await checkout(bookingId);

    await request(server).get("/api/payments/callback").query({ Authority: authority }).expect(302);
    const second = await request(server)
      .get("/api/payments/callback")
      .query({ Authority: authority })
      .expect(302);

    expect(new URL(second.headers.location!).searchParams.get("status")).toBe("paid");

    const earnings = await request(server)
      .get("/api/payments/earnings")
      .set("Authorization", `Bearer ${teacherToken}`)
      .expect(200);

    expect(earnings.body.entries).toHaveLength(1);
  });

  it("بدون پارامتر Authority رد می‌شود", async () => {
    const response = await request(server).get("/api/payments/callback").expect(400);
    expect(response.body.code).toBe("VALIDATION_ERROR");
  });
});

// ---------------------------------------------------------------------------

describe("سفارش‌ها و درآمد", () => {
  it("سفارش خودش را می‌بیند", async () => {
    const bookingId = await bookSingle();
    const { orderId } = await checkout(bookingId);

    const response = await request(server)
      .get(`/api/payments/orders/${orderId}`)
      .set("Authorization", `Bearer ${studentToken}`)
      .expect(200);

    expect(response.body.id).toBe(orderId);
    expect(response.body.status).toBe("PENDING");
    expect(response.body.amount).toBe("3000000");
  });

  it("سفارش کاربر دیگر را نمی‌بیند", async () => {
    const bookingId = await bookSingle();
    const { orderId } = await checkout(bookingId);

    const response = await request(server)
      .get(`/api/payments/orders/${orderId}`)
      .set("Authorization", `Bearer ${otherStudentToken}`)
      .expect(200);

    expect(response.body).toEqual({});
  });

  it("درآمد استاد پس از کمیسیون گزارش می‌شود", async () => {
    const bookingId = await bookSingle();
    const { authority } = await checkout(bookingId);
    await request(server).get("/api/payments/callback").query({ Authority: authority }).expect(302);

    const response = await request(server)
      .get("/api/payments/earnings")
      .set("Authorization", `Bearer ${teacherToken}`)
      .expect(200);

    expect(response.body.gross).toBe("3000000");
    expect(response.body.commission).toBe("600000");
    expect(response.body.net).toBe("2400000");
    expect(response.body.entries[0].type).toBe("EARNING");
  });

  it("کاربری که استاد نیست درآمد صفر دارد", async () => {
    const response = await request(server)
      .get("/api/payments/earnings")
      .set("Authorization", `Bearer ${studentToken}`)
      .expect(200);

    expect(response.body).toEqual({
      gross: "0",
      commission: "0",
      net: "0",
      earned: "0",
      paidOut: "0",
      outstanding: "0",
      entries: [],
    });
  });
});

// ---------------------------------------------------------------------------

describe("لغو پس از پرداخت", () => {
  it("لغو زودهنگام، بازپرداخت را ثبت می‌کند و درآمد را صفر می‌کند", async () => {
    const bookingId = await bookSingle();
    const { authority } = await checkout(bookingId);
    await request(server).get("/api/payments/callback").query({ Authority: authority }).expect(302);

    const response = await request(server)
      .post(`/api/bookings/${bookingId}/cancel`)
      .set("Authorization", `Bearer ${studentToken}`)
      .send({ reason: "برنامه‌ام عوض شد" })
      .expect(201);

    expect(response.body.refundable).toBe(true);
    expect(response.body.refunded).toBe(true);

    const earnings = await request(server)
      .get("/api/payments/earnings")
      .set("Authorization", `Bearer ${teacherToken}`)
      .expect(200);

    expect(earnings.body.net).toBe("0");
    expect(earnings.body.entries).toHaveLength(2);
  });

  /**
   * `refundable` تصمیم سیاست است و `refunded` اتفاق مالی. رزروی که
   * پرداخت نشده، برگشت‌پذیر است ولی چیزی برای برگرداندن ندارد.
   */
  it("لغو رزروِ پرداخت‌نشده برگشت‌پذیر است ولی بازپرداختی ندارد", async () => {
    const bookingId = await bookSingle();

    const response = await request(server)
      .post(`/api/bookings/${bookingId}/cancel`)
      .set("Authorization", `Bearer ${studentToken}`)
      .send({})
      .expect(201);

    expect(response.body.refundable).toBe(true);
    expect(response.body.refunded).toBe(false);
  });
});
