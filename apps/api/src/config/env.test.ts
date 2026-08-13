import { describe, expect, it } from "vitest";

import {
  DEV_JWT_SECRET,
  DEV_LOGIN_CODE_FLAG,
  appEnv,
  assertEnvironment,
  assertNotProduction,
  checkEnvironment,
  devLoginCodeEnabled,
  type EnvRecord,
} from "./env.js";

/**
 * محیطی که همه‌ی قاعده‌ها را پاس می‌کند.
 *
 * هر تست فقط **یک** چیز را از این خراب می‌کند، تا وقتی قرمز شد معلوم
 * باشد کدام قاعده گرفتش. بدون این پایه، هر تست باید پانزده متغیر را
 * دوباره بنویسد و اضافه شدن متغیر بعدی یعنی ویرایش همه‌شان.
 */
function productionEnv(overrides: EnvRecord = {}): EnvRecord {
  return {
    NODE_ENV: "production",
    DATABASE_URL: "postgresql://music:pw@db.internal:5432/music",
    REDIS_URL: "redis://cache.internal:6379",
    JWT_SECRET: "S/gK3nYw2QcVb8xL5pR7tZ1mJ4hD6fA0eN9uI2oP3sQ=",
    SMS_API_KEY: "kavenegar-key",
    PAYMENT_MERCHANT_ID: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    PAYMENT_CALLBACK_URL: "https://api.example.com/api/payments/callback",
    WEB_ORIGIN: "https://example.com",
    S3_ENDPOINT: "s3.ir-thr-at1.arvanstorage.ir",
    S3_BUCKET: "music",
    S3_ACCESS_KEY: "access",
    S3_SECRET_KEY: "secret",
    JITSI_DOMAIN: "class.example.com",
    JITSI_APP_ID: "music-platform",
    JITSI_AUDIENCE: "jitsi",
    JITSI_XMPP_DOMAIN: "meet.jitsi",
    JITSI_APP_SECRET: "jitsi-secret",
    JITSI_WEBHOOK_SECRET: "hook-secret",
    ...overrides,
  };
}

function developmentEnv(overrides: EnvRecord = {}): EnvRecord {
  return {
    NODE_ENV: "development",
    DATABASE_URL: "postgresql://music:music_dev_password@localhost:5433/music",
    REDIS_URL: "redis://localhost:6380",
    JWT_SECRET: DEV_JWT_SECRET,
    ...overrides,
  };
}

/** نام متغیرهای مشکل‌دار — مقایسه‌ی راحت‌تر از متن پیام. */
function offenders(env: EnvRecord): string[] {
  return checkEnvironment(env).map((issue) => issue.variable);
}

describe("appEnv", () => {
  it("هر چیزی جز production و test را توسعه می‌داند", () => {
    expect(appEnv({ NODE_ENV: "production" })).toBe("production");
    expect(appEnv({ NODE_ENV: "test" })).toBe("test");
    expect(appEnv({ NODE_ENV: "staging" })).toBe("development");
    expect(appEnv({})).toBe("development");
  });
});

describe("checkEnvironment در تولید", () => {
  it("محیط کامل هیچ مشکلی ندارد", () => {
    expect(checkEnvironment(productionEnv())).toEqual([]);
  });

  it("همه‌ی متغیرهای نبوده را با هم گزارش می‌کند، نه فقط اولی را", () => {
    const issues = checkEnvironment({ NODE_ENV: "production" });

    // نکته‌ی اصلی این قاعده همین است: یک بار گفتن به‌جای پانزده بار
    // «متغیر را بگذار، دوباره دیپلوی کن»
    expect(issues.length).toBeGreaterThan(10);
    expect(issues.map((issue) => issue.variable)).toContain("DATABASE_URL");
    expect(issues.map((issue) => issue.variable)).toContain("JITSI_APP_SECRET");
  });

  it("پیام هر مشکل نام متغیر و دلیلش را دارد", () => {
    const [issue] = checkEnvironment(productionEnv({ SMS_API_KEY: undefined }));

    expect(issue?.variable).toBe("SMS_API_KEY");
    expect(issue?.problem).toContain("تعریف نشده");
    // «چه چیزی خراب می‌شود» — نه فقط «لازم است»
    expect(issue?.problem).toContain("لاگ");
  });

  it("مقدار خالی یا فقط فاصله را مثل نبودن می‌گیرد", () => {
    expect(offenders(productionEnv({ S3_BUCKET: "" }))).toEqual(["S3_BUCKET"]);
    expect(offenders(productionEnv({ S3_BUCKET: "   " }))).toEqual(["S3_BUCKET"]);
  });
});

describe("JWT_SECRET", () => {
  it("مقدار پیش‌فرض .env.example در تولید رد می‌شود", () => {
    // این همان حالتی است که بررسی طول از آن رد می‌شود
    expect(DEV_JWT_SECRET.length).toBeGreaterThanOrEqual(32);

    const [issue] = checkEnvironment(productionEnv({ JWT_SECRET: DEV_JWT_SECRET }));

    expect(issue?.variable).toBe("JWT_SECRET");
    expect(issue?.problem).toContain("پیش‌فرض");
  });

  it("همان مقدار پیش‌فرض در توسعه مشکلی ندارد", () => {
    expect(checkEnvironment(developmentEnv())).toEqual([]);
  });

  it("کوتاه‌تر از ۳۲ کاراکتر در هر محیطی رد می‌شود", () => {
    expect(offenders(productionEnv({ JWT_SECRET: "short" }))).toEqual(["JWT_SECRET"]);
    expect(offenders(developmentEnv({ JWT_SECRET: "short" }))).toEqual(["JWT_SECRET"]);
  });
});

