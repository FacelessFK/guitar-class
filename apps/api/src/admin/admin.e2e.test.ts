import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import type { App } from "supertest/types.js";
import { eq } from "drizzle-orm";

import { AppModule } from "../app.module.js";
import { AuthExceptionFilter } from "../common/auth-exception.filter.js";
import { DomainExceptionFilter } from "../common/domain-exception.filter.js";
import { BigIntSerializationInterceptor } from "../common/serialization.interceptor.js";
import { db } from "../db/client.js";
import { ledgerEntries, users } from "../db/schema/index.js";
import {
  accessTokenFor,
  closeDatabase,
  resetDatabase,
  resetRedis,
  seedFixture,
  type Fixture,
} from "../test/fixtures.js";

/**
 * پنل ادمین.
 *
 * دو چیز اینجا سنجیده می‌شود و بقیه فرعی‌اند:
 *
 *   ۱. **گارد واقعاً بسته است.** `AdminGuard` نوشته شده بود و هیچ‌جا به
 *      کار نمی‌رفت؛ اگر روزی از روی یک اندپوینت بیفتد، این تست‌ها باید
 *      قرمز شوند نه اینکه داده‌ی مالی بی‌صدا باز شود.
 *   ۲. **تسویه دفتر کل را نمی‌شکند.** دفتر فقط افزودنی است و مانده باید
 *      همچنان از جمع ساده‌ی `net_amount` دربیاید.
 */

let app: INestApplication;
let server: App;
let fixture: Fixture;
let adminToken: string;
let studentToken: string;
let teacherToken: string;

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

  const [admin] = await db
    .insert(users)
    .values({ phone: "+989120000009", fullName: "مدیر", isAdmin: true })
    .returning({ id: users.id });

  [adminToken, studentToken, teacherToken] = await Promise.all([
    accessTokenFor(admin!.id, true),
    accessTokenFor(fixture.studentId),
    accessTokenFor(fixture.teacherUserId),
  ]);
});

afterAll(async () => {
  await app.close();
  await closeDatabase();
});

describe("AdminGuard", () => {
  /**
   * `isAdmin` از توکن خوانده می‌شود، نه از بدنه یا هدر. توکن هنرجو آن را
   * ندارد، پس هیچ ترکیبی از پارامترها این مسیرها را باز نمی‌کند.
   */
  it("کاربر عادی به هیچ مسیر ادمین راه ندارد", async () => {
    const paths = [
      "/api/admin/overview",
      "/api/admin/teachers",
      "/api/admin/instruments",
      "/api/admin/bookings",
      "/api/admin/orders",
      "/api/admin/payouts",
    ];

    for (const path of paths) {
      const response = await request(server)
        .get(path)
        .set("authorization", `Bearer ${studentToken}`)
        .expect(403);

      expect(response.body.code).toBe("FORBIDDEN");
    }
  });

  /**
   * ۴۰۳ می‌گیرد نه ۴۰۱: فرانت هر ۴۰۱ را «نشست منقضی شد» می‌خواند و
   * کاربر را بیرون می‌اندازد. باز کردن `/admin` توسط کاربر عادی نباید
   * از حسابش خارجش کند.
   */
  it("استادِ غیرادمین هم راه ندارد و از حساب بیرون نمی‌افتد", async () => {
    const response = await request(server)
      .get("/api/admin/teachers")
      .set("authorization", `Bearer ${teacherToken}`);

    expect(response.status).toBe(403);
    expect(response.status).not.toBe(401);
  });

  it("بدون توکن ۴۰۱ می‌گیرد", async () => {
    await request(server).get("/api/admin/overview").expect(401);
  });
});

