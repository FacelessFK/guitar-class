import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import type { App } from "supertest/types.js";
import { eq } from "drizzle-orm";
import { addDaysToDateKey, tehranDateKey, weekdayOfDateKey } from "@music/shared";

import { AppModule } from "../app.module.js";
import { db } from "../db/client.js";
import { teacherProfiles } from "../db/schema/index.js";
import { AuthExceptionFilter } from "../common/auth-exception.filter.js";
import { DomainExceptionFilter } from "../common/domain-exception.filter.js";
import { BigIntSerializationInterceptor } from "../common/serialization.interceptor.js";
import {
  accessTokenFor,
  closeDatabase,
  resetDatabase,
  resetRedis,
  seedFixture,
  type Fixture,
} from "../test/fixtures.js";

/**
 * پنل استاد — نوشتن برنامه‌ی دسترس‌پذیری.
 *
 * مهم‌ترین چیزی که این فایل می‌سنجد، مالکیت است: هیچ مسیری
 * `teacherProfileId` نمی‌گیرد و هیچ کاربری نباید بتواند برنامه‌ی استاد
 * دیگری را ببیند یا عوض کند. بقیه‌ی تست‌ها بررسی می‌کنند که نوشتن در
 * این جدول‌ها واقعاً روی اسلات‌های محاسبه‌شده اثر می‌گذارد — وگرنه پنل
 * ظاهراً کار می‌کند ولی هیچ ساعتی جابه‌جا نمی‌شود.
 */

/**
 * نزدیک‌ترین شنبه‌ی دستِ‌کم سه روز بعد.
 *
 * تاریخ ثابت نوشته نمی‌شود چون با گذشت زمان به گذشته می‌افتد و تست
 * به دلیلی بی‌ربط به کد قرمز می‌شود. سه روز فاصله، `MIN_LEAD_MINUTES`
 * را با حاشیه رد می‌کند.
 */
function nextSaturday(): string {
  let date = addDaysToDateKey(tehranDateKey(new Date()), 3);
  while (weekdayOfDateKey(date) !== 0) {
    date = addDaysToDateKey(date, 1);
  }
  return date;
}

let app: INestApplication;
let server: App;
let fixture: Fixture;
let teacherToken: string;
let studentToken: string;
let saturday: string;

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
  saturday = nextSaturday();

  [teacherToken, studentToken] = await Promise.all([
    accessTokenFor(fixture.teacherUserId),
    accessTokenFor(fixture.studentId),
  ]);
});

afterAll(async () => {
  await app.close();
  await closeDatabase();
});

describe("GET /api/teacher/me", () => {
  it("پروفایل و سرویس‌های استاد را می‌دهد", async () => {
    const response = await request(server)
      .get("/api/teacher/me")
      .set("authorization", `Bearer ${teacherToken}`)
      .expect(200);

    expect(response.body.profileId).toBe(fixture.teacherProfileId);
    expect(response.body.status).toBe("APPROVED");
    expect(response.body.offerings).toHaveLength(1);
    expect(response.body.offerings[0]).toMatchObject({
      id: fixture.offeringId,
      instrumentName: "گیتار کلاسیک",
      durationMinutes: 60,
    });
  });

  it("هنرجو به پنل استاد راه ندارد", async () => {
    const response = await request(server)
      .get("/api/teacher/me")
      .set("authorization", `Bearer ${studentToken}`)
      .expect(403);

    expect(response.body.code).toBe("NOT_A_TEACHER");
  });
});

describe("GET /api/auth/me", () => {
  /**
   * فرانت در همان اولین درخواستِ راه‌اندازی نشست باید بداند پنل استاد
   * را نشان بدهد یا نه. بدون این فیلد، پوسته‌ی اپ یک بار بدون آن مسیر
   * رندر می‌شود و بعد می‌پرد.
   */
  it("شناسه‌ی پروفایل استاد را برای استاد می‌دهد", async () => {
    const response = await request(server)
      .get("/api/auth/me")
      .set("authorization", `Bearer ${teacherToken}`)
      .expect(200);

    expect(response.body.teacherProfileId).toBe(fixture.teacherProfileId);
  });

  it("برای هنرجو تهی است", async () => {
    const response = await request(server)
      .get("/api/auth/me")
      .set("authorization", `Bearer ${studentToken}`)
      .expect(200);

    expect(response.body.teacherProfileId).toBeNull();
  });
});

