import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ZarinpalGateway, toGatewayAmount } from "./gateway.port.js";

/**
 * آداپتور زرین‌پال در برابر شکل واقعی پاسخ‌ها.
 *
 * مهم‌ترین چیزی که این فایل نگه می‌دارد، مرزِ **`FAILED` در برابر
 * پرتاب** است. `settleOrder` این دو را کاملاً متفاوت می‌بیند:
 *
 *   • `FAILED`  → سفارش برای همیشه ناموفق علامت می‌خورد
 *   • پرتاب     → سفارش `PENDING` می‌ماند و قابل بررسی است
 *
 * پس هر حالتی که «نمی‌دانیم چه شد» باشد و به `FAILED` تبدیل شود، یعنی
 * پولِ گرفته‌شده با جلسه‌ی قطعی‌نشده — و هیچ چیزی در سیستم دیگر سراغش
 * نمی‌رود.
 */

const AUTHORITY = "A00000000000000000000000000000123456";

let fetchMock: ReturnType<typeof vi.fn>;

/** پاسخ موفق — `errors` آرایه‌ی خالی است، نه شیء. */
function ok(data: Record<string, unknown>): Response {
  return new Response(JSON.stringify({ data, errors: [] }), { status: 200 });
}

/**
 * پاسخ خطا — `data` آرایه‌ی خالی می‌شود و کد در `errors` می‌نشیند.
 *
 * کد HTTP عمداً ۴۰۰ است: زرین‌پال خطاهای دامنه‌ای را همین‌طور برمی‌گرداند
 * و آداپتوری که پیش از خواندن بدنه به `response.ok` نگاه کند، علت را
 * دور می‌ریزد.
 */
function failure(code: number, message: string): Response {
  return new Response(JSON.stringify({ data: [], errors: { code, message } }), {
    status: 400,
  });
}

function gateway(): ZarinpalGateway {
  return new ZarinpalGateway("merchant-id", true);
}

function verify(): Promise<unknown> {
  return gateway().verify({ authority: AUTHORITY, amount: 3_000_000n });
}

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("درخواست پرداخت", () => {
  it("مبلغ را به ریال می‌فرستد و آدرس هدایت می‌سازد", async () => {
    fetchMock.mockResolvedValue(ok({ code: 100, authority: AUTHORITY }));

    const result = await gateway().request({
      orderId: "order-1",
      amount: 3_000_000n,
      description: "جلسه‌ی گیتار",
      callbackUrl: "https://api.example.com/api/payments/callback",
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string).amount).toBe(3_000_000);
    expect(result.authority).toBe(AUTHORITY);
    expect(result.redirectUrl).toContain(AUTHORITY);
  });

  it("خطای پیکربندی را با کد پرتاب می‌کند", async () => {
    fetchMock.mockResolvedValue(failure(-11, "ترمینال فعال نیست"));

    // هنوز پولی جابه‌جا نشده، پس پرتاب اینجا بی‌خطر است
    await expect(
      gateway().request({
        orderId: "order-1",
        amount: 3_000_000n,
        description: "جلسه",
        callbackUrl: "https://api.example.com/api/payments/callback",
      }),
    ).rejects.toThrow(/-11/);
  });
});

describe("تأیید موفق", () => {
  it("کد ۱۰۰ را با شناسه‌ی پیگیری برمی‌گرداند", async () => {
    fetchMock.mockResolvedValue(ok({ code: 100, ref_id: 987654, card_pan: "622106****1234" }));

    expect(await verify()).toEqual({
      status: "OK",
      refId: "987654",
      cardPan: "622106****1234",
    });
  });

  it("کد ۱۰۱ را از ناموفق جدا می‌کند", async () => {
    fetchMock.mockResolvedValue(ok({ code: 101, ref_id: 987654 }));

    // یعنی پول گرفته شده و فقط ما دو بار پرسیده‌ایم — اگر با FAILED یکی
    // می‌شد، هر رفرشِ صفحه‌ی بازگشت سفارشِ پرداخت‌شده را ناموفق می‌کرد
    expect(await verify()).toEqual({ status: "ALREADY_VERIFIED", refId: "987654" });
  });

  it("مبلغ مورد انتظار در همان درخواست تأیید می‌رود", async () => {
    fetchMock.mockResolvedValue(ok({ code: 100, ref_id: 1 }));

    await verify();

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string).amount).toBe(3_000_000);
  });
});

describe("ناکامی قطعی — سفارش باید FAILED شود", () => {
  it("پرداخت رهاشده", async () => {
    fetchMock.mockResolvedValue(failure(-51, "پرداخت ناموفق"));

    expect(await verify()).toMatchObject({ status: "FAILED" });
  });

  it("عدم تطابق مبلغ، واحد ریال/تومان را یادآوری می‌کند", async () => {
    fetchMock.mockResolvedValue(failure(-50, "مبلغ متفاوت است"));

    // اگر حساب پذیرندگی روی تومان باشد، **هر** پرداختی این کد را
    // می‌گیرد — پیام باید کسی را که لاگ می‌خواند سراغ واحد مبلغ بفرستد
    const result = (await verify()) as { status: string; reason: string };
    expect(result.status).toBe("FAILED");
    expect(result.reason).toMatch(/تومان/);
  });

  it("شناسه‌ی پرداخت نامعتبر", async () => {
    fetchMock.mockResolvedValue(failure(-54, "اتوریتی نامعتبر"));

    expect(await verify()).toMatchObject({ status: "FAILED" });
  });
});

