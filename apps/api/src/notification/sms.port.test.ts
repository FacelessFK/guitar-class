import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { KavenegarSmsSender } from "./sms.port.js";

/**
 * آداپتور کاوه‌نگار در برابر شکل واقعی پاسخ‌ها.
 *
 * `fetch` ماک می‌شود چون بدون حساب واقعی راه دیگری نیست — ولی چیزی که
 * ماک برمی‌گرداند **عیناً** شکل مستندشده‌ی کاوه‌نگار است، از جمله
 * حالت‌هایی که به‌سختی دیده می‌شوند: خطای دامنه‌ای که با کد HTTP غیر
 * ۲۰۰ می‌آید، و پاسخی که اصلاً JSON نیست.
 *
 * چیزی که این تست‌ها **نمی‌توانند** بگویند: اینکه نام الگو در پنل درست
 * است یا خط خدماتی تأیید شده. آن‌ها فقط با اولین ارسال واقعی معلوم
 * می‌شوند و در `docs/deployment.md` نوشته‌اند.
 */

const PHONE = "+989121234567";

let fetchMock: ReturnType<typeof vi.fn>;

/** پاسخ موفق کاوه‌نگار — همان شکلی که مستندات می‌دهد. */
function accepted(): Response {
  return new Response(
    JSON.stringify({
      return: { status: 200, message: "تایید شد" },
      entries: [{ messageid: 1234, status: 5, statustext: "ارسال به مخابرات" }],
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

/**
 * خطای دامنه‌ای.
 *
 * کد HTTP عمداً غیر ۲۰۰ است: کاوه‌نگار خطاها را همین‌طور برمی‌گرداند و
 * آداپتوری که اول به `response.ok` نگاه کند، بدنه‌ی حاوی علت را دور
 * می‌ریزد.
 */
function rejected(status: number, message: string): Response {
  return new Response(JSON.stringify({ return: { status, message }, entries: null }), {
    status: status === 418 ? 418 : 400,
    headers: { "content-type": "application/json" },
  });
}

function sender(): KavenegarSmsSender {
  return new KavenegarSmsSender("test-api-key", "verify");
}

/** بدنه‌ی فرمی که آداپتور فرستاده. */
function sentBody(): URLSearchParams {
  const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
  return new URLSearchParams(init.body as string);
}

function sentUrl(): string {
  const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
  return url;
}

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("کد ورود", () => {
  it("از verify/lookup می‌رود، نه از پیام آزاد", async () => {
    fetchMock.mockResolvedValue(accepted());

    await sender().sendOtp(PHONE, "123456");

    // قلب تصمیم: متن آزاد برای OTP در ایران عملاً تحویل نمی‌شود
    expect(sentUrl()).toContain("/verify/lookup.json");
    expect(sentBody().get("template")).toBe("verify");
    expect(sentBody().get("token")).toBe("123456");
  });

  it("گیرنده را به شکل محلی می‌فرستد، نه E.164", async () => {
    fetchMock.mockResolvedValue(accepted());

    await sender().sendOtp(PHONE, "123456");

    // با +98 خطای «گیرنده نامعتبر» می‌گیریم که شبیه مشکل شماره‌ی
    // کاربر به نظر می‌رسد نه مشکل قالب‌بندی ما
    expect(sentBody().get("receptor")).toBe("09121234567");
  });

  it("کد ورود در URL نمی‌آید", async () => {
    fetchMock.mockResolvedValue(accepted());

    await sender().sendOtp(PHONE, "123456");

    // وگرنه کد در لاگ دسترسی هر پراکسی می‌نشیند
    expect(sentUrl()).not.toContain("123456");
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe("POST");
  });
});

describe("پیام آزاد", () => {
  it("از sms/send می‌رود", async () => {
    fetchMock.mockResolvedValue(accepted());

    await sender().sendText(PHONE, "یادآوری کلاس گیتار کلاسیک، فردا شنبه ساعت ۱۷:۰۰.");

    expect(sentUrl()).toContain("/sms/send.json");
    expect(sentBody().get("message")).toContain("یادآوری کلاس گیتار کلاسیک");
  });

  it("بدون خط فرستنده، پارامتر sender اصلاً فرستاده نمی‌شود", async () => {
    fetchMock.mockResolvedValue(accepted());

    await sender().sendText(PHONE, "متن");

    // `sender=` خالی خطای «خط نامعتبر» می‌دهد؛ نبودنش یعنی خط پیش‌فرض حساب
    expect(sentBody().has("sender")).toBe(false);
  });

  it("خط فرستنده اگر تنظیم شده باشد می‌رود", async () => {
    fetchMock.mockResolvedValue(accepted());

    await new KavenegarSmsSender("k", "verify", "10004346").sendText(PHONE, "متن");

    expect(sentBody().get("sender")).toBe("10004346");
  });
});

describe("خطاها", () => {
  it("اعتبار ناکافی را با راهنمای عملی برمی‌گرداند", async () => {
    fetchMock.mockResolvedValue(rejected(418, "اعتبار شما کافی نمی‌باشد"));

    // پرتکرارترین خرابی تولید، و تنها یکی که هیچ ربطی به کد ندارد
    await expect(sender().sendOtp(PHONE, "123456")).rejects.toThrow(/شارژ کنید/);
  });

  it("الگوی پیدانشده را به SMS_OTP_TEMPLATE ربط می‌دهد", async () => {
    fetchMock.mockResolvedValue(rejected(424, "الگو پیدا نشد"));

    await expect(sender().sendOtp(PHONE, "123456")).rejects.toThrow(/SMS_OTP_TEMPLATE/);
  });

  it("کلید نامعتبر را به SMS_API_KEY ربط می‌دهد", async () => {
    fetchMock.mockResolvedValue(rejected(403, "دسترسی مجاز نیست"));

    await expect(sender().sendOtp(PHONE, "123456")).rejects.toThrow(/SMS_API_KEY/);
  });

  it("کد ناشناخته را هم با پیام خودِ کاوه‌نگار پرتاب می‌کند", async () => {
    fetchMock.mockResolvedValue(rejected(499, "خطای تازه"));

    await expect(sender().sendOtp(PHONE, "123456")).rejects.toThrow(/خطای تازه/);
  });

  it("پاسخی که JSON نیست، خطای روشن می‌دهد نه SyntaxError", async () => {
    // صفحه‌ی خطای پراکسی یا HTML نگه‌داری — شکل واقعی خرابی سرویس
    fetchMock.mockResolvedValue(new Response("<html>502</html>", { status: 502 }));

    await expect(sender().sendOtp(PHONE, "123456")).rejects.toThrow(/کاوه‌نگار/);
  });

  it("قطعی شبکه به خطای گویا تبدیل می‌شود", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));

    // «fetch failed» به تنهایی در لاگ هیچ نمی‌گوید
    await expect(sender().sendOtp(PHONE, "123456")).rejects.toThrow(/ارتباط با کاوه‌نگار/);
  });

  it("هیچ پیام خطایی کلید API را لو نمی‌دهد", async () => {
    fetchMock.mockResolvedValue(rejected(418, "اعتبار شما کافی نمی‌باشد"));

    // کلید ناچار در مسیر URL است؛ پس هیچ خطایی نباید URL را بیاورد
    await expect(sender().sendOtp(PHONE, "123456")).rejects.not.toThrow(/test-api-key/);
  });

  it("خطای شبکه هم کلید API را لو نمی‌دهد", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));

    await expect(sender().sendOtp(PHONE, "123456")).rejects.not.toThrow(/test-api-key/);
  });
});
