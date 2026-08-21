/**
 * خواندن کاتالوگ عمومی از API.
 *
 * صفحات عمومی در زمان بیلد رندر می‌شوند و هر چند ساعت یک بار تازه
 * می‌شوند (ISR). این ماژول فقط اندپوینت‌های `@Public()` را صدا می‌زند —
 * هیچ توکنی اینجا رد و بدل نمی‌شود.
 *
 * تایپ‌ها دستی نوشته شده‌اند و نه از `apps/api` وارد شده‌اند: وارد کردن
 * تایپ کنترلر یعنی فرانت به ساختار داخلی Drizzle و کل درخت وابستگی نست
 * گره بخورد. مرز واقعی بین این دو، همان JSON روی سیم است.
 */

/**
 * هر چند ثانیه صفحات دوباره ساخته شوند.
 *
 * کاتالوگ کم تغییر می‌کند (استاد جدید، قیمت جدید) و تازگیِ لحظه‌ای
 * ارزشی ندارد؛ در عوض صفحه‌ی ساخته‌شده باید همیشه سریع باشد.
 */
export const CATALOG_REVALIDATE_SECONDS = 3600;

/**
 * این ماژول **فقط سمت سرور** اجرا می‌شود (بیلد و ISR)، پس می‌تواند از
 * آدرسی استفاده کند که مرورگر اصلاً نمی‌شناسد.
 *
 * `API_INTERNAL_URL` برای همان است: در داکر، فرانت و API روی یک شبکه‌ی
 * داخلی‌اند و `http://api:4000/api` بی‌واسطه در دسترس است. رفتن از راه
 * دامنه‌ی عمومی یعنی درخواست از کانتینر بیرون برود، به nginx برسد و
 * دوباره برگردد — با سه شکست ممکن که هیچ‌کدام ربطی به برنامه ندارند:
 * گواهی TLS، برگشت DNS به خودِ ماشین، و باز بودن مسیر از بیرون.
 *
 * ⚠️ برخلاف `NEXT_PUBLIC_API_URL` این مقدار **در باندل مرورگر نمی‌نشیند**
 * (نامش `NEXT_PUBLIC_` نیست و نباید بشود). اگر تعریف نشود، همان آدرس
 * عمومی استفاده می‌شود و رفتار دقیقاً مثل قبل است.
 */
const apiBaseUrl = (): string =>
  process.env.API_INTERNAL_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  "http://localhost:4000/api";

export interface Instrument {
  id: string;
  slug: string;
  nameFa: string;
  descriptionFa: string | null;
  iconUrl: string | null;
}

export interface TeacherOffering {
  id: string;
  /** ریال، به‌صورت رشته چون از BigInt می‌آید و JSON عدد بزرگ را امن حمل نمی‌کند */
  price: string;
  durationMinutes: number;
  instrumentSlug: string;
  instrumentName: string;
}

export interface TeacherRating {
  /** میانگین یک تا پنج، به یک رقم اعشار؛ `null` یعنی هنوز نظری نیست */
  average: number | null;
  count: number;
}

export interface Teacher {
  profileId: string;
  slug: string;
  fullName: string;
  avatarUrl: string | null;
  headline: string;
  bio: string | null;
  introVideoUrl: string | null;
  yearsExperience: number;
  offerings: TeacherOffering[];
  rating: TeacherRating;
  /** شمار جلسه‌های `COMPLETED` این استاد */
  classesTaught: number;
}

export interface TeacherReview {
  id: string;
  rating: number;
  comment: string | null;
  /** ISO — لایه‌ی نمایش به شمسی تبدیلش می‌کند */
  createdAt: string;
  studentName: string;
  studentAvatarUrl: string | null;
}

/**
 * درخواست به API.
 *
 * خطا **بالا انداخته می‌شود و بی‌صدا به آرایه‌ی خالی تبدیل نمی‌شود.**
 * صفحه‌ای که به‌خاطر خاموش بودن API خالی ساخته شود، به‌عنوان صفحه‌ی
 * معتبرِ بی‌محتوا ایندکس می‌شود — بدترین حالت ممکن برای سئو. بیلدِ
 * شکست‌خورده دیده می‌شود، صفحه‌ی خالی نه.
 */
async function fetchJson<T>(path: string): Promise<T> {
  const url = `${apiBaseUrl()}${path}`;

  const response = await fetch(url, {
    next: { revalidate: CATALOG_REVALIDATE_SECONDS },
  });

  if (!response.ok) {
    throw new Error(`درخواست به ${url} با کد ${response.status} شکست خورد.`);
  }

  return response.json() as Promise<T>;
}