describe("POST /api/teacher/apply", () => {
  it("هنرجو درخواست می‌دهد و پروفایل در انتظار تأیید ساخته می‌شود", async () => {
    const response = await request(server)
      .post("/api/teacher/apply")
      .set("authorization", `Bearer ${studentToken}`)
      .send({ headline: "مدرس پیانو", bio: "ده سال تدریس", yearsExperience: 10 })
      .expect(201);

    expect(response.body.status).toBe("PENDING");
    expect(response.body.yearsExperience).toBe(10);
    // بدون نشانی دلخواه، سرور یکی می‌سازد
    expect(response.body.slug).toMatch(/^teacher-[0-9a-f]{8}$/);
    expect(response.body.offerings).toEqual([]);
  });

  /**
   * مهم‌ترین بررسی این بخش: متقاضی نباید بتواند خودش را تأیید کند یا
   * سهم پلتفرم را تعیین کند. هر دو فیلد در بدنه می‌آیند و باید بی‌اثر
   * بمانند — نه اینکه خطا بدهند، فقط دور ریخته شوند.
   */
  it("وضعیت و درصد کمیسیونِ فرستاده‌شده از سمت کاربر نادیده گرفته می‌شود", async () => {
    await request(server)
      .post("/api/teacher/apply")
      .set("authorization", `Bearer ${studentToken}`)
      .send({ headline: "مدرس پیانو", status: "APPROVED", commissionRate: "0" })
      .expect(201);

    const profile = await request(server)
      .get("/api/teacher/me")
      .set("authorization", `Bearer ${studentToken}`)
      .expect(200);

    expect(profile.body.status).toBe("PENDING");

    // و چون تأیید نشده، در فهرست عمومی هم نمی‌آید
    const publicList = await request(server).get("/api/teachers").expect(200);
    expect(publicList.body.teachers).toHaveLength(1);
  });

  it("درخواست دوم رد می‌شود", async () => {
    await request(server)
      .post("/api/teacher/apply")
      .set("authorization", `Bearer ${studentToken}`)
      .send({ headline: "مدرس پیانو" })
      .expect(201);

    const again = await request(server)
      .post("/api/teacher/apply")
      .set("authorization", `Bearer ${studentToken}`)
      .send({ headline: "مدرس ویولن" })
      .expect(409);

    expect(again.body.code).toBe("ALREADY_A_TEACHER");
  });

  it("نشانی تکراری رد می‌شود", async () => {
    const response = await request(server)
      .post("/api/teacher/apply")
      .set("authorization", `Bearer ${studentToken}`)
      .send({ headline: "مدرس پیانو", slug: "rezaei" })
      .expect(409);

    expect(response.body.code).toBe("TEACHER_SLUG_TAKEN");
  });
});

describe("PATCH /api/teacher/me", () => {
  it("استاد ویدیوی معارفه و متن پروفایلش را می‌گذارد", async () => {
    const response = await request(server)
      .patch("/api/teacher/me")
      .set("authorization", `Bearer ${teacherToken}`)
      .send({
        headline: "مدرس گیتار کلاسیک، ۱۲ سال سابقه",
        bio: "فارغ‌التحصیل هنرستان موسیقی",
        yearsExperience: 12,
        introVideoUrl: "https://cdn.example.com/intro.mp4",
      })
      .expect(200);

    expect(response.body.introVideoUrl).toBe("https://cdn.example.com/intro.mp4");
    expect(response.body.yearsExperience).toBe(12);

    // و روی صفحه‌ی عمومی هم دیده می‌شود — همان جایی که به نرخ تبدیل ربط دارد
    const publicProfile = await request(server).get("/api/teachers/rezaei").expect(200);
    expect(publicProfile.body.introVideoUrl).toBe("https://cdn.example.com/intro.mp4");
  });

  /**
   * نشانی `javascript:` در `intro_video_url` روی صفحه‌ای می‌نشیند که
   * ترافیک سئو رویش می‌آید. بررسی در ورودی است نه در رندر، چون رندرها
   * چند تا هستند و ورودی یکی.
   */
  it("نشانی غیر http رد می‌شود", async () => {
    await request(server)
      .patch("/api/teacher/me")
      .set("authorization", `Bearer ${teacherToken}`)
      .send({ introVideoUrl: "javascript:alert(1)" })
      .expect(400);
  });

  it("استاد نمی‌تواند وضعیت خودش را عوض کند", async () => {
    await request(server)
      .patch("/api/teacher/me")
      .set("authorization", `Bearer ${teacherToken}`)
      .send({ status: "APPROVED", commissionRate: "0", headline: "عنوان تازه" })
      .expect(200);

    const [row] = await db
      .select({
        status: teacherProfiles.status,
        commissionRate: teacherProfiles.commissionRate,
        headline: teacherProfiles.headline,
      })
      .from(teacherProfiles)
      .where(eq(teacherProfiles.id, fixture.teacherProfileId));

    expect(row?.headline).toBe("عنوان تازه");
    expect(row?.status).toBe("APPROVED");
    expect(row?.commissionRate).toBe("20.00");
  });

  it("هنرجو راه ندارد", async () => {
    const response = await request(server)
      .patch("/api/teacher/me")
      .set("authorization", `Bearer ${studentToken}`)
      .send({ headline: "عنوان" })
      .expect(403);

    expect(response.body.code).toBe("NOT_A_TEACHER");
  });
});

