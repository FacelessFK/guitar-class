import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import type { App } from "supertest/types.js";

import { AppModule } from "../app.module.js";
import { AuthExceptionFilter } from "../common/auth-exception.filter.js";
import { BookingExceptionFilter } from "../common/booking-exception.filter.js";
import { BigIntSerializationInterceptor } from "../common/serialization.interceptor.js";
import { closeDatabase, resetDatabase, resetRedis } from "../test/fixtures.js";
import { OTP_CONFIG } from "./otp.service.js";

/**
 * جریان کامل ورود، از درخواست کد تا تمدید و خروج.
 *
 * کد ورود در حالت توسعه در پاسخ برمی‌گردد (`devCode`)، پس تست بدون
 * خواندن لاگ یا ماک کردن ردیس کار می‌کند.
 */

const PHONE = "09121234567";

let app: INestApplication;
let server: App;

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

  app = moduleRef.createNestApplication();
  app.setGlobalPrefix("api");
  app.useGlobalFilters(new AuthExceptionFilter(), new BookingExceptionFilter());
  app.useGlobalInterceptors(new BigIntSerializationInterceptor());
  await app.init();

  server = app.getHttpServer() as App;
});

beforeEach(async () => {
  await resetDatabase();
  await resetRedis();
});

afterAll(async () => {
  await app.close();
  await closeDatabase();
});

async function requestCode(phone = PHONE): Promise<string> {
  const response = await request(server)
    .post("/api/auth/otp/request")
    .send({ phone })
    .expect(200);

  return response.body.devCode as string;
}

async function login(phone = PHONE, fullName = "فردین کاظمی") {
  const code = await requestCode(phone);
  const response = await request(server)
    .post("/api/auth/otp/verify")
    .send({ phone, code, fullName })
    .expect(200);

  return response.body as {
    accessToken: string;
    refreshToken: string;
    user: { id: string; phone: string; fullName: string; isNewUser: boolean };
  };
}

describe("درخواست کد ورود", () => {
  it("کد شش‌رقمی می‌سازد", async () => {
    const code = await requestCode();
    expect(code).toMatch(/^\d{6}$/);
  });

  it("شماره‌ی نامعتبر را رد می‌کند", async () => {
    const response = await request(server)
      .post("/api/auth/otp/request")
      .send({ phone: "02112345678" })
      .expect(400);

    expect(response.body.code).toBe("INVALID_PHONE");
  });

  it("شماره با ارقام فارسی را می‌پذیرد", async () => {
    await request(server)
      .post("/api/auth/otp/request")
      .send({ phone: "۰۹۱۲۱۲۳۴۵۶۷" })
      .expect(200);
  });

  it("درخواست دوباره‌ی زودهنگام را ۴۲۹ می‌دهد", async () => {
    await requestCode();

    const response = await request(server)
      .post("/api/auth/otp/request")
      .send({ phone: PHONE })
      .expect(429);

    expect(response.body.code).toBe("COOLDOWN");
    expect(response.body.retryAfterSeconds).toBeGreaterThan(0);
    expect(response.headers["retry-after"]).toBeDefined();
  });

  it("شکل‌های مختلف یک شماره، همان محدودیت را می‌خورند", async () => {
    // اگر نرمال‌سازی درست نباشد، می‌شود با نوشتن متفاوت شماره،
    // محدودسازی نرخ را دور زد
    await requestCode("09121234567");

    await request(server)
      .post("/api/auth/otp/request")
      .send({ phone: "+989121234567" })
      .expect(429);
  });
});

describe("بررسی کد و ورود", () => {
  it("کاربر تازه را می‌سازد و توکن می‌دهد", async () => {
    const result = await login();

    expect(result.accessToken).toBeTruthy();
    expect(result.refreshToken).toBeTruthy();
    expect(result.user.isNewUser).toBe(true);
    // شماره به شکل محلی نمایش داده می‌شود، هرچند متعارف ذخیره شده
    expect(result.user.phone).toBe("09121234567");
  });

  it("برای کاربر تازه بدون نام، خطا می‌دهد", async () => {
    const code = await requestCode();

    const response = await request(server)
      .post("/api/auth/otp/verify")
      .send({ phone: PHONE, code })
      .expect(400);

    expect(response.body.code).toBe("FULL_NAME_REQUIRED");
  });

  it("ورود دوم همان کاربر است، نه کاربر جدید", async () => {
    const first = await login();
    await resetRedis();
    const second = await login();

    expect(second.user.id).toBe(first.user.id);
    expect(second.user.isNewUser).toBe(false);
  });

  it("کد نادرست را رد می‌کند و تلاش باقی‌مانده را می‌گوید", async () => {
    await requestCode();

    const response = await request(server)
      .post("/api/auth/otp/verify")
      .send({ phone: PHONE, code: "000000", fullName: "تست" })
      .expect(401);

    expect(response.body.code).toBe("INVALID_CODE");
    expect(response.body.message).toContain("تلاش");
  });

  it("پس از تلاش‌های زیاد، کد را می‌سوزاند", async () => {
    const code = await requestCode();

    for (let attempt = 0; attempt < OTP_CONFIG.MAX_ATTEMPTS; attempt++) {
      await request(server)
        .post("/api/auth/otp/verify")
        .send({ phone: PHONE, code: "000000", fullName: "تست" });
    }

    // حتی کد درست هم دیگر کار نمی‌کند
    const response = await request(server)
      .post("/api/auth/otp/verify")
      .send({ phone: PHONE, code, fullName: "تست" })
      .expect(429);

    expect(response.body.code).toBe("TOO_MANY_ATTEMPTS");
  });

  it("کد یک‌بارمصرف است", async () => {
    const code = await requestCode();

    await request(server)
      .post("/api/auth/otp/verify")
      .send({ phone: PHONE, code, fullName: "تست" })
      .expect(200);

    const response = await request(server)
      .post("/api/auth/otp/verify")
      .send({ phone: PHONE, code, fullName: "تست" })
      .expect(401);

    expect(response.body.code).toBe("NO_ACTIVE_CODE");
  });

  it("کد با قالب اشتباه را در اعتبارسنجی رد می‌کند", async () => {
    await request(server)
      .post("/api/auth/otp/verify")
      .send({ phone: PHONE, code: "12", fullName: "تست" })
      .expect(400);
  });
});

