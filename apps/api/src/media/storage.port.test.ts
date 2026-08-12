import { afterEach, describe, expect, it } from "vitest";

import {
  InMemoryObjectStorage,
  S3ObjectStorage,
  bucketHost,
  buildObjectKey,
  endpointHost,
  s3ConfigFromEnv,
  type S3Config,
} from "./storage.port.js";

/**
 * انتخاب شکل میزبان.
 *
 * این تست‌ها بعد از راستی‌آزمایی در برابر یک سرویس واقعی S3 نوشته شدند،
 * که نشان داد انتخاب اشتباهِ شکل میزبان به `SignatureDoesNotMatch` یا
 * `NoSuchBucket` تبدیل می‌شود — دو پیامی که آدم را دنبال کلید و نام
 * باکت می‌فرستند، در حالی که هر دو سالم‌اند.
 */

const baseConfig: S3Config = {
  host: "music.s3.ir-thr-at1.arvanstorage.ir",
  bucket: "music",
  pathStyle: false,
  region: "ir-thr-at1",
  accessKeyId: "KEY",
  secretAccessKey: "SECRET",
  publicBaseUrl: "https://music.s3.ir-thr-at1.arvanstorage.ir",
};

const pathStyleConfig: S3Config = {
  ...baseConfig,
  host: "s3.ir-thr-at1.arvanstorage.ir",
  pathStyle: true,
  publicBaseUrl: "https://s3.ir-thr-at1.arvanstorage.ir/music",
};

const ticketFor = (config: S3Config) =>
  new S3ObjectStorage(config).createUploadTicket({
    objectKey: "submissions/2026-08/clip.mp3",
    contentType: "audio/mpeg",
    expiresInSeconds: 900,
  });

describe("S3ObjectStorage — سبک زیردامنه‌ای", () => {
  it("باکت در میزبان است و مسیر فقط کلید", () => {
    const url = new URL(ticketFor(baseConfig).uploadUrl);

    expect(url.host).toBe("music.s3.ir-thr-at1.arvanstorage.ir");
    expect(url.pathname).toBe("/submissions/2026-08/clip.mp3");
  });
});

describe("S3ObjectStorage — سبک مسیری", () => {
  it("باکت در مسیر است و میزبان بدون آن", () => {
    const url = new URL(ticketFor(pathStyleConfig).uploadUrl);

    expect(url.host).toBe("s3.ir-thr-at1.arvanstorage.ir");
    expect(url.pathname).toBe("/music/submissions/2026-08/clip.mp3");
  });

  it("نشانی عمومی هم باکت را در مسیر دارد", () => {
    expect(
      new S3ObjectStorage(pathStyleConfig).publicUrlFor("submissions/clip.mp3"),
    ).toBe("https://s3.ir-thr-at1.arvanstorage.ir/music/submissions/clip.mp3");
  });
});

/**
 * مهم‌ترین قید این بخش.
 *
 * نام باکت فقط باید در **آدرس** ظاهر شود، نه در `objectKey`. کلید در
 * ردیس، در ستون دیتابیس و در جاروی پاک‌سازی می‌نشیند؛ اگر نام باکت
 * داخلش برود، عوض کردن سبک میزبان (یا خودِ باکت) هر کلیدِ ذخیره‌شده را
 * غلط می‌کند و فایل‌های موجود دیگر پیدا نمی‌شوند.
 */
describe("کلید آبجکت از سبک میزبان مستقل است", () => {
  it("هیچ سبکی نام باکت را وارد objectKey نمی‌کند", () => {
    for (const config of [baseConfig, pathStyleConfig]) {
      expect(ticketFor(config).objectKey).toBe("submissions/2026-08/clip.mp3");
    }
  });

  it("دو سبک، یک کلید و دو آدرس می‌دهند", () => {
    expect(ticketFor(baseConfig).objectKey).toBe(ticketFor(pathStyleConfig).objectKey);
    expect(ticketFor(baseConfig).uploadUrl).not.toBe(
      ticketFor(pathStyleConfig).uploadUrl,
    );
  });
});

describe("bucketHost و endpointHost", () => {
  it("پروتکل و اسلش پایانی را دور می‌ریزند", () => {
    expect(endpointHost("https://s3.example.ir/")).toBe("s3.example.ir");
  });

  it("اگر باکت از قبل در میزبان باشد دوباره اضافه نمی‌شود", () => {
    expect(bucketHost("music.s3.example.ir", "music")).toBe("music.s3.example.ir");
    expect(bucketHost("s3.example.ir", "music")).toBe("music.s3.example.ir");
  });
});