describe("آدرس‌هایی که از بیرون باید در دسترس باشند", () => {
  it("کال‌بک پرداخت روی localhost رد می‌شود", () => {
    const [issue] = checkEnvironment(
      productionEnv({ PAYMENT_CALLBACK_URL: "https://localhost:4000/api/payments/callback" }),
    );

    expect(issue?.variable).toBe("PAYMENT_CALLBACK_URL");
    expect(issue?.problem).toContain("localhost");
  });

  it("http بدون tls رد می‌شود", () => {
    expect(offenders(productionEnv({ WEB_ORIGIN: "http://example.com" }))).toEqual([
      "WEB_ORIGIN",
    ]);
  });

  it("آدرس بدون پروتکل رد می‌شود", () => {
    expect(offenders(productionEnv({ WEB_ORIGIN: "example.com" }))).toEqual(["WEB_ORIGIN"]);
  });
});

describe("آدرس‌های اتصال", () => {
  it("پروتکل اشتباه در آدرس دیتابیس گرفته می‌شود", () => {
    // یک آدرس ردیس که اشتباهاً در DATABASE_URL نشسته — بدون این بررسی،
    // خطایش چند لایه پایین‌تر و بی‌ربط به نظر می‌رسد
    expect(offenders(productionEnv({ DATABASE_URL: "redis://cache:6379" }))).toEqual([
      "DATABASE_URL",
    ]);
  });

  it("rediss (با tls) پذیرفته می‌شود", () => {
    expect(checkEnvironment(productionEnv({ REDIS_URL: "rediss://cache:6380" }))).toEqual([]);
  });
});

describe(DEV_LOGIN_CODE_FLAG, () => {
  it("در تولید، روشن بودنش جلوی بالا آمدن را می‌گیرد", () => {
    const [issue] = checkEnvironment(productionEnv({ [DEV_LOGIN_CODE_FLAG]: "true" }));

    expect(issue?.variable).toBe(DEV_LOGIN_CODE_FLAG);
  });

  it("در تولید، خاموش بودنش مشکلی نیست", () => {
    expect(checkEnvironment(productionEnv({ [DEV_LOGIN_CODE_FLAG]: "false" }))).toEqual([]);
  });

  it("پیش‌فرضش خاموش است — حتی در توسعه", () => {
    // قلب تصمیم: NODE_ENVِ فراموش‌شده دیگر کد ورود را باز نمی‌کند،
    // چون باز کردنش یک کار عمدی جدا می‌خواهد
    expect(devLoginCodeEnabled(developmentEnv())).toBe(false);
  });

  it("فقط رشته‌ی دقیق true روشنش می‌کند", () => {
    expect(devLoginCodeEnabled(developmentEnv({ [DEV_LOGIN_CODE_FLAG]: "true" }))).toBe(true);
    expect(devLoginCodeEnabled(developmentEnv({ [DEV_LOGIN_CODE_FLAG]: "1" }))).toBe(false);
    expect(devLoginCodeEnabled(developmentEnv({ [DEV_LOGIN_CODE_FLAG]: "yes" }))).toBe(false);
    expect(devLoginCodeEnabled(developmentEnv({ [DEV_LOGIN_CODE_FLAG]: "TRUE" }))).toBe(false);
  });

  it("در تولید حتی با پرچم روشن هم خاموش می‌ماند", () => {
    // کمربند دوم: اگر به هر دلیلی assertEnvironment صدا زده نشده باشد،
    // خودِ مسیر کد هم در تولید کد را برنمی‌گرداند
    expect(devLoginCodeEnabled(productionEnv({ [DEV_LOGIN_CODE_FLAG]: "true" }))).toBe(false);
  });
});

describe("assertEnvironment", () => {
  it("محیط سالم پرتاب نمی‌کند", () => {
    expect(() => assertEnvironment(productionEnv())).not.toThrow();
  });

  it("پیام خطا نام هر متغیر مشکل‌دار را دارد", () => {
    let message = "";

    try {
      assertEnvironment(productionEnv({ SMS_API_KEY: undefined, S3_BUCKET: undefined }));
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }

    expect(message).toContain("SMS_API_KEY");
    expect(message).toContain("S3_BUCKET");
    // رقم لاتین عمدی است: این پیام در لاگ سرور خوانده می‌شود، نه در
    // لایه‌ی نمایش — تنها جایی که رقم فارسی می‌شود
    expect(message).toContain("2 مورد");
  });
});

describe("assertNotProduction", () => {
  it("در تولید پرتاب می‌کند و راه درست را می‌گوید", () => {
    expect(() => assertNotProduction("db:seed", { NODE_ENV: "production" })).toThrow(
      /db:seed:catalog/,
    );
  });

  it("در توسعه و تست ساکت است", () => {
    expect(() => assertNotProduction("db:seed", { NODE_ENV: "development" })).not.toThrow();
    expect(() => assertNotProduction("db:seed", { NODE_ENV: "test" })).not.toThrow();
  });
});
