import { describe, expect, it } from "vitest";

import {
  buildCanonicalRequest,
  encodeS3Key,
  presignUrl,
  signedQueryParameters,
  signingKey,
  toAmzDate,
} from "./sigv4.js";

/**
 * امضای SigV4.
 *
 * این تست‌ها با مقادیر ثابت اجرا می‌شوند چون تنها بازخوردی که سرویس
 * واقعی می‌دهد `SignatureDoesNotMatch` است — پیامی که نمی‌گوید کدام
 * جزء غلط بوده. پس هر جزء اینجا جدا سنجیده می‌شود تا اگر روزی شکست،
 * همان‌جا معلوم شود کجا.
 *
 * کلید امضا با **بردار مرجع خود AWS** سنجیده می‌شود (مستند
 * «Examples of the signature calculation process»)، پس این یکی صرفاً
 * قفلِ رفتار فعلی نیست، درستی الگوریتم را می‌سنجد.
 */

describe("signingKey", () => {
  /**
   * بردار منتشرشده‌ی AWS برای مشتق کردن کلید امضا:
   *   secret  = wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY
   *   date    = 20150830
   *   region  = us-east-1
   *   service = iam
   *
   * سرویسش `iam` است نه `s3` — تنها بردار مرجعی که برای این زنجیره
   * وجود دارد همین است. خودِ زنجیره به سرویس بی‌اعتناست، پس درست بودنش
   * اینجا یعنی درست بودنش برای `s3` هم.
   */
  it("با بردار مرجع AWS می‌خواند", () => {
    const key = signingKey(
      "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY",
      "20150830",
      "us-east-1",
      "iam",
    );

    expect(key.toString("hex")).toBe(
      "c4afb1cc5771d871763a393e44b703571b55cc28424d1a5e86da6ed3c154a4b9",
    );
  });

  it("سرویس پیش‌فرض s3 است", () => {
    expect(signingKey("secret", "20260812", "ir-thr-at1")).toEqual(
      signingKey("secret", "20260812", "ir-thr-at1", "s3"),
    );
  });

  /**
   * هر مرحله خروجی قبلی را به‌عنوان **کلید** می‌گیرد نه پیام. جابه‌جا
   * شدنشان امضایی می‌سازد که سالم به نظر می‌رسد و همیشه رد می‌شود، پس
   * حساسیت به ترتیب صریح سنجیده می‌شود.
   */
  it("به ترتیب منطقه و تاریخ حساس است", () => {
    const base = signingKey("secret", "20260812", "ir-thr-at1");

    expect(signingKey("secret", "20260813", "ir-thr-at1")).not.toEqual(base);
    expect(signingKey("secret", "20260812", "ir-thr-at2")).not.toEqual(base);
  });
});

describe("encodeS3Key", () => {
  it("اسلش مسیر را کد نمی‌کند", () => {
    expect(encodeS3Key("submissions/2026/clip.mp3")).toBe(
      "submissions/2026/clip.mp3",
    );
  });

  /**
   * `encodeURIComponent` این پنج نویسه را رها می‌کند ولی S3 انتظار دارد
   * کد شده باشند. بدون این اصلاح، فایلی که پرانتز در نامش دارد امضایش
   * نمی‌خواند — و علتش از پیام خطا اصلاً پیدا نیست.
   */
  it("نویسه‌هایی را که encodeURIComponent رها می‌کند کد می‌کند", () => {
    expect(encodeS3Key("a!b'c(d)e*f")).toBe("a%21b%27c%28d%29e%2Af");
  });

  it("فاصله و حروف فارسی را کد می‌کند", () => {
    expect(encodeS3Key("تمرین اول.mp3")).toBe(
      "%D8%AA%D9%85%D8%B1%DB%8C%D9%86%20%D8%A7%D9%88%D9%84.mp3",
    );
  });
});

describe("toAmzDate", () => {
  it("قالب فشرده‌ی ISO می‌سازد", () => {
    expect(toAmzDate(new Date("2026-08-12T13:45:00.123Z"))).toBe("20260812T134500Z");
  });
});