describe("ابهام — سفارش باید PENDING بماند", () => {
  it("کد خطای ناشناخته ناموفق حساب نمی‌شود", async () => {
    fetchMock.mockResolvedValue(failure(-99, "خطای تازه‌ی زرین‌پال"));

    // جهت پیش‌فرض: سفارشِ PENDING که باید ناموفق می‌شد با جاروی مهلت
    // پاک می‌شود، ولی سفارشِ FAILED که واقعاً پرداخت شده بود گم می‌شود
    await expect(verify()).rejects.toThrow(/شناخته نشد/);
  });

  it("کد ۱۰۰ بدون ref_id ناموفق حساب نمی‌شود", async () => {
    fetchMock.mockResolvedValue(ok({ code: 100 }));

    // «موفق» بدون شناسه‌ای برای ثبت — بدترین کار، ناموفق شمردنش است
    await expect(verify()).rejects.toThrow();
  });

  it("پاسخی که JSON نیست", async () => {
    fetchMock.mockResolvedValue(new Response("<html>504</html>", { status: 504 }));

    await expect(verify()).rejects.toThrow(/قابل خواندن نبود/);
  });

  it("قطعی شبکه", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));

    await expect(verify()).rejects.toThrow(/ارتباط با زرین‌پال/);
  });

  it("مهلت تمام‌شده", async () => {
    fetchMock.mockRejectedValue(new DOMException("timed out", "TimeoutError"));

    // مهلت از همه خطرناک‌تر است: درخواست ممکن است رسیده و تأیید شده
    // باشد و فقط پاسخش به ما نرسیده
    await expect(verify()).rejects.toThrow(/ارتباط با زرین‌پال/);
  });
});

describe("سندباکس", () => {
  it("آدرس سندباکس با آدرس واقعی فرق دارد", async () => {
    // بدنه‌ی `Response` فقط یک بار خوانده می‌شود، پس برای دو فراخوانی
    // باید هر بار یک شیء تازه ساخته شود
    fetchMock.mockImplementation(() => ok({ code: 100, ref_id: 1 }));

    await verify();
    const [sandboxUrl] = fetchMock.mock.calls[0] as [string];

    fetchMock.mockClear();
    await new ZarinpalGateway("merchant-id", false).verify({
      authority: AUTHORITY,
      amount: 1n,
    });
    const [liveUrl] = fetchMock.mock.calls[0] as [string];

    expect(sandboxUrl).toContain("sandbox");
    expect(liveUrl).not.toContain("sandbox");
  });
});

/**
 * واحد مبلغ — تنها چیزی در این آداپتور که با هیچ تستی قابل اثبات نیست
 * و فقط یک تراکنش واقعی معلومش می‌کند.
 *
 * چیزی که اینجا اثبات می‌شود این است که وقتی **معلوم شد**، عوض کردنش
 * یک مقدار در `.env` است و هر دو درخواست (پرداخت و تأیید) با هم عوض
 * می‌شوند. اگر این دو از هم بیفتند، درگاه کد -50 می‌دهد: پول کاربر رفته
 * و سفارش تأیید نشده.
 */
describe("واحد مبلغ حساب پذیرندگی", () => {
  const toman = () => new ZarinpalGateway("merchant-id", true, "TOMAN");

  it("در حالت تومان، مبلغ ریالی تقسیم بر ده می‌رود", async () => {
    fetchMock.mockResolvedValue(ok({ code: 100, authority: AUTHORITY }));

    await toman().request({
      orderId: "order-1",
      amount: 3_000_000n,
      description: "جلسه‌ی گیتار",
      callbackUrl: "https://api.example.com/api/payments/callback",
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string).amount).toBe(300_000);
  });

  it("تأیید همان تبدیل را می‌کند، نه تبدیل دیگری", async () => {
    fetchMock.mockResolvedValue(ok({ code: 100, ref_id: 42 }));

    await toman().verify({ authority: AUTHORITY, amount: 3_000_000n });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string).amount).toBe(300_000);
  });

  it("مبلغ بخش‌ناپذیر گِرد نمی‌شود، پرتاب می‌کند", () => {
    // گِرد کردن بی‌صدا یعنی همان -50، ولی بدون هیچ سرنخی در لاگ
    expect(() => toGatewayAmount(3_000_005n, "TOMAN")).toThrow(/بخش‌پذیر نیست/);
    expect(toGatewayAmount(3_000_005n, "RIAL")).toBe(3_000_005);
  });
});
