/**
 * نشست کاربر — بیرون از ری‌اکت.
 *
 * این ماژول عمداً هیچ چیزی از ری‌اکت نمی‌داند: توکن‌ها را نگه می‌دارد،
 * تمدیدشان می‌کند، و به مشترک‌ها خبر می‌دهد. `session.tsx` فقط یک پوسته‌ی
 * نازک روی همین است. دلیلش این است که `apiFetch` هم باید به توکن
 * برسد و هم بتواند نشست را باطل کند، و آن تابع از داخل کامپوننت صدا
 * زده نمی‌شود — اگر نشست فقط در context بود، هر صدازننده باید توکن را
 * دستی به آن پاس می‌داد و اولین جای فراموش‌شده یک درخواست بی‌توکن
 * می‌شد.
 *
 * ⚠️ **توکن تازه‌سازی در `localStorage` می‌ماند.**
 * انتخاب آگاهانه است، نه بی‌توجهی: API توکن‌ها را در بدنه‌ی JSON
 * برمی‌گرداند و کوکی `httpOnly` ست نمی‌کند، پس نگه‌داری‌شان کار کلاینت
 * است. بهایش این است که یک آسیب‌پذیری XSS می‌تواند نشست را بدزدد.
 * راه امن‌تر — کوکی `httpOnly` روی همین دامنه — به تغییر سمت API نیاز
 * دارد (`Set-Cookie` در `otp/verify` و `refresh`) و در فهرست بدهی‌ها
 * ثبت است. توکن دسترسی فقط در حافظه می‌ماند و هرگز نوشته نمی‌شود.
 */

const STORAGE_KEY = "music.session";

const apiBaseUrl = (): string =>
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";

export interface CurrentUser {
  id: string;
  phone: string;
  fullName: string;
  avatarUrl: string | null;
  isAdmin: boolean;
  /** جلسه‌ی معارفه‌ی رایگان یک‌بار برای همیشه است */
  trialUsed: boolean;
  /** اگر تهی نباشد، کاربر پنل استاد هم دارد */
  teacherProfileId: string | null;
}

export type SessionStatus = "loading" | "authenticated" | "anonymous";

export interface SessionState {
  status: SessionStatus;
  user: CurrentUser | null;
}

/**
 * وضعیت اولیه `loading` است، نه `anonymous`.
 *
 * تفاوتشان مهم است: تا وقتی توکن تازه‌سازی امتحان نشده، «واردنشده»
 * نمی‌دانیم. اگر حالت اولیه `anonymous` بود، گارد مسیر در همان رندر
 * اول کاربرِ واردشده را به صفحه‌ی ورود می‌فرستاد و هر بار تازه‌سازی
 * صفحه یعنی بیرون انداخته شدن.
 */
let state: SessionState = { status: "loading", user: null };

let accessToken: string | null = null;

const listeners = new Set<() => void>();

function setState(next: SessionState): void {
  state = next;
  for (const listener of listeners) listener();
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getSnapshot(): SessionState {
  return state;
}

/**
 * تصویر سمت سرور.
 *
 * `useSyncExternalStore` در رندر سرور هم صدا زده می‌شود و آنجا نه
 * `localStorage` هست نه توکنی. همیشه «در حال بارگذاری» برمی‌گردد تا
 * HTML سرور و اولین رندر کلاینت یکی باشند و ناهماهنگی هیدریشن پیش
 * نیاید.
 */
const SERVER_STATE: SessionState = { status: "loading", user: null };
export function getServerSnapshot(): SessionState {
  return SERVER_STATE;
}

// ---------------------------------------------------------------------------
// توکن‌ها
// ---------------------------------------------------------------------------

function readRefreshToken(): string | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed === "object" && parsed !== null && "refreshToken" in parsed) {
      const token = (parsed as { refreshToken: unknown }).refreshToken;
      return typeof token === "string" ? token : null;
    }
    return null;
  } catch {
    // مقدار خراب در استوریج نباید کل اپ را بشکند؛ مثل نبودن نشست
    // رفتار می‌کنیم و کاربر دوباره وارد می‌شود
    return null;
  }
}

function writeRefreshToken(token: string | null): void {
  if (typeof window === "undefined") return;

  if (token === null) {
    window.localStorage.removeItem(STORAGE_KEY);
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ refreshToken: token }));
}

export function getAccessToken(): string | null {
  return accessToken;
}

export function hasRefreshToken(): boolean {
  return readRefreshToken() !== null;
}

// ---------------------------------------------------------------------------
// درخواست‌های خام احراز هویت
// ---------------------------------------------------------------------------

/**
 * این چند تابع عمداً از `apiFetch` استفاده نمی‌کنند.
 *
 * `apiFetch` روی ۴۰۱ نشست را تمدید می‌کند و تمدید هم یک درخواست است —
 * اگر از خودش استفاده می‌کرد، یک توکن منقضی حلقه‌ی بی‌پایان می‌ساخت.
 */
