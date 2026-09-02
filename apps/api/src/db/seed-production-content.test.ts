import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { count, eq } from "drizzle-orm";

import { db } from "./client.js";
import { instruments, posts, users } from "./schema/index.js";
import {
  parseSeedArguments,
  PRODUCTION_ARTICLES,
  seedProductionContent,
  validateArticleManifest,
} from "./seed-production-content.js";
import { closeDatabase, resetDatabase } from "../test/fixtures.js";

const AUTHOR_PHONE = "+989121234567";

async function seedDependencies(): Promise<{ authorId: string; instrumentId: string }> {
  const [author] = await db
    .insert(users)
    .values({
      phone: AUTHOR_PHONE,
      fullName: "تحریریهٔ پلتفرم",
      isAdmin: true,
      status: "ACTIVE",
    })
    .returning({ id: users.id });

  const [instrument] = await db
    .insert(instruments)
    .values({ slug: "classical-guitar", nameFa: "گیتار کلاسیک", isActive: true })
    .returning({ id: instruments.id });

  return { authorId: author!.id, instrumentId: instrument!.id };
}

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await closeDatabase();
});

describe("آرگومان‌ها و مانیفست seed محتوای تولید", () => {
  it("بدون فلگ صریح، dry-run می‌ماند", () => {
    expect(
      parseSeedArguments(["--author-phone", "09121234567"]),
    ).toEqual({ authorPhone: AUTHOR_PHONE, apply: false });
  });

  it("نوشتن را فقط با --apply فعال می‌کند", () => {
    expect(
      parseSeedArguments(["--apply", "--author-phone", "09121234567"]),
    ).toEqual({ authorPhone: AUTHOR_PHONE, apply: true });
  });

  it("پنج نوشتهٔ یکتا، منتشرشده و بدون تصویر دارد", () => {
    expect(() => validateArticleManifest()).not.toThrow();
    expect(PRODUCTION_ARTICLES).toHaveLength(5);
    expect(new Set(PRODUCTION_ARTICLES.map((article) => article.slug)).size).toBe(5);
    expect(
      PRODUCTION_ARTICLES.every(
        (article) =>
          article.status === "PUBLISHED" &&
          article.coverUrl === null &&
          article.coverObjectKey === null,
      ),
    ).toBe(true);
  });
});

describe("نوشتن امن محتوای تولید", () => {
  it("در dry-run هیچ نوشته‌ای درج نمی‌کند", async () => {
    await seedDependencies();

    const result = await seedProductionContent({ authorPhone: AUTHOR_PHONE, apply: false });
    const [row] = await db.select({ value: count() }).from(posts);

    expect(result).toMatchObject({ mode: "dry-run", existing: 0, inserted: 0, wouldInsert: 5 });
    expect(row?.value).toBe(0);
  });

  it("پنج نوشته را با نویسنده و ساز موجود و بدون cover درج می‌کند", async () => {
    const dependency = await seedDependencies();

    const result = await seedProductionContent({ authorPhone: AUTHOR_PHONE, apply: true });
    const rows = await db
      .select({
        authorId: posts.authorId,
        instrumentId: posts.instrumentId,
        status: posts.status,
        coverUrl: posts.coverUrl,
        coverObjectKey: posts.coverObjectKey,
        publishedAt: posts.publishedAt,
      })
      .from(posts);

    expect(result).toMatchObject({ mode: "applied", existing: 0, inserted: 5, wouldInsert: 5 });
    expect(rows).toHaveLength(5);
    expect(
      rows.every(
        (row) =>
          row.authorId === dependency.authorId &&
          row.instrumentId === dependency.instrumentId &&
          row.status === "PUBLISHED" &&
          row.coverUrl === null &&
          row.coverObjectKey === null &&
          row.publishedAt !== null,
      ),
    ).toBe(true);
  });

  it("اجرای دوباره روی همان داده no-op است و چیزی را overwrite نمی‌کند", async () => {
    await seedDependencies();
    await seedProductionContent({ authorPhone: AUTHOR_PHONE, apply: true });

    const second = await seedProductionContent({ authorPhone: AUTHOR_PHONE, apply: true });
    const [row] = await db.select({ value: count() }).from(posts);

    expect(second).toMatchObject({ mode: "applied", existing: 5, inserted: 0, wouldInsert: 0 });
    expect(row?.value).toBe(5);
  });

  it("با slug موجود و محتوای متفاوت، پیش از درج همه‌چیز متوقف می‌شود", async () => {
    const dependency = await seedDependencies();
    const article = PRODUCTION_ARTICLES[0]!;

    await db.insert(posts).values({
      slug: article.slug,
      title: "عنوان موجود و متفاوت",
      excerpt: article.excerpt,
      content: article.content,
      authorId: dependency.authorId,
      instrumentId: dependency.instrumentId,
      status: "PUBLISHED",
      publishedAt: new Date(),
    });

    await expect(
      seedProductionContent({ authorPhone: AUTHOR_PHONE, apply: true }),
    ).rejects.toThrow(/تعارض slug/);

    const rows = await db.select({ title: posts.title }).from(posts);
    expect(rows).toEqual([{ title: "عنوان موجود و متفاوت" }]);
  });

  it("کاربر را ایجاد نمی‌کند و نویسندهٔ غیرادمین را رد می‌کند", async () => {
    await db.insert(users).values({
      phone: AUTHOR_PHONE,
      fullName: "نویسنده",
      isAdmin: false,
      status: "ACTIVE",
    });
    await db.insert(instruments).values({
      slug: "classical-guitar",
      nameFa: "گیتار کلاسیک",
      isActive: true,
    });

    await expect(
      seedProductionContent({ authorPhone: AUTHOR_PHONE, apply: true }),
    ).rejects.toThrow(/فعال و دارای دسترسی ادمین/);

    const [row] = await db.select({ value: count() }).from(posts);
    expect(row?.value).toBe(0);
  });

  it("ساز مفقود یا غیرفعال را ایجاد یا فعال نمی‌کند", async () => {
    const [author] = await db
      .insert(users)
      .values({
        phone: AUTHOR_PHONE,
        fullName: "تحریریهٔ پلتفرم",
        isAdmin: true,
        status: "ACTIVE",
      })
      .returning({ id: users.id });

    await expect(
      seedProductionContent({ authorPhone: AUTHOR_PHONE, apply: true }),
    ).rejects.toThrow(/پیدا نشد/);

    await db.insert(instruments).values({
      slug: "classical-guitar",
      nameFa: "گیتار کلاسیک",
      isActive: false,
    });

    await expect(
      seedProductionContent({ authorPhone: AUTHOR_PHONE, apply: true }),
    ).rejects.toThrow(/غیرفعال/);

    const [storedAuthor] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, author!.id));
    const [postCount] = await db.select({ value: count() }).from(posts);

    expect(storedAuthor?.id).toBe(author!.id);
    expect(postCount?.value).toBe(0);
  });
});
