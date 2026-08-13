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
import { InMemoryObjectStorage, setObjectStorage } from "../media/storage.port.js";
import { db } from "../db/client.js";
import { users } from "../db/schema/index.js";
import { closeDatabase, resetDatabase, resetRedis } from "../test/fixtures.js";
import { PASSWORD_LOGIN_LIMIT } from "./password-attempts.js";
import { REFRESH_COOKIE } from "./refresh-cookie.js";

/**
 * ثبت‌نام و ورود با رمز عبور.
 *
 * راه دوم است، نه جایگزینِ کد پیامکی — و بخش زیادی از این تست‌ها همان
 * چیزی را می‌سنجند که مسیر کد پیامکی از قبل رعایتش می‌کرد: پاسخ نباید
 * بگوید کدام شماره در پلتفرم حساب دارد.
 */

const PHONE = "09121234567";
const PASSWORD = "correct horse battery";

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

const register = (body: Record<string, unknown>) =>
  request(server).post("/api/auth/register").send(body);

const login = (body: Record<string, unknown>) =>
  request(server).post("/api/auth/login").send(body);

const cookieHeader = (response: request.Response): string[] => {
  const raw = response.headers["set-cookie"];
  return Array.isArray(raw) ? raw : raw ? [raw] : [];
};

describe("POST /api/auth/register", () => {
  it("حساب می‌سازد و همان شکلِ پاسخِ ورود با کد را می‌دهد", async () => {
    const response = await register({
      phone: PHONE,
      fullName: "سارا محمدی",
      password: PASSWORD,
    }).expect(201);

    expect(response.body.accessToken).toBeTruthy();
    expect(response.body.user).toMatchObject({
      phone: PHONE,
      fullName: "سارا محمدی",
      isAdmin: false,
      isNewUser: true,
    });
  });

  /**
   * توکن تازه‌سازی باید در کوکی `httpOnly` برود و **در بدنه نیاید** —
   * همان خاصیتی که ورود با کد پیامکی دارد. اگر این مسیر آن را در بدنه
   * برمی‌گرداند، یک XSS دوباره به نشستِ سی‌روزه می‌رسید.
   */
  it("توکن تازه‌سازی را فقط در کوکی httpOnly می‌گذارد", async () => {
    const response = await register({
      phone: PHONE,
      fullName: "سارا محمدی",
      password: PASSWORD,
    }).expect(201);

    expect(JSON.stringify(response.body)).not.toContain("refreshToken");

    const cookie = cookieHeader(response).find((value) => value.startsWith(REFRESH_COOKIE));
    expect(cookie).toBeDefined();
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Path=/api/auth");
  });

  it("رمز را خام ذخیره نمی‌کند", async () => {
    await register({ phone: PHONE, fullName: "سارا محمدی", password: PASSWORD }).expect(201);

    const [row] = await db
      .select({ hash: users.passwordHash })
      .from(users)
      .where(eq(users.phone, "+989121234567"))
      .limit(1);

    expect(row?.hash).toBeTruthy();
    expect(row?.hash).not.toContain(PASSWORD);
    expect(row?.hash?.startsWith("scrypt$")).toBe(true);
  });

  it("رمز کوتاه را رد می‌کند", async () => {
    await register({ phone: PHONE, fullName: "سارا محمدی", password: "kotah" }).expect(400);
  });

  it("شماره‌ی نامعتبر را رد می‌کند", async () => {
    await register({ phone: "12345", fullName: "سارا محمدی", password: PASSWORD }).expect(400);
  });

  /**
   * ⚠️ مهم‌ترین تستِ این فایل.
   *
   * ثبت‌نام دوباره روی شماره‌ی موجود **نباید** رمز را جایگزین کند،
   * وگرنه هر کسی با دانستن شماره‌ی یک نفر می‌تواند از فرم ثبت‌نام
   * حسابش را بگیرد.
   */
  it("روی شماره‌ی موجود، رمز را جایگزین نمی‌کند", async () => {
    await register({ phone: PHONE, fullName: "سارا محمدی", password: PASSWORD }).expect(201);

    await register({
      phone: PHONE,
      fullName: "مهاجم",
      password: "attacker-password",
    }).expect(409);

    // رمز اول هنوز کار می‌کند و رمز مهاجم نه
    await login({ phone: PHONE, password: "attacker-password" }).expect(401);
    const response = await login({ phone: PHONE, password: PASSWORD }).expect(200);
    expect(response.body.user.fullName).toBe("سارا محمدی");
  });
});