interface TokenResponse {
  accessToken: string;
  refreshToken: string;
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${apiBaseUrl()}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    throw payload ?? new Error(`درخواست ${path} شکست خورد`);
  }

  return payload as T;
}

/**
 * تمدید نشست، تک‌مسیره.
 *
 * توکن تازه‌سازی در API **می‌چرخد**: هر بار مصرف شود باطل می‌شود و یکی
 * نو برمی‌گردد. پس دو تمدید هم‌زمان یعنی دومی با توکنِ باطل‌شده می‌رود و
 * کاربر بی‌دلیل بیرون می‌افتد. این متغیر تضمین می‌کند چند درخواستی که
 * با هم ۴۰۱ گرفته‌اند، همگی منتظر یک تمدید بمانند.
 *
 * (بین **تب‌های** مختلف این محافظت وجود ندارد؛ چرخش توکن ذاتاً با چند
 * تب سازگار نیست و بهایش این است که یکی از تب‌ها یک بار بیرون بیفتد.)
 */
let refreshInFlight: Promise<string | null> | null = null;

export function refreshSession(): Promise<string | null> {
  refreshInFlight ??= performRefresh().finally(() => {
    refreshInFlight = null;
  });

  return refreshInFlight;
}

async function performRefresh(): Promise<string | null> {
  const token = readRefreshToken();

  if (!token) {
    clearSession();
    return null;
  }

  try {
    const result = await postJson<TokenResponse>("/auth/refresh", {
      refreshToken: token,
    });

    accessToken = result.accessToken;
    writeRefreshToken(result.refreshToken);
    return result.accessToken;
  } catch {
    // توکن تازه‌سازی باطل یا منقضی است — تنها پاسخ درست، ورود دوباره
    clearSession();
    return null;
  }
}

/** پس از ورود موفق: توکن‌ها را می‌نشاند و پروفایل را می‌خواند. */
export async function startSession(tokens: TokenResponse): Promise<void> {
  accessToken = tokens.accessToken;
  writeRefreshToken(tokens.refreshToken);
  await loadUser();
}

/**
 * راه‌اندازی نشست هنگام بالا آمدن اپ.
 *
 * همیشه از تمدید شروع می‌شود، حتی اگر توکن دسترسی در حافظه باشد: تنها
 * چیزی که از تازه‌سازی صفحه جان به در می‌برد توکن تازه‌سازی است.
 *
 * فقط **یک بار** در عمر برگه اجرا می‌شود. `SessionBootstrap` در چند
 * لایوت می‌نشیند (ورود، اپ، اتاق کلاس) و رفتن از یکی به دیگری آن را
 * دوباره سوار می‌کند؛ بدون این نگهبان، هر جابه‌جایی یک تمدید اضافه
 * می‌شد — و چون توکن تازه‌سازی می‌چرخد، تمدید اضافه یعنی مسابقه‌ی
 * بی‌دلیل روی توکنی که همین حالا معتبر است.
 */
let bootstrapped = false;

export async function bootstrapSession(): Promise<void> {
  if (bootstrapped) return;
  bootstrapped = true;

  if (!readRefreshToken()) {
    setState({ status: "anonymous", user: null });
    return;
  }

  const token = await refreshSession();

  if (!token) {
    setState({ status: "anonymous", user: null });
    return;
  }

  await loadUser();
}

/**
 * پروفایل کاربر جاری.
 *
 * بعد از هر کاری که پروفایل را عوض می‌کند دوباره صدا زده می‌شود —
 * مثلاً رزرو جلسه‌ی معارفه که `trialUsed` را `true` می‌کند.
 */
export async function loadUser(): Promise<void> {
  const token = accessToken;

  if (!token) {
    setState({ status: "anonymous", user: null });
    return;
  }

  const response = await fetch(`${apiBaseUrl()}/auth/me`, {
    headers: { authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    clearSession();
    return;
  }

  const user = (await response.json()) as CurrentUser | null;

  if (!user) {
    clearSession();
    return;
  }

  setState({ status: "authenticated", user });
}

/**
 * خروج.
 *
 * توکن سمت سرور هم باطل می‌شود، ولی نتیجه‌اش منتظر نمی‌ماند و خطایش
 * نادیده گرفته می‌شود: کاربری که «خروج» زده باید بلافاصله بیرون برود،
 * حتی اگر شبکه قطع باشد. حالت خطرناک عکسش است — نشستی که سمت کلاینت
 * پاک شده ولی سمت سرور زنده مانده — و آن با چرخش توکن خودبه‌خود
 * محدود است.
 */
export async function endSession(): Promise<void> {
  const token = readRefreshToken();

  clearSession();

  if (token) {
    await postJson("/auth/logout", { refreshToken: token }).catch(() => undefined);
  }
}

export function clearSession(): void {
  accessToken = null;
  writeRefreshToken(null);
  // نشست تمام شده و وضعیت قطعی است؛ راه‌اندازی دوباره فقط یک تمدید
  // محکوم‌به‌شکست اضافه می‌کند
  bootstrapped = true;
  setState({ status: "anonymous", user: null });
}
