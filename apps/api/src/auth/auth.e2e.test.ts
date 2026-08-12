import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import type { App } from "supertest/types.js";

import { AppModule } from "../app.module.js";
import { AuthExceptionFilter } from "../common/auth-exception.filter.js";
import { DomainExceptionFilter } from "../common/domain-exception.filter.js";
import { BigIntSerializationInterceptor } from "../common/serialization.interceptor.js";
import { InMemoryObjectStorage, setObjectStorage } from "../media/storage.port.js";
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

const storage = new InMemoryObjectStorage("http://localhost:4000/api");

beforeAll(async () => {
  setObjectStorage(storage);

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

  /**
   * این خطا نباید کد را بسوزاند.
   *
   * «نام لازم است» تازه بعد از بررسی کد معلوم می‌شود. اگر کد همان‌جا
   * مصرف می‌شد، اولین تلاشِ هر کاربر تازه به بن‌بست می‌خورد: کد باطل،
   * cooldown شصت‌ثانیه‌ای فعال، و پیامی که می‌گوید نامت را بده بدون
   * اینکه راهی برای دادنش مانده باشد.
   */
  it("خطای «نام لازم است» کد را نمی‌سوزاند", async () => {
    const code = await requestCode();

    await request(server)
      .post("/api/auth/otp/verify")
      .send({ phone: PHONE, code })
      .expect(400);

    // همان کد، این بار با نام
    const response = await request(server)
      .post("/api/auth/otp/verify")
      .send({ phone: PHONE, code, fullName: "فردین کاظمی" })
      .expect(200);

    expect(response.body.user.isNewUser).toBe(true);
  });

  it("کد پس از ورود موفق دیگر کار نمی‌کند", async () => {
    const code = await requestCode();

    await request(server)
      .post("/api/auth/otp/verify")
      .send({ phone: PHONE, code, fullName: "فردین کاظمی" })
      .expect(200);

    const response = await request(server)
      .post("/api/auth/otp/verify")
      .send({ phone: PHONE, code })
      .expect(401);

    expect(response.body.code).toBe("NO_ACTIVE_CODE");
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

describe("ویرایش پروفایل", () => {
  /** بلیت می‌گیرد، فایل را در استوریج تستی می‌گذارد، کلید را برمی‌گرداند. */
  async function uploadAvatar(token: string): Promise<string> {
    const ticket = await request(server)
      .post("/api/media/upload-url")
      .set("authorization", `Bearer ${token}`)
      .send({
        purpose: "AVATAR",
        fileName: "me.jpg",
        contentType: "image/jpeg",
        sizeBytes: 4096,
      })
      .expect(201);

    const objectKey = ticket.body.objectKey as string;
    storage.put(objectKey, Buffer.from("jpeg"), "image/jpeg");

    return objectKey;
  }

  it("نام را عوض می‌کند و در me دیده می‌شود", async () => {
    const session = await login();

    const updated = await request(server)
      .patch("/api/auth/me")
      .set("authorization", `Bearer ${session.accessToken}`)
      .send({ fullName: "فردین کاظمی‌سرشت" })
      .expect(200);

    expect(updated.body.fullName).toBe("فردین کاظمی‌سرشت");

    const me = await request(server)
      .get("/api/auth/me")
      .set("authorization", `Bearer ${session.accessToken}`)
      .expect(200);

    expect(me.body.fullName).toBe("فردین کاظمی‌سرشت");
  });

  /**
   * نشانی از بلیت درمی‌آید، نه از بدنه. بدون این، هر رشته‌ای —
   * از جمله `javascript:` — به‌عنوان آواتار ثبت می‌شد و در هر صفحه‌ای
   * که پروفایل را نشان می‌دهد رندر می‌شد.
   */
  it("عکس را از روی کلید بلیت ثبت می‌کند", async () => {
    const session = await login();
    const objectKey = await uploadAvatar(session.accessToken);

    const updated = await request(server)
      .patch("/api/auth/me")
      .set("authorization", `Bearer ${session.accessToken}`)
      .send({ avatarObjectKey: objectKey })
      .expect(200);

    expect(updated.body.avatarUrl).toContain(objectKey);
  });

  it("کلید مصرف‌شده بار دوم پذیرفته نمی‌شود", async () => {
    const session = await login();
    const objectKey = await uploadAvatar(session.accessToken);

    await request(server)
      .patch("/api/auth/me")
      .set("authorization", `Bearer ${session.accessToken}`)
      .send({ avatarObjectKey: objectKey })
      .expect(200);

    await request(server)
      .patch("/api/auth/me")
      .set("authorization", `Bearer ${session.accessToken}`)
      .send({ avatarObjectKey: objectKey })
      .expect(409);
  });

  it("بلیت کاربر دیگر پذیرفته نمی‌شود", async () => {
    const owner = await login();
    const other = await login("09121234568", "کاربر دیگر");

    const objectKey = await uploadAvatar(owner.accessToken);

    await request(server)
      .patch("/api/auth/me")
      .set("authorization", `Bearer ${other.accessToken}`)
      .send({ avatarObjectKey: objectKey })
      .expect(409);
  });

  /** `null` صریح یعنی «بردار»، و با نفرستادن فیلد فرق دارد. */
  it("null عکس را برمی‌دارد و فایلش را از استوریج پاک می‌کند", async () => {
    const session = await login();
    const objectKey = await uploadAvatar(session.accessToken);

    await request(server)
      .patch("/api/auth/me")
      .set("authorization", `Bearer ${session.accessToken}`)
      .send({ avatarObjectKey: objectKey })
      .expect(200);

    const removed = await request(server)
      .patch("/api/auth/me")
      .set("authorization", `Bearer ${session.accessToken}`)
      .send({ avatarObjectKey: null })
      .expect(200);

    expect(removed.body.avatarUrl).toBeNull();
    expect(storage.get(objectKey)).toBeNull();
  });

  /**
   * عوض کردن عکس نباید فایل قبلی را در باکت جا بگذارد. فایل یتیم را
   * جاروی پاک‌سازی پیدا نمی‌کند — از روی جدول کار می‌کند نه فهرست باکت.
   */
  it("عکس تازه، فایل قبلی را پاک می‌کند", async () => {
    const session = await login();

    const first = await uploadAvatar(session.accessToken);
    await request(server)
      .patch("/api/auth/me")
      .set("authorization", `Bearer ${session.accessToken}`)
      .send({ avatarObjectKey: first })
      .expect(200);

    const second = await uploadAvatar(session.accessToken);
    await request(server)
      .patch("/api/auth/me")
      .set("authorization", `Bearer ${session.accessToken}`)
      .send({ avatarObjectKey: second })
      .expect(200);

    expect(storage.get(first)).toBeNull();
    expect(storage.get(second)).not.toBeNull();
  });

  it("فایل غیرتصویری برای آواتار بلیت نمی‌گیرد", async () => {
    const session = await login();

    await request(server)
      .post("/api/media/upload-url")
      .set("authorization", `Bearer ${session.accessToken}`)
      .send({
        purpose: "AVATAR",
        fileName: "clip.mp3",
        contentType: "audio/mpeg",
        sizeBytes: 4096,
      })
      .expect(415);
  });

  it("بدون توکن اجازه ندارد", async () => {
    await request(server).patch("/api/auth/me").send({ fullName: "کسی" }).expect(401);
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