describe("قوانین هفتگی", () => {
  it("قانون تازه ساخته می‌شود و در برنامه می‌آید", async () => {
    const created = await request(server)
      .post("/api/teacher/availability/rules")
      .set("authorization", `Bearer ${teacherToken}`)
      .send({
        weekday: 2, // دوشنبه
        startMinute: 10 * 60,
        endMinute: 12 * 60,
        validFrom: "2026-01-01",
      })
      .expect(201);

    expect(created.body.weekday).toBe(2);
    expect(created.body.validUntil).toBeNull();

    const schedule = await request(server)
      .get("/api/teacher/availability")
      .set("authorization", `Bearer ${teacherToken}`)
      .expect(200);

    // یکی از سید (شنبه ۱۶–۲۰) و یکی همین
    expect(schedule.body.rules).toHaveLength(2);
  });

  it("قانون تازه واقعاً اسلات می‌سازد", async () => {
    // پنجشنبه‌ای که سید هیچ قانونی برایش ندارد
    const thursday = addDaysToDateKey(saturday, 5);

    const before = await request(server)
      .get(`/api/offerings/${fixture.offeringId}/availability`)
      .query({ teacherProfileId: fixture.teacherProfileId, from: thursday, to: thursday })
      .expect(200);
    expect(before.body.slots).toHaveLength(0);

    await request(server)
      .post("/api/teacher/availability/rules")
      .set("authorization", `Bearer ${teacherToken}`)
      .send({
        weekday: 5, // پنج‌شنبه
        startMinute: 9 * 60,
        endMinute: 11 * 60,
        validFrom: "2026-01-01",
      })
      .expect(201);

    const after = await request(server)
      .get(`/api/offerings/${fixture.offeringId}/availability`)
      .query({ teacherProfileId: fixture.teacherProfileId, from: thursday, to: thursday })
      .expect(200);

    expect(after.body.slots).toHaveLength(2);
    expect(after.body.slots[0].startTime).toBe("09:00");
  });

  /**
   * موتور پنجره‌های هم‌پوشان را ادغام می‌کند، پس این حالت چیزی را خراب
   * نمی‌کند — ولی استاد دو سطر می‌بیند که با هم یک بازه‌ی سومی می‌سازند
   * که هیچ‌کدام نشانش نمی‌دهند.
   */
  it("بازه‌ی هم‌پوشان روی همان روز رد می‌شود", async () => {
    const response = await request(server)
      .post("/api/teacher/availability/rules")
      .set("authorization", `Bearer ${teacherToken}`)
      .send({
        weekday: 0,
        startMinute: 18 * 60,
        endMinute: 22 * 60,
        validFrom: "2026-01-01",
      })
      .expect(409);

    expect(response.body.code).toBe("OVERLAPPING_RULE");
  });

  it("بازه‌ی چسبیده هم‌پوشانی نیست", async () => {
    // سید شنبه ۱۶ تا ۲۰ دارد؛ ۲۰ تا ۲۲ دقیقاً به آن می‌چسبد
    await request(server)
      .post("/api/teacher/availability/rules")
      .set("authorization", `Bearer ${teacherToken}`)
      .send({
        weekday: 0,
        startMinute: 20 * 60,
        endMinute: 22 * 60,
        validFrom: "2026-01-01",
      })
      .expect(201);
  });

  it("بازه‌ی اعتبارِ جدا هم‌پوشانی نیست", async () => {
    await request(server)
      .post("/api/teacher/availability/rules")
      .set("authorization", `Bearer ${teacherToken}`)
      .send({
        weekday: 0,
        startMinute: 16 * 60,
        endMinute: 20 * 60,
        validFrom: "2020-01-01",
        validUntil: "2020-12-31",
      })
      .expect(201);
  });

  it("ساعت پایان پیش از شروع رد می‌شود", async () => {
    await request(server)
      .post("/api/teacher/availability/rules")
      .set("authorization", `Bearer ${teacherToken}`)
      .send({
        weekday: 3,
        startMinute: 20 * 60,
        endMinute: 16 * 60,
        validFrom: "2026-01-01",
      })
      .expect(400);
  });

  it("هنرجو نمی‌تواند برنامه بنویسد", async () => {
    const response = await request(server)
      .post("/api/teacher/availability/rules")
      .set("authorization", `Bearer ${studentToken}`)
      .send({
        weekday: 2,
        startMinute: 10 * 60,
        endMinute: 12 * 60,
        validFrom: "2026-01-01",
      })
      .expect(403);

    expect(response.body.code).toBe("NOT_A_TEACHER");
  });

  it("قانونی که مال استاد نیست حذف نمی‌شود", async () => {
    const schedule = await request(server)
      .get("/api/teacher/availability")
      .set("authorization", `Bearer ${teacherToken}`)
      .expect(200);

    const ruleId = schedule.body.rules[0].id as string;

    // استاد دوم، با پروفایل خودش
    const second = await seedSecondTeacher();

    const response = await request(server)
      .delete(`/api/teacher/availability/rules/${ruleId}`)
      .set("authorization", `Bearer ${second.token}`)
      .expect(404);

    expect(response.body.code).toBe("AVAILABILITY_ENTRY_NOT_FOUND");
  });

  /**
   * حذف قانون، جلسات فروخته‌شده را لغو نمی‌کند. اگر پنل این را نگوید،
   * استاد فرض می‌کند برنامه‌اش پاک شده و سر کلاس نمی‌آید.
   */
  it("تعداد جلسات آینده‌ی متأثر را گزارش می‌کند", async () => {
    await request(server)
      .post("/api/bookings/single")
      .set("authorization", `Bearer ${studentToken}`)
      .send({
        teacherProfileId: fixture.teacherProfileId,
        offeringId: fixture.offeringId,
        date: saturday,
        startMinute: 17 * 60,
      })
      .expect(201);

    const schedule = await request(server)
      .get("/api/teacher/availability")
      .set("authorization", `Bearer ${teacherToken}`)
      .expect(200);

    const response = await request(server)
      .delete(`/api/teacher/availability/rules/${schedule.body.rules[0].id}`)
      .set("authorization", `Bearer ${teacherToken}`)
      .expect(200);

    expect(response.body.affectedBookings).toBe(1);
  });
});