export async function getInstruments(): Promise<Instrument[]> {
  const data = await fetchJson<{ instruments: Instrument[] }>("/instruments");
  return data.instruments;
}

export async function getInstrument(slug: string): Promise<Instrument | null> {
  const instruments = await getInstruments();
  return instruments.find((instrument) => instrument.slug === slug) ?? null;
}

export async function getTeachers(instrumentSlug?: string): Promise<Teacher[]> {
  const query = instrumentSlug
    ? `?instrument=${encodeURIComponent(instrumentSlug)}`
    : "";
  const data = await fetchJson<{ teachers: Teacher[] }>(`/teachers${query}`);
  return data.teachers;
}

/**
 * نظرهای یک استاد برای صفحه‌ی عمومی.
 *
 * صفحه‌بندی سمت سرور است ولی این صفحه فقط اولین صفحه را نشان می‌دهد؛
 * `total` می‌گوید چند نظر هست تا «مشاهده‌ی همه» معنا داشته باشد.
 */
export async function getTeacherReviews(
  slug: string,
  limit = 6,
): Promise<{ reviews: TeacherReview[]; total: number }> {
  const data = await fetchJson<{
    reviews: TeacherReview[];
    total: number;
    limit: number;
    offset: number;
  }>(`/teachers/${encodeURIComponent(slug)}/reviews?limit=${limit}`);
  return { reviews: data.reviews, total: data.total };
}

// ---------------------------------------------------------------------------
// بلاگ
// ---------------------------------------------------------------------------

export interface PostSummary {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  coverUrl: string | null;
  authorName: string;
  instrumentSlug: string | null;
  instrumentName: string | null;
  publishedAt: string | null;
}

export interface PostDetail extends PostSummary {
  /** مارک‌داون خام — رندر در زمان بیلد انجام می‌شود */
  content: string;
  updatedAt: string;
}

export async function getPosts(instrumentSlug?: string): Promise<PostSummary[]> {
  const query = instrumentSlug
    ? `?instrument=${encodeURIComponent(instrumentSlug)}`
    : "";
  const data = await fetchJson<{ posts: PostSummary[] }>(`/posts${query}`);
  return data.posts;
}

/**
 * ⚠️ **Next پارامتر مسیر را کدشده می‌دهد، نه کدگشوده.**
 *
 * برای `/blog/%D8%B4...`، مقدار `params.slug` همان رشته‌ی درصددار است.
 * پس `encodeURIComponent` روی آن، دوباره کدش می‌کند (`%` می‌شود `%25`)
 * و اسلاگی به API می‌رود که با هیچ نوشته‌ای نمی‌خواند — نتیجه‌اش ۴۰۴
 * روی نوشته‌ای که وجود دارد، و فقط برای اسلاگ‌های فارسی. اسلاگ لاتین
 * درست کار می‌کند و همین، پیدا کردنش را سخت می‌کند.
 *
 * کدگشایی پیش از کدگذاری، هر دو شکل را درست می‌کند: `generateStaticParams`
 * مقدار خام می‌دهد و مسیر ورودی مقدار کدشده. کاراکتر `%` در اسلاگ مجاز
 * نیست (اعتبارسنجی سمت API)، پس این کدگشایی ابهامی ندارد.
 */
function normalizeSlug(slug: string): string {
  return encodeURIComponent(decodeURIComponent(slug));
}

/**
 * یک نوشته با اسلاگ، به‌علاوه‌ی نوشته‌های مرتبط.
 *
 * نوشته‌ی منتشرنشده `null` برمی‌گرداند نه خطا — صفحه باید `notFound()`
 * بزند، نه اینکه کل بیلد را بشکند.
 */
export async function getPost(
  slug: string,
): Promise<{ post: PostDetail | null; related: PostSummary[] }> {
  return fetchJson(`/posts/${normalizeSlug(slug)}`);
}

/** فقط اسلاگ‌ها — برای `sitemap.xml` و `generateStaticParams`. */
export async function getPostSlugs(): Promise<
  Array<{ slug: string; updatedAt: string }>
> {
  const data = await fetchJson<{ slugs: Array<{ slug: string; updatedAt: string }> }>(
    "/posts/slugs",
  );
  return data.slugs;
}