describe("POST /api/auth/login", () => {
  const createAccount = () =>
    register({ phone: PHONE, fullName: "سارا محمدی", password: PASSWORD }).expect(201);

  it("با رمز درست وارد می‌شود", async () => {
    await createAccount();

    const response = await login({ phone: PHONE, password: PASSWORD }).expect(200);

    expect(response.body.accessToken).toBeTruthy();
    expect(response.body.user.isNewUser).toBe(false);
  });

  it("توکن دسترسی واقعاً روی مسیرهای محافظت‌شده کار می‌کند", async () => {
    await createAccount();
    const { body } = await login({ phone: PHONE, password: PASSWORD }).expect(200);

    await request(server)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${body.accessToken}`)
      .expect(200);
  });

  it("با رمز غلط رد می‌کند", async () => {
    await createAccount();
    await login({ phone: PHONE, password: "wrong-password" }).expect(401);
  });

  /**
   * حساب ناموجود و رمز غلط باید **یک پیام و یک کد** بگیرند. تفاوتشان
   * یعنی می‌شود با پیمایش شماره‌ها فهرست کاربران را ساخت.
   */
  it("حساب ناموجود و رمز غلط را از هم تفکیک نمی‌کند", async () => {
    await createAccount();

    const wrongPassword = await login({ phone: PHONE, password: "wrong-password" }).expect(401);
    const noAccount = await login({ phone: "09129999999", password: PASSWORD }).expect(401);

    expect(noAccount.body.code).toBe(wrongPassword.body.code);
    expect(noAccount.body.message).toBe(wrongPassword.body.message);
  });

  /**
   * حسابی که از راه کد پیامکی ساخته شده رمز ندارد. ورود با رمز برایش
   * باید رد شود — و با همان پیام، نه با پیامی که وجود حساب را لو بدهد.
   */
  it("حسابِ بدون رمز را با هیچ رمزی وارد نمی‌کند", async () => {
    await db.insert(users).values({ phone: "+989121234567", fullName: "بدون رمز" });

    const response = await login({ phone: PHONE, password: PASSWORD }).expect(401);
    expect(response.body.code).toBe("INVALID_CREDENTIALS");

    const empty = await login({ phone: PHONE, password: "" }).expect(400);
    expect(empty.body.code).not.toBe("INVALID_CREDENTIALS");
  });

  it("حساب مسدود را وارد نمی‌کند", async () => {
    await createAccount();
    await db.update(users).set({ status: "SUSPENDED" }).where(eq(users.phone, "+989121234567"));

    const response = await login({ phone: PHONE, password: PASSWORD }).expect(403);
    expect(response.body.code).toBe("ACCOUNT_SUSPENDED");
  });

  /**
   * رمز عبور مثل کد پیامکی خودبه‌خود منقضی نمی‌شود، پس تنها چیزی که
   * جلوی حدس زدنِ خودکار را می‌گیرد همین شمارنده است.
   */
  it("بعد از تلاش‌های ناموفق پیاپی قفل می‌کند", async () => {
    await createAccount();

    for (let attempt = 0; attempt < PASSWORD_LOGIN_LIMIT.MAX_ATTEMPTS - 1; attempt += 1) {
      await login({ phone: PHONE, password: "wrong-password" }).expect(401);
    }

    // تلاش آخر سقف را پر می‌کند
    await login({ phone: PHONE, password: "wrong-password" }).expect(401);

    // از این به بعد حتی رمز درست هم رد می‌شود، با کد و هدر متفاوت
    const locked = await login({ phone: PHONE, password: PASSWORD }).expect(429);
    expect(locked.body.code).toBe("TOO_MANY_ATTEMPTS");
    expect(locked.headers["retry-after"]).toBeDefined();
  });

  it("ورود موفق، شمارنده‌ی تلاش را صفر می‌کند", async () => {
    await createAccount();

    for (let attempt = 0; attempt < PASSWORD_LOGIN_LIMIT.MAX_ATTEMPTS - 1; attempt += 1) {
      await login({ phone: PHONE, password: "wrong-password" }).expect(401);
    }

    await login({ phone: PHONE, password: PASSWORD }).expect(200);

    // شمارنده پاک شده، پس دوباره کل سقف در اختیار است
    for (let attempt = 0; attempt < PASSWORD_LOGIN_LIMIT.MAX_ATTEMPTS - 1; attempt += 1) {
      await login({ phone: PHONE, password: "wrong-password" }).expect(401);
    }

    await login({ phone: PHONE, password: PASSWORD }).expect(200);
  });
});

describe("دو مسیر ورود کنار هم", () => {
  /**
   * حسابی که با رمز ساخته شده باید با کد پیامکی هم بتواند وارد شود.
   *
   * این همان چیزی است که قفلِ ورودِ با رمز را بی‌خطر می‌کند: کسی که
   * عمداً حساب دیگری را قفل می‌کند، صاحبش را بیرون نمی‌گذارد.
   */
  it("حسابِ ساخته‌شده با رمز، با کد پیامکی هم وارد می‌شود", async () => {
    await register({ phone: PHONE, fullName: "سارا محمدی", password: PASSWORD }).expect(201);

    const requested = await request(server)
      .post("/api/auth/otp/request")
      .send({ phone: PHONE })
      .expect(200);

    const response = await request(server)
      .post("/api/auth/otp/verify")
      .send({ phone: PHONE, code: requested.body.devCode })
      .expect(200);

    expect(response.body.user.fullName).toBe("سارا محمدی");
    expect(response.body.user.isNewUser).toBe(false);
  });
});
