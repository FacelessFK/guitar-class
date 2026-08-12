/**
 * بلاگ — خواندنِ عمومی و مدیریتِ ادمین.
 *
 * دو قاعده در کل این ماژول:
 *
 *   ۱. **مسیر عمومی فقط `PUBLISHED` می‌بیند.** پیش‌نویس نه در فهرست
 *      می‌آید، نه با اسلاگ مستقیم. شرط روی خودِ کوئری است نه فیلترِ
 *      بعدی، تا اولین مسیری که فراموشش کند اصلاً کامپایل نشود.
 *
 *   ۲. **نشانی تصویر از بلیت می‌آید، نه از بدنه.** همان قاعده‌ی بقیه‌ی
 *      ماژول‌ها؛ اینجا هم `coverObjectKey` گرفته می‌شود نه `coverUrl`.
 */

import { and, count, desc, eq, ne } from "drizzle-orm";
import type { PostStatus } from "@music/shared";

import { db } from "../db/client.js";
import { uniqueViolationConstraint } from "../common/pg-error.js";
import { instruments, posts, users } from "../db/schema/index.js";
import { consumeUploadTicket } from "../media/media.service.js";
import { objectStorage } from "../media/storage.port.js";
import { pageBounds, type Page, type PageQuery } from "../admin/pagination.js";
import { PostNotFoundError, PostSlugTakenError } from "./errors.js";

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
  /** مارک‌داون خام — رندر در لایه‌ی نمایش انجام می‌شود */
  content: string;
  updatedAt: string;
}

function postQuery() {
  return db
    .select({
      id: posts.id,
      slug: posts.slug,
      title: posts.title,
      excerpt: posts.excerpt,
      content: posts.content,
      coverUrl: posts.coverUrl,
      authorName: users.fullName,
      instrumentSlug: instruments.slug,
      instrumentName: instruments.nameFa,
      status: posts.status,
      publishedAt: posts.publishedAt,
      updatedAt: posts.updatedAt,
    })
    .from(posts)
    .innerJoin(users, eq(posts.authorId, users.id))
    .leftJoin(instruments, eq(posts.instrumentId, instruments.id));
}

type PostQueryRow = Awaited<ReturnType<typeof postQuery>>[number];

function toSummary(row: PostQueryRow): PostSummary {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    excerpt: row.excerpt,
    coverUrl: row.coverUrl,
    authorName: row.authorName,
    instrumentSlug: row.instrumentSlug,
    instrumentName: row.instrumentName,
    publishedAt: row.publishedAt?.toISOString() ?? null,
  };
}

function toDetail(row: PostQueryRow): PostDetail {
  return { ...toSummary(row), content: row.content, updatedAt: row.updatedAt.toISOString() };
}

// ---------------------------------------------------------------------------
// عمومی
// ---------------------------------------------------------------------------

/** شرطِ «منتشرشده» — یک جا تعریف می‌شود تا هیچ مسیر عمومی‌ای جا نیندازدش. */
const published = () => eq(posts.status, "PUBLISHED");

/**
 * نوشته‌های منتشرشده، تازه‌ترین اول.
 *
 * صفحه‌بندی دارد چون بلاگ همان چیزی است که قرار است سال‌ها رشد کند —
 * برخلاف کاتالوگ که با تعداد استادها محدود است.
 */
export async function listPublishedPosts(
  query: { instrumentSlug?: string } & PageQuery = {},
): Promise<Page<PostSummary>> {
  const { limit, offset } = pageBounds(query);

  const where = and(
    published(),
    query.instrumentSlug ? eq(instruments.slug, query.instrumentSlug) : undefined,
  );

  const [rows, total] = await Promise.all([
    postQuery()
      .where(where)
      .orderBy(desc(posts.publishedAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ value: count() })
      .from(posts)
      .leftJoin(instruments, eq(posts.instrumentId, instruments.id))
      .where(where)
      .then((result) => result[0]?.value ?? 0),
  ]);

  return { rows: rows.map(toSummary), total, limit, offset };
}

