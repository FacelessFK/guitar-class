import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import type { App } from "supertest/types.js";

import { AppModule } from "./app.module.js";
import { BookingExceptionFilter } from "./common/booking-exception.filter.js";
import { BigIntSerializationInterceptor } from "./common/serialization.interceptor.js";
import { closeDatabase, resetDatabase, seedFixture, type Fixture } from "./test/fixtures.js";

/**
 * تست‌های end-to-end لایه‌ی HTTP.
 *
 * اپلیکیشن واقعی Nest بالا می‌آید و به پستگرس واقعی وصل می‌شود، پس
 * اعتبارسنجی، فیلتر خطا، سریال‌سازی و مسیریابی همگی در مسیر واقعی
 * سنجیده می‌شوند.
 */

const SATURDAY = "2026-08-15";

let app: INestApplication;
let server: App;
let fixture: Fixture;

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

  app = moduleRef.createNestApplication();
  app.setGlobalPrefix("api");
  app.useGlobalFilters(new BookingExceptionFilter());
  app.useGlobalInterceptors(new BigIntSerializationInterceptor());
  await app.init();

  server = app.getHttpServer() as App;
});

beforeEach(async () => {
  await resetDatabase();
  fixture = await seedFixture();
});

afterAll(async () => {
  await app.close();
  await closeDatabase();
});

describe("GET /api/health", () => {
  it("سلامت سرویس و دیتابیس را گزارش می‌کند", async () => {
    const response = await request(server).get("/api/health").expect(200);
    expect(response.body).toEqual({ status: "ok", database: "ok" });
  });
});

describe("کاتالوگ", () => {
  it("سازهای فعال را برمی‌گرداند", async () => {
    const response = await request(server).get("/api/instruments").expect(200);
    expect(response.body.instruments).toHaveLength(1);
    expect(response.body.instruments[0].slug).toBe("classical-guitar");
  });

  it("استادهای تأییدشده را با سرویس‌هایشان برمی‌گرداند", async () => {
    const response = await request(server).get("/api/teachers").expect(200);

    expect(response.body.teachers).toHaveLength(1);
    const teacher = response.body.teachers[0];
    expect(teacher.slug).toBe("rezaei");
    expect(teacher.offerings).toHaveLength(1);
    // مبلغ باید رشته باشد نه عدد، تا در کلاینت به ممیز شناور تبدیل نشود
    expect(teacher.offerings[0].price).toBe("3000000");
    expect(typeof teacher.offerings[0].price).toBe("string");
  });

  it("بر اساس ساز فیلتر می‌کند", async () => {
    await request(server).get("/api/teachers?instrument=santoor").expect(200).expect(
      (response) => {
        expect(response.body.teachers).toHaveLength(0);
      },
    );
  });

  it("استاد ناموجود را ۴۰۴ می‌دهد", async () => {
    const response = await request(server).get("/api/teachers/ghost").expect(404);
    expect(response.body.code).toBe("TEACHER_NOT_FOUND");
  });
});

describe("GET /api/offerings/:id/availability", () => {
  it("اسلات‌ها را با ساعت تهران و نام روز برمی‌گرداند", async () => {
    const response = await request(server)
      .get(`/api/offerings/${fixture.offeringId}/availability`)
      .query({
        teacherProfileId: fixture.teacherProfileId,
        from: SATURDAY,
        to: SATURDAY,
      })
      .expect(200);

    expect(response.body.slots).toHaveLength(4);
    expect(response.body.slots[0]).toMatchObject({
      date: SATURDAY,
      startTime: "16:00",
      endTime: "17:00",
      weekdayName: "شنبه",
    });
  });

  it("جلسه‌ی معارفه اسلات‌های ۲۰ دقیقه‌ای می‌دهد", async () => {
    const response = await request(server)
      .get(`/api/offerings/${fixture.offeringId}/availability/trial`)
      .query({
        teacherProfileId: fixture.teacherProfileId,
        from: SATURDAY,
        to: SATURDAY,
      })
      .expect(200);

    expect(response.body.slots).toHaveLength(12);
    expect(response.body.slots[1].startTime).toBe("16:20");
  });

  it("بازه‌ی بیش از ۶۲ روز را رد می‌کند", async () => {
    const response = await request(server)
      .get(`/api/offerings/${fixture.offeringId}/availability`)
      .query({
        teacherProfileId: fixture.teacherProfileId,
        from: "2026-01-01",
        to: "2026-12-31",
      })
      .expect(400);

    expect(response.body.code).toBe("VALIDATION_ERROR");
  });

  it("شناسه‌ی نامعتبر را رد می‌کند", async () => {
    await request(server)
      .get("/api/offerings/not-a-uuid/availability")
      .query({
        teacherProfileId: fixture.teacherProfileId,
        from: SATURDAY,
        to: SATURDAY,
      })
      .expect(400);
  });
});