describe("تأیید استاد", () => {
  async function applyAsNewTeacher(): Promise<string> {
    const applied = await request(server)
      .post("/api/teacher/apply")
      .set("authorization", `Bearer ${studentToken}`)
      .send({ headline: "مدرس پیانو", slug: "piano-teacher" })
      .expect(201);

    return applied.body.profileId as string;
  }

  it("درخواست تازه در صف ادمین دیده می‌شود", async () => {
    const profileId = await applyAsNewTeacher();

    const pending = await request(server)
      .get("/api/admin/teachers")
      .query({ status: "PENDING" })
      .set("authorization", `Bearer ${adminToken}`)
      .expect(200);

    expect(pending.body.teachers).toHaveLength(1);
    expect(pending.body.teachers[0]).toMatchObject({
      profileId,
      status: "PENDING",
      // هنوز هیچ سرویسی ندارد — همان چیزی که ادمین باید ببیند
      offeringCount: 0,
    });
  });

  /**
   * مسیر کامل: تا وقتی هم تأیید نشده **و هم** سرویس ندارد، در فهرست
   * عمومی نیست. هر دو شرط لازم‌اند و این تست هر دو را جدا نشان می‌دهد.
   */
  it("تأیید و ساخت سرویس، استاد را در فهرست عمومی می‌آورد", async () => {
    const profileId = await applyAsNewTeacher();

    const before = await request(server).get("/api/teachers").expect(200);
    expect(before.body.teachers).toHaveLength(1);

    await request(server)
      .patch(`/api/admin/teachers/${profileId}`)
      .set("authorization", `Bearer ${adminToken}`)
      .send({ status: "APPROVED", commissionRate: "25" })
      .expect(200);

    // تأییدشده ولی بدون سرویس: هنوز نمی‌آید
    const midway = await request(server).get("/api/teachers").expect(200);
    expect(midway.body.teachers).toHaveLength(1);

    const withOffering = await request(server)
      .post(`/api/admin/teachers/${profileId}/offerings`)
      .set("authorization", `Bearer ${adminToken}`)
      .send({
        instrumentId: fixture.instrumentId,
        price: "4500000",
        durationMinutes: 45,
        levels: ["BEGINNER"],
      })
      .expect(201);

    expect(withOffering.body.offerings).toHaveLength(1);
    expect(withOffering.body.offerings[0].price).toBe("4500000");
    expect(withOffering.body.commissionRate).toBe("25.00");

    const after = await request(server).get("/api/teachers").expect(200);
    expect(after.body.teachers).toHaveLength(2);
  });

  it("تعلیق، استاد را از فهرست عمومی برمی‌دارد", async () => {
    await request(server)
      .patch(`/api/admin/teachers/${fixture.teacherProfileId}`)
      .set("authorization", `Bearer ${adminToken}`)
      .send({ status: "SUSPENDED" })
      .expect(200);

    const list = await request(server).get("/api/teachers").expect(200);
    expect(list.body.teachers).toHaveLength(0);
  });

  it("درصد کمیسیون بیرون از بازه رد می‌شود", async () => {
    await request(server)
      .patch(`/api/admin/teachers/${fixture.teacherProfileId}`)
      .set("authorization", `Bearer ${adminToken}`)
      .send({ commissionRate: "120" })
      .expect(400);
  });

  it("استاد ناموجود ۴۰۴ می‌گیرد", async () => {
    const response = await request(server)
      .get("/api/admin/teachers/00000000-0000-4000-8000-000000000000")
      .set("authorization", `Bearer ${adminToken}`)
      .expect(404);

    expect(response.body.code).toBe("ADMIN_RECORD_NOT_FOUND");
  });
});