/**
 * یک نوشته با اسلاگ.
 *
 * `null` برمی‌گرداند و خطا پرتاب نمی‌کند: صدازننده‌اش صفحه‌ی Next است و
 * پاسخ درستش `notFound()` است، نه یک خطای ۵۰۰ که بیلد را می‌شکند.
 */
export async function getPublishedPost(slug: string): Promise<PostDetail | null> {
  const [row] = await postQuery()
    .where(and(published(), eq(posts.slug, slug)))
    .limit(1);

  return row ? toDetail(row) : null;
}

/**
 * چند نوشته‌ی مرتبط برای پای صفحه.
 *
 * هم‌ساز بودن معیار است، و اگر نوشته سازی ندارد، تازه‌ترین‌ها. ارزشش
 * پیوند داخلی است: بدون آن، هر نوشته یک بن‌بست است و بازدیدکننده‌ای که
 * از گوگل آمده همان‌جا خارج می‌شود.
 */
export async function relatedPosts(slug: string, take = 3): Promise<PostSummary[]> {
  const [current] = await db
    .select({ instrumentId: posts.instrumentId })
    .from(posts)
    .where(eq(posts.slug, slug))
    .limit(1);

  const rows = await postQuery()
    .where(
      and(
        published(),
        ne(posts.slug, slug),
        current?.instrumentId ? eq(posts.instrumentId, current.instrumentId) : undefined,
      ),
    )
    .orderBy(desc(posts.publishedAt))
    .limit(take);

  return rows.map(toSummary);
}

// ---------------------------------------------------------------------------
// ادمین
// ---------------------------------------------------------------------------

export interface AdminPostRow extends PostDetail {
  status: PostStatus;
  instrumentId: string | null;
}

/** فهرست ادمین — پیش‌نویس‌ها را هم می‌بیند. */
export async function listAllPosts(
  query: { status?: PostStatus } & PageQuery = {},
): Promise<Page<PostSummary & { status: PostStatus }>> {
  const { limit, offset } = pageBounds(query);
  const where = query.status ? eq(posts.status, query.status) : undefined;

  const [rows, total] = await Promise.all([
    postQuery()
      .where(where)
      // پیش‌نویسِ منتشرنشده `published_at` ندارد؛ با `created_at` مرتب
      // می‌شود تا تازه‌ترین پیش‌نویس ته فهرست نیفتد
      .orderBy(desc(posts.createdAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ value: count() })
      .from(posts)
      .where(where)
      .then((result) => result[0]?.value ?? 0),
  ]);

  return {
    rows: rows.map((row) => ({ ...toSummary(row), status: row.status })),
    total,
    limit,
    offset,
  };
}

export async function getPost(postId: string): Promise<AdminPostRow> {
  const [row] = await postQuery().where(eq(posts.id, postId)).limit(1);

  if (!row) throw new PostNotFoundError();

  const [own] = await db
    .select({ instrumentId: posts.instrumentId })
    .from(posts)
    .where(eq(posts.id, postId))
    .limit(1);

  return { ...toDetail(row), status: row.status, instrumentId: own?.instrumentId ?? null };
}

export interface CreatePostInput {
  slug: string;
  title: string;
  excerpt: string;
  content: string;
  instrumentId: string | null;
  coverObjectKey: string | null;
  status: PostStatus;
}

export async function createPost(
  authorId: string,
  input: CreatePostInput,
): Promise<AdminPostRow> {
  const coverUrl = input.coverObjectKey
    ? (await consumeUploadTicket(input.coverObjectKey, authorId, "POST_COVER")).url
    : null;

  try {
    const [created] = await db
      .insert(posts)
      .values({
        slug: input.slug,
        title: input.title,
        excerpt: input.excerpt,
        content: input.content,
        instrumentId: input.instrumentId,
        coverUrl,
        coverObjectKey: input.coverObjectKey,
        authorId,
        status: input.status,
        // تاریخ انتشار همان لحظه‌ی منتشر شدن است، نه لحظه‌ی ساخته شدن
        publishedAt: input.status === "PUBLISHED" ? new Date() : null,
      })
      .returning({ id: posts.id });

    return getPost(created!.id);
  } catch (error) {
    throw translateSlugConflict(error);
  }
}