describe("POST /api/bookings/single", () => {
  const slot = { date: SATURDAY, startMinute: 17 * 60 };

  it("بدون هدر کاربر، ۴۰۱ می‌دهد", async () => {
    await request(server)
      .post("/api/bookings/single")
      .send({ ...slot, teacherProfileId: fixture.teacherProfileId, offeringId: fixture.offeringId })
      .expect(401);
  });

  it("رزرو می‌سازد و مهلت پرداخت را برمی‌گرداند", async () => {
    const response = await request(server)
      .post("/api/bookings/single")
      .set("x-user-id", fixture.studentId)
      .send({
        ...slot,
        teacherProfileId: fixture.teacherProfileId,
        offeringId: fixture.offeringId,
      })
      .expect(201);

    expect(response.body).toMatchObject({
      status: "PENDING_PAYMENT",
      date: SATURDAY,
      startTime: "17:00",
      weekdayName: "شنبه",
      price: "3000000",
    });
    expect(response.body.holdExpiresAt).not.toBeNull();
    expect(response.body.roomId).toBeTruthy();
  });

  it("اسلات پرشده را ۴۰۹ با کد ماشین‌خوان می‌دهد", async () => {
    await request(server)
      .post("/api/bookings/single")
      .set("x-user-id", fixture.studentId)
      .send({
        ...slot,
        teacherProfileId: fixture.teacherProfileId,
        offeringId: fixture.offeringId,
      })
      .expect(201);

    const response = await request(server)
      .post("/api/bookings/single")
      .set("x-user-id", fixture.otherStudentId)
      .send({
        ...slot,
        teacherProfileId: fixture.teacherProfileId,
        offeringId: fixture.offeringId,
      })
      .expect(409);

    expect(response.body.code).toBe("SLOT_UNAVAILABLE");
    expect(response.body.message).toContain("آزاد نیست");
  });

  it("ساعت خارج از برنامه‌ی استاد را ۴۰۹ می‌دهد", async () => {
    const response = await request(server)
      .post("/api/bookings/single")
      .set("x-user-id", fixture.studentId)
      .send({
        date: SATURDAY,
        startMinute: 9 * 60,
        teacherProfileId: fixture.teacherProfileId,
        offeringId: fixture.offeringId,
      })
      .expect(409);

    expect(response.body.code).toBe("SLOT_UNAVAILABLE");
  });

  it("دقیقه‌ی خارج از بازه را ۴۰۰ می‌دهد", async () => {
    await request(server)
      .post("/api/bookings/single")
      .set("x-user-id", fixture.studentId)
      .send({
        date: SATURDAY,
        startMinute: 5000,
        teacherProfileId: fixture.teacherProfileId,
        offeringId: fixture.offeringId,
      })
      .expect(400);
  });
});

describe("POST /api/bookings/trial", () => {
  it("جلسه‌ی رایگان قطعی می‌سازد", async () => {
    const response = await request(server)
      .post("/api/bookings/trial")
      .set("x-user-id", fixture.studentId)
      .send({
        date: SATURDAY,
        startMinute: 16 * 60,
        teacherProfileId: fixture.teacherProfileId,
        offeringId: fixture.offeringId,
      })
      .expect(201);

    expect(response.body.status).toBe("CONFIRMED");
    expect(response.body.price).toBe("0");
  });

  it("بار دوم ۴۰۹ می‌دهد", async () => {
    const body = {
      date: SATURDAY,
      startMinute: 16 * 60,
      teacherProfileId: fixture.teacherProfileId,
      offeringId: fixture.offeringId,
    };

    await request(server)
      .post("/api/bookings/trial")
      .set("x-user-id", fixture.studentId)
      .send(body)
      .expect(201);

    const response = await request(server)
      .post("/api/bookings/trial")
      .set("x-user-id", fixture.studentId)
      .send({ ...body, startMinute: 18 * 60 })
      .expect(409);

    expect(response.body.code).toBe("TRIAL_ALREADY_USED");
  });
});