describe("استثناها", () => {
  it("بستنِ کل روز، اسلات‌های همان روز را حذف می‌کند", async () => {
    const before = await request(server)
      .get(`/api/offerings/${fixture.offeringId}/availability`)
      .query({ teacherProfileId: fixture.teacherProfileId, from: saturday, to: saturday })
      .expect(200);
    expect(before.body.slots.length).toBeGreaterThan(0);

    await request(server)
      .post("/api/teacher/availability/exceptions")
      .set("authorization", `Bearer ${teacherToken}`)
      .send({ date: saturday, type: "BLOCK", reason: "سفر" })
      .expect(201);

    const after = await request(server)
      .get(`/api/offerings/${fixture.offeringId}/availability`)
      .query({ teacherProfileId: fixture.teacherProfileId, from: saturday, to: saturday })
      .expect(200);

    expect(after.body.slots).toHaveLength(0);
  });

  it("«استثنائاً هستم» بدون ساعت رد می‌شود", async () => {
    await request(server)
      .post("/api/teacher/availability/exceptions")
      .set("authorization", `Bearer ${teacherToken}`)
      .send({ date: saturday, type: "EXTRA" })
      .expect(400);
  });

  it("«استثنائاً هستم» اسلات می‌سازد", async () => {
    // یک‌شنبه‌ی بعدِ همان شنبه؛ سید برایش قانونی ندارد
    const sunday = addDaysToDateKey(saturday, 1);

    await request(server)
      .post("/api/teacher/availability/exceptions")
      .set("authorization", `Bearer ${teacherToken}`)
      .send({
        date: sunday,
        type: "EXTRA",
        startMinute: 9 * 60,
        endMinute: 11 * 60,
      })
      .expect(201);

    const response = await request(server)
      .get(`/api/offerings/${fixture.offeringId}/availability`)
      .query({ teacherProfileId: fixture.teacherProfileId, from: sunday, to: sunday })
      .expect(200);

    expect(response.body.slots).toHaveLength(2);
  });

  it("استثنا حذف می‌شود و اسلات‌ها برمی‌گردند", async () => {
    const created = await request(server)
      .post("/api/teacher/availability/exceptions")
      .set("authorization", `Bearer ${teacherToken}`)
      .send({ date: saturday, type: "BLOCK" })
      .expect(201);

    await request(server)
      .delete(`/api/teacher/availability/exceptions/${created.body.id}`)
      .set("authorization", `Bearer ${teacherToken}`)
      .expect(200);

    const response = await request(server)
      .get(`/api/offerings/${fixture.offeringId}/availability`)
      .query({ teacherProfileId: fixture.teacherProfileId, from: saturday, to: saturday })
      .expect(200);

    expect(response.body.slots.length).toBeGreaterThan(0);
  });

  /** استثنای گذشته دیگر تصمیمی را عوض نمی‌کند و فقط فهرست را شلوغ می‌کند. */
  it("استثناهای گذشته در فهرست نمی‌آیند", async () => {
    await request(server)
      .post("/api/teacher/availability/exceptions")
      .set("authorization", `Bearer ${teacherToken}`)
      .send({ date: "2020-03-21", type: "BLOCK" })
      .expect(201);

    const schedule = await request(server)
      .get("/api/teacher/availability")
      .set("authorization", `Bearer ${teacherToken}`)
      .expect(200);

    expect(schedule.body.exceptions).toHaveLength(0);
  });
});