describe("سازها و سرویس‌ها", () => {
  it("ساز تازه ساخته می‌شود و در کاتالوگ عمومی می‌آید", async () => {
    await request(server)
      .post("/api/admin/instruments")
      .set("authorization", `Bearer ${adminToken}`)
      .send({
        slug: "setar",
        nameFa: "سه‌تار",
        descriptionFa: "کلاس آنلاین سه‌تار از صفر تا ردیف.",
        sortOrder: 9,
      })
      .expect(201);

    const publicList = await request(server).get("/api/instruments").expect(200);
    expect(publicList.body.instruments.map((row: { slug: string }) => row.slug)).toContain(
      "setar",
    );
  });

  it("ساز غیرفعال از کاتالوگ عمومی می‌افتد ولی در فهرست ادمین می‌ماند", async () => {
    const created = await request(server)
      .post("/api/admin/instruments")
      .set("authorization", `Bearer ${adminToken}`)
      .send({ slug: "setar", nameFa: "سه‌تار" })
      .expect(201);

    await request(server)
      .patch(`/api/admin/instruments/${created.body.id}`)
      .set("authorization", `Bearer ${adminToken}`)
      .send({ isActive: false })
      .expect(200);

    const publicList = await request(server).get("/api/instruments").expect(200);
    expect(
      publicList.body.instruments.map((row: { slug: string }) => row.slug),
    ).not.toContain("setar");

    const adminList = await request(server)
      .get("/api/admin/instruments")
      .set("authorization", `Bearer ${adminToken}`)
      .expect(200);
    expect(adminList.body.instruments.map((row: { slug: string }) => row.slug)).toContain(
      "setar",
    );
  });

  it("نشانی ساز تکراری رد می‌شود", async () => {
    const response = await request(server)
      .post("/api/admin/instruments")
      .set("authorization", `Bearer ${adminToken}`)
      .send({ slug: "classical-guitar", nameFa: "گیتار کلاسیک" })
      .expect(409);

    expect(response.body.code).toBe("INSTRUMENT_SLUG_TAKEN");
  });

  it("سرویس تکراری برای همان جفتِ استاد و ساز رد می‌شود", async () => {
    const response = await request(server)
      .post(`/api/admin/teachers/${fixture.teacherProfileId}/offerings`)
      .set("authorization", `Bearer ${adminToken}`)
      .send({ instrumentId: fixture.instrumentId, price: "3000000" })
      .expect(409);

    expect(response.body.code).toBe("OFFERING_EXISTS");
  });

  it("مبلغ صفر یا غیرعددی رد می‌شود", async () => {
    for (const price of ["0", "-1", "۳۰۰۰", "abc"]) {
      await request(server)
        .patch(`/api/admin/offerings/${fixture.offeringId}`)
        .set("authorization", `Bearer ${adminToken}`)
        .send({ price })
        .expect(400);
    }
  });

  /**
   * قیمت تازه روی رزروهای فروخته‌شده اثر ندارد — هر رزرو
   * `price_snapshot` خودش را دارد. این تست همان قاعده را از سمت پنل
   * ادمین می‌بندد.
   */
  it("تغییر قیمت، رزرو موجود را جابه‌جا نمی‌کند", async () => {
    const booked = await request(server)
      .post("/api/bookings/single")
      .set("authorization", `Bearer ${studentToken}`)
      .send({
        teacherProfileId: fixture.teacherProfileId,
        offeringId: fixture.offeringId,
        date: nextSaturday(),
        startMinute: 17 * 60,
      })
      .expect(201);

    expect(booked.body.price).toBe("3000000");

    await request(server)
      .patch(`/api/admin/offerings/${fixture.offeringId}`)
      .set("authorization", `Bearer ${adminToken}`)
      .send({ price: "9000000" })
      .expect(200);

    const listed = await request(server)
      .get("/api/admin/bookings")
      .set("authorization", `Bearer ${adminToken}`)
      .expect(200);

    const row = listed.body.bookings.find(
      (item: { id: string }) => item.id === booked.body.id,
    );
    expect(row.price).toBe("3000000");
  });
});