describe("buildCanonicalRequest", () => {
  /**
   * ساختار درخواست متعارف دقیقاً همین است و یک خط خالی اضافه یا کم،
   * امضا را باطل می‌کند. شکل کامل قفل می‌شود چون هیچ راه دیگری برای
   * دیدن اشتباهش وجود ندارد.
   */
  it("شکل دقیقش قفل است", () => {
    const canonical = buildCanonicalRequest({
      method: "PUT",
      key: "submissions/clip.mp3",
      canonicalQuery: "X-Amz-Algorithm=AWS4-HMAC-SHA256",
      host: "bucket.example.com",
    });

    expect(canonical).toBe(
      [
        "PUT",
        "/submissions/clip.mp3",
        "X-Amz-Algorithm=AWS4-HMAC-SHA256",
        "host:bucket.example.com",
        "",
        "host",
        "UNSIGNED-PAYLOAD",
      ].join("\n"),
    );
  });
});

describe("signedQueryParameters", () => {
  const input = {
    method: "PUT" as const,
    host: "music.s3.ir-thr-at1.arvanstorage.ir",
    key: "submissions/abc.mp3",
    region: "ir-thr-at1",
    accessKeyId: "AKIAIOSFODNN7EXAMPLE",
    secretAccessKey: "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY",
    expiresInSeconds: 900,
    now: new Date("2026-08-12T13:45:00Z"),
  };

  it("همه‌ی پارامترهای لازم را می‌گذارد", () => {
    const query = signedQueryParameters(input);

    expect(query.get("X-Amz-Algorithm")).toBe("AWS4-HMAC-SHA256");
    expect(query.get("X-Amz-Credential")).toBe(
      "AKIAIOSFODNN7EXAMPLE/20260812/ir-thr-at1/s3/aws4_request",
    );
    expect(query.get("X-Amz-Date")).toBe("20260812T134500Z");
    expect(query.get("X-Amz-Expires")).toBe("900");
    expect(query.get("X-Amz-SignedHeaders")).toBe("host");
    expect(query.get("X-Amz-Signature")).toMatch(/^[0-9a-f]{64}$/);
  });

  /** امضا نباید به چیزی جز ورودی‌ها بستگی داشته باشد. */
  it("با ورودی یکسان همیشه یک امضا می‌دهد", () => {
    expect(signedQueryParameters(input).get("X-Amz-Signature")).toBe(
      signedQueryParameters(input).get("X-Amz-Signature"),
    );
  });

  it("عوض شدن هر ورودی امضا را عوض می‌کند", () => {
    const base = signedQueryParameters(input).get("X-Amz-Signature");

    expect(signedQueryParameters({ ...input, key: "other.mp3" }).get("X-Amz-Signature")).not.toBe(base);
    expect(signedQueryParameters({ ...input, method: "GET" }).get("X-Amz-Signature")).not.toBe(base);
    expect(signedQueryParameters({ ...input, host: "other.example.com" }).get("X-Amz-Signature")).not.toBe(base);
    expect(signedQueryParameters({ ...input, expiresInSeconds: 60 }).get("X-Amz-Signature")).not.toBe(base);
    expect(
      signedQueryParameters({ ...input, now: new Date("2026-08-12T13:45:01Z") }).get(
        "X-Amz-Signature",
      ),
    ).not.toBe(base);
  });
});

describe("presignUrl", () => {
  it("آدرس کامل و قابل استفاده می‌سازد", () => {
    const url = new URL(
      presignUrl({
        method: "PUT",
        host: "music.s3.ir-thr-at1.arvanstorage.ir",
        key: "submissions/2026/clip.mp3",
        region: "ir-thr-at1",
        accessKeyId: "KEY",
        secretAccessKey: "SECRET",
        expiresInSeconds: 900,
        now: new Date("2026-08-12T13:45:00Z"),
      }),
    );

    expect(url.protocol).toBe("https:");
    expect(url.host).toBe("music.s3.ir-thr-at1.arvanstorage.ir");
    expect(url.pathname).toBe("/submissions/2026/clip.mp3");
    expect(url.searchParams.get("X-Amz-Signature")).toMatch(/^[0-9a-f]{64}$/);
  });
});