export interface UpdatePostInput {
  slug?: string;
  title?: string;
  excerpt?: string;
  content?: string;
  instrumentId?: string | null;
  coverObjectKey?: string | null;
  status?: PostStatus;
}

/**
 * ویرایش نوشته.
 *
 * `published_at` فقط در **اولین** انتشار نوشته می‌شود. ویرایش یک نوشته‌ی
 * منتشرشده تاریخش را جابه‌جا نمی‌کند، وگرنه اصلاح یک غلط املایی، نوشته‌ی
 * دو سال پیش را در نتایج گوگل «امروز» نشان می‌دهد. برگرداندن به
 * پیش‌نویس هم تاریخ را پاک نمی‌کند: انتشار دوباره باید همان تاریخ اول
 * را داشته باشد.
 */
export async function updatePost(
  postId: string,
  actorId: string,
  input: UpdatePostInput,
): Promise<AdminPostRow> {
  const existing = await getPost(postId);

  const changes: Record<string, unknown> = {};

  for (const key of ["slug", "title", "excerpt", "content", "instrumentId", "status"] as const) {
    if (input[key] !== undefined) changes[key] = input[key];
  }

  let previousKey: string | null = null;

  if (input.coverObjectKey !== undefined) {
    previousKey = await coverKeyOf(postId);
    changes.coverUrl = input.coverObjectKey
      ? (await consumeUploadTicket(input.coverObjectKey, actorId, "POST_COVER")).url
      : null;
    changes.coverObjectKey = input.coverObjectKey;
  }

  if (input.status === "PUBLISHED" && existing.publishedAt === null) {
    changes.publishedAt = new Date();
  }

  if (Object.keys(changes).length === 0) return existing;

  try {
    await db.update(posts).set(changes).where(eq(posts.id, postId));
  } catch (error) {
    throw translateSlugConflict(error);
  }

  // تصویر جایگزین‌شده وگرنه تا ابد در باکت می‌ماند و جاروی پاک‌سازی —
  // که از روی جدول کار می‌کند — پیدایش نمی‌کند
  if (previousKey && previousKey !== input.coverObjectKey) {
    await objectStorage().deleteObject(previousKey).catch(() => undefined);
  }

  return getPost(postId);
}

export async function deletePost(postId: string): Promise<void> {
  const coverKey = await coverKeyOf(postId);

  const deleted = await db
    .delete(posts)
    .where(eq(posts.id, postId))
    .returning({ id: posts.id });

  if (deleted.length === 0) throw new PostNotFoundError();

  if (coverKey) {
    await objectStorage().deleteObject(coverKey).catch(() => undefined);
  }
}

async function coverKeyOf(postId: string): Promise<string | null> {
  const [row] = await db
    .select({ key: posts.coverObjectKey })
    .from(posts)
    .where(eq(posts.id, postId))
    .limit(1);

  return row?.key ?? null;
}

/** تنها تعارضی که در این مسیرها ممکن است، اسلاگ تکراری است. */
function translateSlugConflict(error: unknown): unknown {
  return uniqueViolationConstraint(error) === "posts_slug_unique"
    ? new PostSlugTakenError()
    : error;
}

/**
 * برای `sitemap.xml` و `generateStaticParams` — فقط اسلاگ و لحظه‌ی
 * آخرین تغییر.
 *
 * صفحه‌بندی ندارد و سقفش بالاست: نقشه‌ی سایت باید **همه** را بشناسد و
 * نوشته‌ای که در آن نباشد، ماه‌ها دیرتر ایندکس می‌شود. سقف فقط برای این
 * است که یک کوئری بی‌مرز نباشد؛ رسیدن به آن یعنی وقتش شده نقشه‌ی سایت
 * تکه‌تکه شود، که کار جداگانه‌ای است.
 */
const SITEMAP_LIMIT = 5000;

export async function publishedSlugs(): Promise<
  Array<{ slug: string; updatedAt: string }>
> {
  const rows = await db
    .select({ slug: posts.slug, updatedAt: posts.updatedAt })
    .from(posts)
    .where(published())
    .orderBy(desc(posts.publishedAt))
    .limit(SITEMAP_LIMIT);

  return rows.map((row) => ({ slug: row.slug, updatedAt: row.updatedAt.toISOString() }));
}