describe("GET /api/bookings/me", () => {
  /**
   * یک اندپوینت به هر دو نقش پاسخ می‌دهد، پس باید خودش بگوید کاربر در
   * این رزرو کدام طرف است. بدون آن، فرانت باید شناسه‌ی کاربر را با
   * `studentId` مقایسه کند — همان تصمیم، این بار سمت کلاینت.
   */
  it("نقش و نام طرف مقابل را می‌دهد", async () => {
    await request(server)
      .post("/api/bookings/single")
      .set("authorization", `Bearer ${studentToken}`)
      .send({
        teacherProfileId: fixture.teacherProfileId,
        offeringId: fixture.offeringId,
        date: saturday,
        startMinute: 17 * 60,
      })
      .expect(201);

    const asStudent = await request(server)
      .get("/api/bookings/me")
      .set("authorization", `Bearer ${studentToken}`)
      .expect(200);

    expect(asStudent.body.bookings[0]).toMatchObject({
      role: "STUDENT",
      counterpartName: "استاد رضایی",
      instrumentName: "گیتار کلاسیک",
      teacherSlug: "rezaei",
      durationMinutes: 60,
      startTime: "17:00",
      endTime: "18:00",
    });

    const asTeacher = await request(server)
      .get("/api/bookings/me")
      .set("authorization", `Bearer ${teacherToken}`)
      .expect(200);

    expect(asTeacher.body.bookings[0]).toMatchObject({
      role: "TEACHER",
      counterpartName: "هنرجوی الف",
    });
  });
});

/**
 * استاد دوم با پروفایل مستقل — برای سنجش مرز مالکیت.
 * سید فقط یک استاد می‌سازد و بررسی «مال من نیست» به دومی نیاز دارد.
 */
async function seedSecondTeacher(): Promise<{ token: string }> {
  const { db } = await import("../db/client.js");
  const { teacherProfiles, users } = await import("../db/schema/index.js");

  const [user] = await db
    .insert(users)
    .values({ phone: "+989120000009", fullName: "استاد دوم" })
    .returning({ id: users.id });

  await db.insert(teacherProfiles).values({
    userId: user!.id,
    slug: "second-teacher",
    headline: "مدرس سنتور",
    status: "APPROVED",
  });

  return { token: await accessTokenFor(user!.id) };
}
