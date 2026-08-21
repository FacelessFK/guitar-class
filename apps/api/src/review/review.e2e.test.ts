import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
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
 * امتیاز و نظرِ هنرجو به استاد.
 *
 * محورِ این فایل همان قاعده‌ی مشترک همه‌ی ماژول‌هاست: نظر روی یک
 * **رزروِ تمام‌شده‌ی متعلق به همین هنرجو** بنا می‌شود، و هیچ‌کدام از این
 * دو شرط از ورودی خوانده نمی‌شود. یکتاییِ `booking_id` هم اسپم را
 * می‌بندد و هم تجمیعِ کاتالوگ را قابل‌اعتماد نگه می‌دارد.
 */

let app: INestApplication;
let server: App;
let fixture: Fixture;
let studentToken: string;
let teacherToken: string;
let otherToken: string;
let completedBookingId: string;

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

  app = moduleRef.createNestApplication();
  app.setGlobalPrefix("api");
  app.useGlobalFilters(new AuthExceptionFilter(), new DomainExceptionFilter());
  app.useGlobalInterceptors(new BigIntSerializationInterceptor());
  await app.init();

  server = app.getHttpServer() as App;
});

/**
 * یک رزرو با وضعیت دلخواه می‌سازد.
 *
 * نظر روی جلسه‌ی برگزارشده معنا دارد، پس بیشترِ تست‌ها `COMPLETED`
 * می‌خواهند؛ ولی تستِ «هنوز تمام نشده» به یک رزروِ `CONFIRMED` هم نیاز
 * دارد، برای همین وضعیت پارامتر است.
 */
async function seedBooking(
  status: "COMPLETED" | "CONFIRMED",
  studentId = fixture.studentId,
): Promise<string> {
  const scheduledAt = new Date(Date.now() - 3 * 86_400_000);
  const endsAt = new Date(scheduledAt.getTime() + 60 * 60_000);

  const [row] = await db
    .insert(bookings)
    .values({
      studentId,
      teacherId: fixture.teacherUserId,
      offeringId: fixture.offeringId,
      type: "SINGLE",
      scheduledAt,
      endsAt,
      durationMinutes: 60,
      status,
      priceSnapshot: 3_000_000n,
      commissionSnapshot: "20",
    })
    .returning({ id: bookings.id });

  return row!.id;
}

beforeEach(async () => {
  await resetDatabase();
  await resetRedis();
  fixture = await seedFixture();
  completedBookingId = await seedBooking("COMPLETED");

  [studentToken, teacherToken, otherToken] = await Promise.all([
    accessTokenFor(fixture.studentId),
    accessTokenFor(fixture.teacherUserId),
    accessTokenFor(fixture.otherStudentId),
  ]);
});

afterAll(async () => {
  await app.close();
  await closeDatabase();
});

describe("ثبت نظر", () => {
  it("هنرجوی جلسه‌ی تمام‌شده نظر ثبت می‌کند", async () => {
    const response = await request(server)
      .post("/api/reviews")
      .set("authorization", `Bearer ${studentToken}`)
      .send({ bookingId: completedBookingId, rating: 5, comment: "عالی بود" })
      .expect(201);

    expect(response.body.id).toBeTruthy();
  });

  it("امتیاز و نظر بدونِ متن هم پذیرفته می‌شود", async () => {
    await request(server)
      .post("/api/reviews")
      .set("authorization", `Bearer ${studentToken}`)
      .send({ bookingId: completedBookingId, rating: 4 })
      .expect(201);
  });

  it("نظرِ دوم روی همان جلسه رد می‌شود", async () => {
    await request(server)
      .post("/api/reviews")
      .set("authorization", `Bearer ${studentToken}`)
      .send({ bookingId: completedBookingId, rating: 5 })
      .expect(201);

    const second = await request(server)
      .post("/api/reviews")
      .set("authorization", `Bearer ${studentToken}`)
      .send({ bookingId: completedBookingId, rating: 3 })
      .expect(409);

    expect(second.body.code).toBe("REVIEW_ALREADY_EXISTS");
  });

  it("کسی جز هنرجوی همان جلسه نمی‌تواند نظر بدهد", async () => {
    // استادِ همان جلسه
    const byTeacher = await request(server)
      .post("/api/reviews")
      .set("authorization", `Bearer ${teacherToken}`)
      .send({ bookingId: completedBookingId, rating: 5 })
      .expect(403);
    expect(byTeacher.body.code).toBe("NOT_PARTICIPANT");

    // هنرجوی دیگری که طرفِ این جلسه نیست
    await request(server)
      .post("/api/reviews")
      .set("authorization", `Bearer ${otherToken}`)
      .send({ bookingId: completedBookingId, rating: 5 })
      .expect(403);
  });

  it("جلسه‌ای که هنوز تمام نشده نظر نمی‌گیرد", async () => {
    const confirmedBooking = await seedBooking("CONFIRMED");

    const response = await request(server)
      .post("/api/reviews")
      .set("authorization", `Bearer ${studentToken}`)
      .send({ bookingId: confirmedBooking, rating: 5 })
      .expect(409);

    expect(response.body.code).toBe("SESSION_NOT_REVIEWABLE");
  });

  it("امتیاز خارج از بازه‌ی ۱ تا ۵ رد می‌شود", async () => {
    await request(server)
      .post("/api/reviews")
      .set("authorization", `Bearer ${studentToken}`)
      .send({ bookingId: completedBookingId, rating: 6 })
      .expect(400);

    await request(server)
      .post("/api/reviews")
      .set("authorization", `Bearer ${studentToken}`)
      .send({ bookingId: completedBookingId, rating: 0 })
      .expect(400);
  });

  it("بدون ورود، رد می‌شود", async () => {
    await request(server)
      .post("/api/reviews")
      .send({ bookingId: completedBookingId, rating: 5 })
      .expect(401);
  });
});