describe("تسویه", () => {
  /** یک سطر درآمد مستقیم در دفتر کل، تا مانده‌ای برای تسویه وجود داشته باشد. */
  async function seedEarning(net: bigint): Promise<void> {
    await db.insert(ledgerEntries).values({
      type: "EARNING",
      teacherId: fixture.teacherProfileId,
      grossAmount: net + 1_000_000n,
      commission: 1_000_000n,
      netAmount: net,
      description: "درآمد آزمایشی",
    });
  }

  it("مانده از دفتر کل خوانده می‌شود", async () => {
    await seedEarning(8_000_000n);

    const detail = await request(server)
      .get(`/api/admin/teachers/${fixture.teacherProfileId}`)
      .set("authorization", `Bearer ${adminToken}`)
      .expect(200);

    expect(detail.body.balance).toMatchObject({
      gross: "9000000",
      commission: "1000000",
      earned: "8000000",
      paidOut: "0",
      outstanding: "8000000",
    });
  });

  it("تسویه ثبت و پرداخت می‌شود و سطر منفی در دفتر کل می‌نشیند", async () => {
    await seedEarning(8_000_000n);

    const created = await request(server)
      .post("/api/admin/payouts")
      .set("authorization", `Bearer ${adminToken}`)
      .send({
        teacherProfileId: fixture.teacherProfileId,
        periodStart: "2026-07-01",
        periodEnd: "2026-07-31",
        amount: "8000000",
      })
      .expect(201);

    expect(created.body.status).toBe("PENDING");

    // تا وقتی پرداخت نشده، دفتر کل دست‌نخورده است
    const beforePaid = await request(server)
      .get(`/api/admin/teachers/${fixture.teacherProfileId}`)
      .set("authorization", `Bearer ${adminToken}`)
      .expect(200);
    expect(beforePaid.body.balance.paidOut).toBe("0");

    const paid = await request(server)
      .post(`/api/admin/payouts/${created.body.id}/paid`)
      .set("authorization", `Bearer ${adminToken}`)
      .send({ trackingCode: "TRK-1" })
      .expect(200);

    expect(paid.body.status).toBe("PAID");
    expect(paid.body.trackingCode).toBe("TRK-1");

    const afterPaid = await request(server)
      .get(`/api/admin/teachers/${fixture.teacherProfileId}`)
      .set("authorization", `Bearer ${adminToken}`)
      .expect(200);

    // ناخالص دست‌نخورده می‌ماند، مانده صفر می‌شود
    expect(afterPaid.body.balance).toMatchObject({
      gross: "9000000",
      commission: "1000000",
      paidOut: "8000000",
      outstanding: "0",
    });

    // و همان قاعده‌ی سند: جمع ساده‌ی net_amount هنوز بدهی واقعی است
    const rows = await db
      .select()
      .from(ledgerEntries)
      .where(eq(ledgerEntries.teacherId, fixture.teacherProfileId));

    expect(rows).toHaveLength(2);
    const total = rows.reduce((sum, row) => sum + row.netAmount, 0n);
    expect(total).toBe(0n);
  });

  it("تسویه‌ی بیشتر از مانده رد می‌شود و مانده‌ی واقعی را می‌گوید", async () => {
    await seedEarning(8_000_000n);

    const response = await request(server)
      .post("/api/admin/payouts")
      .set("authorization", `Bearer ${adminToken}`)
      .send({
        teacherProfileId: fixture.teacherProfileId,
        periodStart: "2026-07-01",
        periodEnd: "2026-07-31",
        amount: "80000000",
      })
      .expect(409);

    expect(response.body.code).toBe("PAYOUT_EXCEEDS_BALANCE");
    expect(response.body.outstanding).toBe("8000000");
  });

  /**
   * دو تسویه‌ی در انتظار نباید با هم از مانده رد شوند. بدون کسر کردن
   * تسویه‌های در انتظار، ثبتِ دوباره‌ی «کل مانده» دو برابر بدهی را
   * پرداختنی می‌کند و هیچ‌کدام به‌تنهایی خطا نمی‌دهند.
   */
  it("تسویه‌ی در انتظار از مانده‌ی قابل ثبت کسر می‌شود", async () => {
    await seedEarning(8_000_000n);

    await request(server)
      .post("/api/admin/payouts")
      .set("authorization", `Bearer ${adminToken}`)
      .send({
        teacherProfileId: fixture.teacherProfileId,
        periodStart: "2026-07-01",
        periodEnd: "2026-07-31",
        amount: "5000000",
      })
      .expect(201);

    const second = await request(server)
      .post("/api/admin/payouts")
      .set("authorization", `Bearer ${adminToken}`)
      .send({
        teacherProfileId: fixture.teacherProfileId,
        periodStart: "2026-08-01",
        periodEnd: "2026-08-31",
        amount: "5000000",
      })
      .expect(409);

    expect(second.body.outstanding).toBe("3000000");
  });

  it("پرداخت دوباره‌ی همان تسویه، دفتر کل را دو بار نمی‌زند", async () => {
    await seedEarning(8_000_000n);

    const created = await request(server)
      .post("/api/admin/payouts")
      .set("authorization", `Bearer ${adminToken}`)
      .send({
        teacherProfileId: fixture.teacherProfileId,
        periodStart: "2026-07-01",
        periodEnd: "2026-07-31",
        amount: "8000000",
      })
      .expect(201);

    await request(server)
      .post(`/api/admin/payouts/${created.body.id}/paid`)
      .set("authorization", `Bearer ${adminToken}`)
      .send({})
      .expect(200);

    const again = await request(server)
      .post(`/api/admin/payouts/${created.body.id}/paid`)
      .set("authorization", `Bearer ${adminToken}`)
      .send({})
      .expect(409);

    expect(again.body.code).toBe("PAYOUT_NOT_PENDING");

    const rows = await db
      .select()
      .from(ledgerEntries)
      .where(eq(ledgerEntries.teacherId, fixture.teacherProfileId));
    expect(rows.filter((row) => row.type === "PAYOUT")).toHaveLength(1);
  });

  /** صفحه‌ی درآمد استاد هم باید همان تفکیک را ببیند، نه ناخالصِ کم‌شده. */
  it("پنل استاد بعد از تسویه، درآمد ناخالصش را کم‌شده نمی‌بیند", async () => {
    await seedEarning(8_000_000n);

    const created = await request(server)
      .post("/api/admin/payouts")
      .set("authorization", `Bearer ${adminToken}`)
      .send({
        teacherProfileId: fixture.teacherProfileId,
        periodStart: "2026-07-01",
        periodEnd: "2026-07-31",
        amount: "8000000",
      })
      .expect(201);

    await request(server)
      .post(`/api/admin/payouts/${created.body.id}/paid`)
      .set("authorization", `Bearer ${adminToken}`)
      .send({})
      .expect(200);

    const earnings = await request(server)
      .get("/api/payments/earnings")
      .set("authorization", `Bearer ${teacherToken}`)
      .expect(200);

    expect(earnings.body.gross).toBe("9000000");
    expect(earnings.body.paidOut).toBe("8000000");
    expect(earnings.body.outstanding).toBe("0");
  });
});