describe("POST /api/bookings/package", () => {
  const body = () => ({
    teacherProfileId: fixture.teacherProfileId,
    offeringId: fixture.offeringId,
    firstSessionDate: SATURDAY,
    startMinute: 17 * 60,
  });

  it("چهار جلسه و مبلغ کل را برمی‌گرداند", async () => {
    const response = await request(server)
      .post("/api/bookings/package")
      .set("x-user-id", fixture.studentId)
      .send(body())
      .expect(201);

    expect(response.body.bookings).toHaveLength(4);
    expect(response.body.priceTotal).toBe("12000000");
    expect(response.body.enrollmentId).toBeTruthy();
  });

  it("تداخل را با فهرست هفته‌های مشکل‌دار برمی‌گرداند", async () => {
    await request(server)
      .post("/api/bookings/single")
      .set("x-user-id", fixture.otherStudentId)
      .send({
        teacherProfileId: fixture.teacherProfileId,
        offeringId: fixture.offeringId,
        date: "2026-08-29",
        startMinute: 17 * 60,
      })
      .expect(201);

    const response = await request(server)
      .post("/api/bookings/package")
      .set("x-user-id", fixture.studentId)
      .send(body())
      .expect(409);

    expect(response.body.code).toBe("PACKAGE_CONFLICT");
    expect(response.body.conflicts).toEqual([
      expect.objectContaining({ sessionIndex: 3, date: "2026-08-29" }),
    ]);
  });
});

describe("پیش‌نمایش پکیج", () => {
  it("بدون ساختن رکورد، جلسات را نشان می‌دهد", async () => {
    const response = await request(server)
      .post(`/api/offerings/${fixture.offeringId}/availability/package-preview`)
      .send({
        teacherProfileId: fixture.teacherProfileId,
        firstSessionDate: SATURDAY,
        startMinute: 17 * 60,
      })
      .expect(201);

    expect(response.body.ok).toBe(true);
    expect(response.body.sessions).toHaveLength(4);

    // هیچ رزروی نباید ساخته شده باشد
    const mine = await request(server)
      .get("/api/bookings/me")
      .set("x-user-id", fixture.studentId)
      .expect(200);
    expect(mine.body.bookings).toHaveLength(0);
  });
});

describe("لغو و فهرست رزروها", () => {
  async function bookOne() {
    const response = await request(server)
      .post("/api/bookings/single")
      .set("x-user-id", fixture.studentId)
      .send({
        teacherProfileId: fixture.teacherProfileId,
        offeringId: fixture.offeringId,
        date: SATURDAY,
        startMinute: 17 * 60,
      })
      .expect(201);
    return response.body.id as string;
  }

  it("رزروهای کاربر را برمی‌گرداند", async () => {
    await bookOne();

    const response = await request(server)
      .get("/api/bookings/me")
      .set("x-user-id", fixture.studentId)
      .expect(200);

    expect(response.body.bookings).toHaveLength(1);
  });

  it("استاد هم رزرو را در فهرست خودش می‌بیند", async () => {
    await bookOne();

    const response = await request(server)
      .get("/api/bookings/me")
      .set("x-user-id", fixture.teacherUserId)
      .expect(200);

    expect(response.body.bookings).toHaveLength(1);
  });

  it("کاربر بی‌ربط نمی‌تواند لغو کند", async () => {
    const bookingId = await bookOne();

    const response = await request(server)
      .post(`/api/bookings/${bookingId}/cancel`)
      .set("x-user-id", fixture.otherStudentId)
      .send({})
      .expect(403);

    expect(response.body.code).toBe("NOT_PARTICIPANT");
  });

  it("هنرجو رزرو خودش را لغو می‌کند", async () => {
    const bookingId = await bookOne();

    const response = await request(server)
      .post(`/api/bookings/${bookingId}/cancel`)
      .set("x-user-id", fixture.studentId)
      .send({ reason: "برنامه‌ام عوض شد" })
      .expect(201);

    expect(response.body.status).toBe("CANCELLED_BY_STUDENT");
  });

  it("مسیر /bookings/me با /bookings/:id تداخل ندارد", async () => {
    // `me` باید پیش از الگوی پارامتری تطبیق پیدا کند، وگرنه به عنوان
    // شناسه تفسیر می‌شود و اعتبارسنجی UUID آن را رد می‌کند
    await request(server)
      .get("/api/bookings/me")
      .set("x-user-id", fixture.studentId)
      .expect(200);
  });
});
