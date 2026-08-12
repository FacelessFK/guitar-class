/**
 * درخواست به API از سمت مرورگر.
 *
 * جدا از `lib/api.ts` است و جایگزینش نمی‌شود: آن یکی در زمان بیلد و
 * روی سرور اجرا می‌شود و فقط اندپوینت‌های عمومی را می‌خواند؛ این یکی
 * در مرورگر اجرا می‌شود، توکن حمل می‌کند، و نشست را تمدید می‌کند.
 * یکی کردنشان یعنی منطق نشست وارد مسیر رندر ایستا شود.
 */

import {
  getAccessToken,
  hasRefreshToken,
  refreshSession,
} from "./session-store";

const apiBaseUrl = (): string =>
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";

/**
 * خطای API با `code` ماشین‌خوان.
 *
 * پیام‌های خطای این API از قبل فارسی و قابل نمایش‌اند، پس `message`
 * مستقیماً به کاربر نشان داده می‌شود. `code` برای تصمیم‌های شرطی است
 * (مثل «جلسه‌ی معارفه قبلاً استفاده شده») و `body` برای فیلدهای اضافه‌ای
 * که بعضی خطاها می‌آورند: `opensAt` در اتاق کلاس، `conflicts` در پکیج،
 * `retryAfterSeconds` در ارسال کد.
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly body: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export interface ApiRequest {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  query?: Record<string, string | number | undefined>;
  /**
   * درخواست بدون توکن. برای مسیرهای عمومی‌ای که از مرورگر خوانده
   * می‌شوند — مثل اسلات‌های آزاد که هنرجوی واردنشده هم باید ببیند.
   */
  anonymous?: boolean;
}

function buildUrl(path: string, query?: ApiRequest["query"]): string {
  const url = new URL(`${apiBaseUrl()}${path}`);

  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }

  return url.toString();
}

async function send(url: string, request: ApiRequest, token: string | null) {
  return fetch(url, {
    method: request.method ?? "GET",
    headers: {
      ...(request.body === undefined ? {} : { "content-type": "application/json" }),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: request.body === undefined ? undefined : JSON.stringify(request.body),
  });
}

/**
 * درخواست احراز هویت‌شده، با تمدید خودکار نشست.
 *
 * توکن دسترسی ۱۵ دقیقه‌ای است و کاربری که نیم ساعت روی صفحه‌ی رزرو
 * مانده، دقیقاً موقع زدن دکمه ۴۰۱ می‌گیرد. تمدید همان‌جا انجام می‌شود و
 * درخواست **یک بار** تکرار می‌گردد؛ اگر باز هم ۴۰۱ بود یعنی نشست واقعاً
 * تمام شده و تکرار دوباره فقط حلقه می‌سازد.
 */
export async function apiFetch<T>(path: string, request: ApiRequest = {}): Promise<T> {
  const url = buildUrl(path, request.query);
  const token = request.anonymous ? null : getAccessToken();

  let response = await send(url, request, token);

  if (response.status === 401 && !request.anonymous && hasRefreshToken()) {
    const renewed = await refreshSession();
    if (renewed) {
      response = await send(url, request, renewed);
    }
  }

  return readResponse<T>(response);
}

async function readResponse<T>(response: Response): Promise<T> {
  // ۲۰۴ و بدنه‌ی خالی بدنه‌ی JSON ندارند؛ `null` امن‌تر از استثنای
  // «Unexpected end of JSON input» است که هیچ چیزی درباره‌ی مشکل نمی‌گوید
  const payload: unknown =
    response.status === 204 ? null : await response.json().catch(() => null);

  if (response.ok) {
    return payload as T;
  }

  const body =
    typeof payload === "object" && payload !== null
      ? (payload as Record<string, unknown>)
      : {};

  const code = typeof body.code === "string" ? body.code : "UNKNOWN";
  const message =
    typeof body.message === "string"
      ? body.message
      : "ارتباط با سرور برقرار نشد. کمی بعد دوباره تلاش کنید.";

  throw new ApiError(response.status, code, message, body);
}

/**
 * پیام قابل نمایش از هر چیزی که پرتاب شده.
 *
 * `fetch` روی قطعی شبکه `TypeError` می‌دهد که پیامش انگلیسی و برای
 * کاربر بی‌معناست، پس فقط خطاهای خودمان متنشان نشان داده می‌شود.
 */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return "ارتباط با سرور برقرار نشد. اتصال اینترنت را بررسی کنید.";
}