describe("گزارش‌ها", () => {
  it("نمای کلی، صف تأیید را می‌شمارد", async () => {
    await request(server)
      .post("/api/teacher/apply")
      .set("authorization", `Bearer ${studentToken}`)
      .send({ headline: "مدرس پیانو" })
      .expect(201);

    const response = await request(server)
      .get("/api/admin/overview")
      .set("authorization", `Bearer ${adminToken}`)
      .expect(200);

    expect(response.body).toMatchObject({
      pendingTeachers: 1,
      approvedTeachers: 1,
      activeInstruments: 1,
      pendingPayouts: 0,
    });
  });

  it("فهرست رزروها با فیلتر استاد و وضعیت", async () => {
    await request(server)
      .post("/api/bookings/single")
      .set("authorization", `Bearer ${studentToken}`)
      .send({
        teacherProfileId: fixture.teacherProfileId,
        offeringId: fixture.offeringId,
        date: nextSaturday(),
        startMinute: 17 * 60,
      })
      .expect(201);

    const matching = await request(server)
      .get("/api/admin/bookings")
      .query({ status: "PENDING_PAYMENT", teacherProfileId: fixture.teacherProfileId })
      .set("authorization", `Bearer ${adminToken}`)
      .expect(200);

    expect(matching.body.bookings).toHaveLength(1);
    expect(matching.body.bookings[0]).toMatchObject({
      status: "PENDING_PAYMENT",
      instrumentName: "گیتار کلاسیک",
      teacherName: "استاد رضایی",
      studentName: "هنرجوی الف",
    });

    const other = await request(server)
      .get("/api/admin/bookings")
      .query({ status: "COMPLETED" })
      .set("authorization", `Bearer ${adminToken}`)
      .expect(200);

    expect(other.body.bookings).toHaveLength(0);
  });
});

/**
 * نزدیک‌ترین شنبه‌ی دستِ‌کم سه روز بعد — سید استاد را شنبه‌ها ۱۶ تا ۲۰
 * آزاد می‌گذارد و سه روز فاصله `MIN_LEAD_MINUTES` را رد می‌کند.
 */
function nextSaturday(): string {
  const day = 86_400_000;
  let instant = Date.now() + 3 * day;

  for (let i = 0; i < 8; i += 1) {
    const key = new Date(instant + 3.5 * 3_600_000).toISOString().slice(0, 10);
    // شنبه = ۰ در قرارداد پروژه؛ `getUTCDay` شنبه را ۶ می‌دهد
    if (new Date(`${key}T12:00:00Z`).getUTCDay() === 6) return key;
    instant += day;
  }

  throw new Error("شنبه پیدا نشد");
}
