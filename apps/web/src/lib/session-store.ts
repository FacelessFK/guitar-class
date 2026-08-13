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
 * **هیچ توکنی اینجا ذخیره نمی‌شود.**
 * توکن تازه‌سازی در کوکی `httpOnly` است که API می‌نشاند و این کد اصلاً
 * نمی‌بیندش — مرورگر خودش روی درخواست‌های `/auth` می‌فرستدش. توکن
 * دسترسی فقط در حافظه‌ی همین ماژول می‌ماند و هرگز نوشته نمی‌شود، پس با
 * بستن برگه می‌رود.
 *
 * پیش از این توکن تازه‌سازی در `localStorage` بود و یک آسیب‌پذیری XSS
 * می‌توانست نشستِ سی‌روزه را بردارد و ببرد. حالا همان XSS حداکثر به یک
 * توکن دسترسیِ ۱۵ دقیقه‌ای می‌رسد.
 *
 * ⚠️ هر درخواستی که به کوکی نیاز دارد باید `credentials: "include"`
 * داشته باشد؛ `fetch` به‌صورت پیش‌فرض کوکی را بین مبداهای مختلف
 * نمی‌فرستد. جا افتادنش به شکل «کاربر مدام بیرون می‌افتد» دیده می‌شود،
 * نه به شکل خطا.
 */

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
 * `useSyncExternalStore` در رندر سرور هم صدا زده می‌شود و آنجا هیچ
 * توکنی در دست نیست. همیشه «در حال بارگذاری» برمی‌گردد تا HTML سرور و
 * اولین رندر کلاینت یکی باشند و ناهماهنگی هیدریشن پیش نیاید.
 */
const SERVER_STATE: SessionState = { status: "loading", user: null };
export function getServerSnapshot(): SessionState {
  return SERVER_STATE;
}

// ---------------------------------------------------------------------------
// توکن‌ها
// ---------------------------------------------------------------------------

export function getAccessToken(): string | null {
  return accessToken;
}

/**
 * آیا ارزشش را دارد که تمدید را امتحان کنیم؟
 *
 * کوکی `httpOnly` است و از جاوااسکریپت خوانده نمی‌شود، پس برخلاف قبل
 * نمی‌شود **قطعی** جواب داد. این تابع فقط می‌گوید «نشستی می‌شناسیم یا
 * تازگی داشتیم» — و هزینه‌ی اشتباهش یک درخواست تمدیدِ ۴۰۱ است، نه
 * چیزی بیشتر.
 *
 * بعد از یک تمدید ناموفق `false` می‌شود تا هر ۴۰۱ بعدی یک درخواست
 * محکوم‌به‌شکست اضافه نکند.
 */
let mayHaveSession = true;

export function hasRefreshToken(): boolean {
  return mayHaveSession;
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
}

/**
 * `credentials: "include"` روی هر سه‌ی این درخواست‌هاست.
 *
 * بدون آن مرورگر کوکی تازه‌سازی را نمی‌فرستد و `Set-Cookie` پاسخ را هم
 * نمی‌پذیرد — یعنی ورود ظاهراً موفق می‌شود ولی نشست با اولین رفرشِ صفحه
 * می‌پرد.
 */
async function postJson<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${apiBaseUrl()}${path}`, {
    method: "POST",
    credentials: "include",
    headers: body === undefined ? {} : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
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
  try {
    // کوکی را مرورگر می‌فرستد؛ بدنه‌ای لازم نیست
    const result = await postJson<TokenResponse>("/auth/refresh");

    accessToken = result.accessToken;
    mayHaveSession = true;
    return result.accessToken;
  } catch {
    // کوکی نیست، باطل شده، یا منقضی — تنها پاسخ درست، ورود دوباره
    clearSession();
    return null;
  }
}

/**
 * پس از ورود موفق.
 *
 * توکن تازه‌سازی همراه پاسخِ همین ورود به شکل کوکی نشسته و کاری با آن
 * نداریم؛ فقط توکن دسترسی را نگه می‌داریم.
 */
export async function startSession(tokens: TokenResponse): Promise<void> {
  accessToken = tokens.accessToken;
  mayHaveSession = true;
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

  /**
   * همیشه یک تمدید امتحان می‌شود، حتی برای بازدیدکننده‌ی واردنشده.
   *
   * پیش از این می‌شد از روی `localStorage` فهمید نشستی هست یا نه و
   * درخواست را صرفه‌جویی کرد. کوکی `httpOnly` خوانده نمی‌شود، پس تنها
   * راه پرسیدن، پرسیدن از API است. بهایش یک درخواستِ ۴۰۱ در اولین
   * بارگذاری برای کاربر واردنشده است — و همان یک بار، چون
   * `bootstrapped` جلوی تکرارش را می‌گیرد.
   */
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
  clearSession();

  // پاک کردن کوکی فقط از سمت سرور ممکن است — `httpOnly` است
  await postJson("/auth/logout").catch(() => undefined);
}

export function clearSession(): void {
  accessToken = null;
  // نشست تمام شده و وضعیت قطعی است؛ راه‌اندازی دوباره فقط یک تمدید
  // محکوم‌به‌شکست اضافه می‌کند
  mayHaveSession = false;
  bootstrapped = true;
  setState({ status: "anonymous", user: null });
}