describe("s3ConfigFromEnv", () => {
  const KEYS = [
    "S3_ENDPOINT",
    "S3_BUCKET",
    "S3_ACCESS_KEY",
    "S3_SECRET_KEY",
    "S3_REGION",
    "S3_PATH_STYLE",
    "S3_PUBLIC_BASE_URL",
  ] as const;

  const original = new Map(KEYS.map((key) => [key, process.env[key]]));

  afterEach(() => {
    for (const [key, value] of original) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  const setEnv = (values: Partial<Record<(typeof KEYS)[number], string>>): void => {
    for (const key of KEYS) delete process.env[key];
    Object.assign(process.env, values);
  };

  /** ناقص بودن باید `null` بدهد تا `createObjectStorage` تصمیم بگیرد. */
  it("با تنظیمات ناقص null می‌دهد", () => {
    setEnv({ S3_ENDPOINT: "s3.example.ir", S3_BUCKET: "music" });
    expect(s3ConfigFromEnv()).toBeNull();
  });

  it("پیش‌فرض، سبک زیردامنه‌ای است", () => {
    setEnv({
      S3_ENDPOINT: "s3.example.ir",
      S3_BUCKET: "music",
      S3_ACCESS_KEY: "k",
      S3_SECRET_KEY: "s",
    });

    expect(s3ConfigFromEnv()).toMatchObject({
      host: "music.s3.example.ir",
      pathStyle: false,
      publicBaseUrl: "https://music.s3.example.ir",
    });
  });

  it("S3_PATH_STYLE میزبان و نشانی عمومی را با هم عوض می‌کند", () => {
    setEnv({
      S3_ENDPOINT: "s3.example.ir",
      S3_BUCKET: "music",
      S3_ACCESS_KEY: "k",
      S3_SECRET_KEY: "s",
      S3_PATH_STYLE: "true",
    });

    expect(s3ConfigFromEnv()).toMatchObject({
      host: "s3.example.ir",
      pathStyle: true,
      publicBaseUrl: "https://s3.example.ir/music",
    });
  });

  /**
   * فقط رشته‌ی `"true"`. هر مقدار دیگری — از جمله `"1"` و `"yes"` —
   * زیردامنه‌ای می‌ماند، چون حالتِ مبهم بدتر از حالتِ غلط است: تنها
   * نشانه‌اش خطای امضاست.
   */
  it("مقدار مبهم را روشن حساب نمی‌کند", () => {
    setEnv({
      S3_ENDPOINT: "s3.example.ir",
      S3_BUCKET: "music",
      S3_ACCESS_KEY: "k",
      S3_SECRET_KEY: "s",
      S3_PATH_STYLE: "1",
    });

    expect(s3ConfigFromEnv()?.pathStyle).toBe(false);
  });
});

describe("buildObjectKey", () => {
  it("پیشوند، ماه و پسوند را نگه می‌دارد", () => {
    const key = buildObjectKey("submissions", "تمرین اول.MP3");
    const month = new Date().toISOString().slice(0, 7);

    expect(key).toMatch(new RegExp(`^submissions/${month}/[0-9a-f-]{36}\\.mp3$`));
  });

  /** کلیدِ قابل حدس یعنی اجرای یک هنرجو با آزمودن نام‌ها پیدا شود. */
  it("دو بار صدا زدن دو کلید متفاوت می‌دهد", () => {
    expect(buildObjectKey("submissions", "a.mp3")).not.toBe(
      buildObjectKey("submissions", "a.mp3"),
    );
  });

  it("فایل بدون پسوند را قبول می‌کند", () => {
    expect(buildObjectKey("feedback", "voice")).toMatch(/\/[0-9a-f-]{36}$/);
  });
});

describe("InMemoryObjectStorage", () => {
  it("حذف، فایل را برمی‌دارد و بار دوم خطا نمی‌دهد", async () => {
    const storage = new InMemoryObjectStorage("http://localhost:4000/api");
    storage.put("k", Buffer.from("x"), "text/plain");

    await storage.deleteObject("k");
    expect(storage.get("k")).toBeNull();

    // ایدمپوتنت: جاروی پاک‌سازی ممکن است دو بار به یک کلید برسد
    await expect(storage.deleteObject("k")).resolves.toBeUndefined();
  });
});