describe("فهرست و تجمیعِ نظرها", () => {
  it("نظرِ ثبت‌شده در فهرست عمومیِ استاد دیده می‌شود", async () => {
    await request(server)
      .post("/api/reviews")
      .set("authorization", `Bearer ${studentToken}`)
      .send({ bookingId: completedBookingId, rating: 5, comment: "منظم و دقیق" })
      .expect(201);

    const list = await request(server)
      .get("/api/teachers/rezaei/reviews")
      .expect(200);

    expect(list.body.total).toBe(1);
    expect(list.body.reviews).toHaveLength(1);
    expect(list.body.reviews[0]).toMatchObject({
      rating: 5,
      comment: "منظم و دقیق",
      studentName: "هنرجوی الف",
    });
  });

  it("میانگینِ امتیاز و شمارِ کلاس در کارتِ کاتالوگ می‌آید", async () => {
    // پیش از هر نظری: میانگین تهی، شمار صفر نیست چون یک جلسه‌ی
    // COMPLETED از قبل هست
    const before = await request(server).get("/api/teachers/rezaei").expect(200);
    expect(before.body.rating).toEqual({ average: null, count: 0 });
    expect(before.body.classesTaught).toBe(1);

    await request(server)
      .post("/api/reviews")
      .set("authorization", `Bearer ${studentToken}`)
      .send({ bookingId: completedBookingId, rating: 4 })
      .expect(201);

    const after = await request(server).get("/api/teachers/rezaei").expect(200);
    expect(after.body.rating).toEqual({ average: 4, count: 1 });
  });

  it("میانگین از چند نظر درست حساب می‌شود", async () => {
    const secondBooking = await seedBooking("COMPLETED", fixture.otherStudentId);

    await request(server)
      .post("/api/reviews")
      .set("authorization", `Bearer ${studentToken}`)
      .send({ bookingId: completedBookingId, rating: 5 })
      .expect(201);
    await request(server)
      .post("/api/reviews")
      .set("authorization", `Bearer ${otherToken}`)
      .send({ bookingId: secondBooking, rating: 4 })
      .expect(201);

    const card = await request(server).get("/api/teachers/rezaei").expect(200);
    // (۵ + ۴) ÷ ۲ = ۴.۵
    expect(card.body.rating).toEqual({ average: 4.5, count: 2 });
  });
});

describe("جلسه‌های واجدِ نظر", () => {
  it("جلسه‌ی تمام‌شده‌ی بی‌نظر در فهرست منتظر می‌آید و پس از نظر می‌رود", async () => {
    const before = await request(server)
      .get("/api/reviews/pending")
      .set("authorization", `Bearer ${studentToken}`)
      .expect(200);
    expect(before.body.bookingIds).toContain(completedBookingId);

    await request(server)
      .post("/api/reviews")
      .set("authorization", `Bearer ${studentToken}`)
      .send({ bookingId: completedBookingId, rating: 5 })
      .expect(201);

    const after = await request(server)
      .get("/api/reviews/pending")
      .set("authorization", `Bearer ${studentToken}`)
      .expect(200);
    expect(after.body.bookingIds).not.toContain(completedBookingId);
  });
});