describe("توکن دسترسی", () => {
  it("به اندپوینت محافظت‌شده اجازه می‌دهد", async () => {
    const session = await login();

    const response = await request(server)
      .get("/api/auth/me")
      .set("authorization", `Bearer ${session.accessToken}`)
      .expect(200);

    expect(response.body.fullName).toBe("فردین کاظمی");
    expect(response.body.trialUsed).toBe(false);
  });

  it("توکن دستکاری‌شده را رد می‌کند", async () => {
    const session = await login();
    const tampered = `${session.accessToken.slice(0, -3)}xyz`;

    const response = await request(server)
      .get("/api/auth/me")
      .set("authorization", `Bearer ${tampered}`)
      .expect(401);

    expect(response.body.code).toBe("INVALID_TOKEN");
  });

  it("طرح غیر از Bearer را نمی‌پذیرد", async () => {
    const session = await login();

    await request(server)
      .get("/api/auth/me")
      .set("authorization", `Basic ${session.accessToken}`)
      .expect(401);
  });

  it("اندپوینت‌های عمومی بدون توکن کار می‌کنند", async () => {
    await request(server).get("/api/instruments").expect(200);
    await request(server).get("/api/health").expect(200);
  });
});

describe("تمدید نشست", () => {
  it("توکن دسترسی تازه می‌دهد", async () => {
    const session = await login();

    const response = await request(server)
      .post("/api/auth/refresh")
      .send({ refreshToken: session.refreshToken })
      .expect(200);

    expect(response.body.accessToken).toBeTruthy();
    expect(response.body.user.id).toBe(session.user.id);
  });

  it("توکن تازه‌سازی می‌چرخد و قدیمی باطل می‌شود", async () => {
    const session = await login();

    const first = await request(server)
      .post("/api/auth/refresh")
      .send({ refreshToken: session.refreshToken })
      .expect(200);

    // توکن جدید باید متفاوت باشد
    expect(first.body.refreshToken).not.toBe(session.refreshToken);

    // استفاده‌ی دوباره از توکن قدیمی باید رد شود — این همان چیزی است
    // که سرقت توکن را زودتر آشکار می‌کند
    const reuse = await request(server)
      .post("/api/auth/refresh")
      .send({ refreshToken: session.refreshToken })
      .expect(401);

    expect(reuse.body.code).toBe("INVALID_REFRESH_TOKEN");

    // ولی توکن جدید کار می‌کند
    await request(server)
      .post("/api/auth/refresh")
      .send({ refreshToken: first.body.refreshToken })
      .expect(200);
  });

  it("توکن ساختگی را رد می‌کند", async () => {
    await request(server)
      .post("/api/auth/refresh")
      .send({ refreshToken: "x".repeat(64) })
      .expect(401);
  });
});

describe("خروج", () => {
  it("توکن تازه‌سازی را باطل می‌کند", async () => {
    const session = await login();

    await request(server)
      .post("/api/auth/logout")
      .send({ refreshToken: session.refreshToken })
      .expect(200);

    await request(server)
      .post("/api/auth/refresh")
      .send({ refreshToken: session.refreshToken })
      .expect(401);
  });

  it("برای توکن نامعتبر هم همان پاسخ را می‌دهد", async () => {
    // وگرنه می‌شود با همین اندپوینت اعتبار توکن‌ها را آزمود
    await request(server)
      .post("/api/auth/logout")
      .send({ refreshToken: "y".repeat(64) })
      .expect(200);
  });

  it("خروج از همه‌ی دستگاه‌ها همه‌ی نشست‌ها را می‌بندد", async () => {
    const first = await login();
    await resetRedis();
    const second = await login();

    await request(server)
      .post("/api/auth/logout-all")
      .set("authorization", `Bearer ${second.accessToken}`)
      .expect(200);

    await request(server)
      .post("/api/auth/refresh")
      .send({ refreshToken: first.refreshToken })
      .expect(401);
    await request(server)
      .post("/api/auth/refresh")
      .send({ refreshToken: second.refreshToken })
      .expect(401);
  });
});

describe("رزرو با هویت واقعی", () => {
  it("کاربر واردشده می‌تواند رزرو کند و رزرو به او نسبت داده می‌شود", async () => {
    const session = await login();

    const mine = await request(server)
      .get("/api/bookings/me")
      .set("authorization", `Bearer ${session.accessToken}`)
      .expect(200);

    expect(mine.body.bookings).toEqual([]);
  });
});
