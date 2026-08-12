import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import type { App } from "supertest/types.js";

import { AppModule } from "../app.module.js";
import { AuthExceptionFilter } from "../common/auth-exception.filter.js";
import { DomainExceptionFilter } from "../common/domain-exception.filter.js";
import { BigIntSerializationInterceptor } from "../common/serialization.interceptor.js";
import { db } from "../db/client.js";
import { users } from "../db/schema/index.js";
import { InMemoryObjectStorage, setObjectStorage } from "../media/storage.port.js";
import {
  accessTokenFor,
  closeDatabase,
  resetDatabase,
  resetRedis,
  seedFixture,
  type Fixture,
} from "../test/fixtures.js";

/**
 * بلاگ.
 *
 * مهم‌ترین چیزی که اینجا سنجیده می‌شود مرزِ پیش‌نویس است: نوشته‌ای که
 * منتشر نشده نباید از هیچ راهی — نه فهرست، نه اسلاگ مستقیم، نه
 * `slugs` — به بیرون درز کند. بقیه‌ی رفتارها قابل اصلاح‌اند؛ منتشر شدنِ
 * ناخواسته‌ی یک پیش‌نویس، بلافاصله در گوگل ایندکس می‌شود.
 */

let app: INestApplication;
let server: App;
let fixture: Fixture;
let adminToken: string;
let studentToken: string;

const storage = new InMemoryObjectStorage("http://localhost:4000/api");

beforeAll(async () => {
  setObjectStorage(storage);

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

  app = moduleRef.createNestApplication();
  app.setGlobalPrefix("api");
  app.useGlobalFilters(new AuthExceptionFilter(), new DomainExceptionFilter());
  app.useGlobalInterceptors(new BigIntSerializationInterceptor());
  await app.init();

  server = app.getHttpServer() as App;
});

beforeEach(async () => {
  await resetDatabase();
  await resetRedis();
  fixture = await seedFixture();

  const [admin] = await db
    .insert(users)
    .values({ phone: "+989120000009", fullName: "مدیر", isAdmin: true })
    .returning({ id: users.id });

  [adminToken, studentToken] = await Promise.all([
    accessTokenFor(admin!.id, true),
    accessTokenFor(fixture.studentId),
  ]);
});

afterAll(async () => {
  await app.close();
  await closeDatabase();
});

interface PostBody {
  slug?: string;
  title?: string;
  excerpt?: string;
  content?: string;
  status?: "DRAFT" | "PUBLISHED";
  instrumentId?: string | null;
  coverObjectKey?: string | null;
}

async function createPost(body: PostBody = {}) {
  const response = await request(server)
    .post("/api/admin/posts")
    .set("authorization", `Bearer ${adminToken}`)
    .send({
      slug: "آموزش-گیتار",
      title: "چطور گیتار کلاسیک را از صفر شروع کنیم",
      excerpt: "راهنمای شروع، از انتخاب ساز تا اولین تمرین.",
      content: "## سرفصل\n\nمتن نوشته.",
      ...body,
    })
    .expect(201);

  return response.body as { id: string; slug: string; status: string };
}

async function uploadCover(): Promise<string> {
  const ticket = await request(server)
    .post("/api/media/upload-url")
    .set("authorization", `Bearer ${adminToken}`)
    .send({
      purpose: "POST_COVER",
      fileName: "cover.jpg",
      contentType: "image/jpeg",
      sizeBytes: 4096,
    })
    .expect(201);

  const objectKey = ticket.body.objectKey as string;
  storage.put(objectKey, Buffer.from("jpeg"), "image/jpeg");

  return objectKey;
}

describe("مرز پیش‌نویس", () => {
  it("پیش‌نویس در فهرست عمومی نمی‌آید", async () => {
    await createPost({ slug: "پیش-نویس", status: "DRAFT" });
    await createPost({ slug: "منتشرشده", status: "PUBLISHED" });

    const response = await request(server).get("/api/posts").expect(200);

    expect(response.body.posts).toHaveLength(1);
    expect(response.body.posts[0].slug).toBe("منتشرشده");
    expect(response.body.total).toBe(1);
  });

  /**
   * اسلاگ حدس‌زدنی است — عنوان نوشته را می‌شود از هر جایی فهمید. اگر
   * مسیر مستقیم پیش‌نویس را می‌داد، «منتشر نشده» هیچ معنایی نداشت.
   */
  it("پیش‌نویس با اسلاگ مستقیم هم بیرون نمی‌آید", async () => {
    await createPost({ slug: "پیش-نویس", status: "DRAFT" });

    const response = await request(server).get("/api/posts/پیش-نویس").expect(200);

    expect(response.body.post).toBeNull();
  });

  it("پیش‌نویس در نقشه‌ی سایت نمی‌آید", async () => {
    await createPost({ slug: "پیش-نویس", status: "DRAFT" });
    await createPost({ slug: "منتشرشده", status: "PUBLISHED" });

    const response = await request(server).get("/api/posts/slugs").expect(200);

    expect(response.body.slugs.map((row: { slug: string }) => row.slug)).toEqual([
      "منتشرشده",
    ]);
  });

  it("ادمین پیش‌نویس را می‌بیند", async () => {
    await createPost({ slug: "پیش-نویس", status: "DRAFT" });

    const response = await request(server)
      .get("/api/admin/posts")
      .set("authorization", `Bearer ${adminToken}`)
      .expect(200);

    expect(response.body.posts).toHaveLength(1);
    expect(response.body.posts[0].status).toBe("DRAFT");
  });
});

describe("انتشار", () => {
  it("پیش‌نویس تاریخ انتشار ندارد و با انتشار می‌گیرد", async () => {
    const draft = await createPost({ status: "DRAFT" });

    const before = await request(server)
      .get(`/api/admin/posts/${draft.id}`)
      .set("authorization", `Bearer ${adminToken}`)
      .expect(200);

    expect(before.body.publishedAt).toBeNull();

    const published = await request(server)
      .patch(`/api/admin/posts/${draft.id}`)
      .set("authorization", `Bearer ${adminToken}`)
      .send({ status: "PUBLISHED" })
      .expect(200);

    expect(published.body.publishedAt).not.toBeNull();
  });

  /**
   * مهم‌ترین تست این بخش.
   *
   * اگر ویرایش، تاریخ انتشار را جابه‌جا کند، اصلاح یک غلط املایی
   * نوشته‌ی دو سال پیش را در نتایج گوگل «امروز» نشان می‌دهد — و آن
   * تاریخ همان چیزی است که کاربر در نتیجه‌ی جست‌وجو می‌بیند.
   */
  it("ویرایش نوشته‌ی منتشرشده تاریخ انتشارش را عوض نمی‌کند", async () => {
    const post = await createPost({ status: "PUBLISHED" });

    const first = await request(server)
      .get(`/api/admin/posts/${post.id}`)
      .set("authorization", `Bearer ${adminToken}`)
      .expect(200);

    const edited = await request(server)
      .patch(`/api/admin/posts/${post.id}`)
      .set("authorization", `Bearer ${adminToken}`)
      .send({ title: "عنوان اصلاح‌شده" })
      .expect(200);

    expect(edited.body.title).toBe("عنوان اصلاح‌شده");
    expect(edited.body.publishedAt).toBe(first.body.publishedAt);
  });

  /**
   * برگرداندن به پیش‌نویس هم تاریخ را پاک نمی‌کند: انتشار دوباره باید
   * همان تاریخ اول را داشته باشد، وگرنه نوشته‌ای که یک روز برداشته شده
   * در گوگل تازه‌متولد می‌شود.
   */
  it("برگرداندن به پیش‌نویس، تاریخ انتشار را پاک نمی‌کند", async () => {
    const post = await createPost({ status: "PUBLISHED" });

    const published = await request(server)
      .get(`/api/admin/posts/${post.id}`)
      .set("authorization", `Bearer ${adminToken}`)
      .expect(200);

    await request(server)
      .patch(`/api/admin/posts/${post.id}`)
      .set("authorization", `Bearer ${adminToken}`)
      .send({ status: "DRAFT" })
      .expect(200);

    const again = await request(server)
      .patch(`/api/admin/posts/${post.id}`)
      .set("authorization", `Bearer ${adminToken}`)
      .send({ status: "PUBLISHED" })
      .expect(200);

    expect(again.body.publishedAt).toBe(published.body.publishedAt);
  });
});

describe("اسلاگ", () => {
  it("اسلاگ فارسی کار می‌کند", async () => {
    await createPost({ slug: "آموزش-سنتور", status: "PUBLISHED" });

    const response = await request(server).get("/api/posts/آموزش-سنتور").expect(200);

    expect(response.body.post.slug).toBe("آموزش-سنتور");
  });

  /**
   * اسلاگ تکراری خطاست نه بازنویسی بی‌صدا: اسلاگ نشانی عمومی نوشته است
   * و عوض شدنش یعنی لینک‌های بیرونی و رتبه‌ی گوگل به صفحه‌ی دیگری برسند.
   */
  it("اسلاگ تکراری ۴۰۹ می‌گیرد", async () => {
    await createPost({ slug: "تکراری" });

    const response = await request(server)
      .post("/api/admin/posts")
      .set("authorization", `Bearer ${adminToken}`)
      .send({
        slug: "تکراری",
        title: "نوشته‌ی دوم",
        excerpt: "خلاصه",
        content: "متن",
      })
      .expect(409);

    expect(response.body.code).toBe("POST_SLUG_TAKEN");
  });

  /**
   * `%` رد می‌شود و دلیلش ظریف است: فرانت اسلاگِ آمده از مسیر را پیش
   * از فرستادن به API کدگشایی می‌کند، چون Next آن را **کدشده** می‌دهد.
   * اسلاگی که خودش `%` داشته باشد آن کدگشایی را مبهم می‌کند.
   */
  it("اسلاگ با اسلش، نقطه، فاصله یا درصد رد می‌شود", async () => {
    for (const slug of ["a/b", "a.b", "a b", "a%b"]) {
      await request(server)
        .post("/api/admin/posts")
        .set("authorization", `Bearer ${adminToken}`)
        .send({ slug, title: "عنوان", excerpt: "خلاصه", content: "متن" })
        .expect(400);
    }
  });

  /**
   * اسلاگِ **کدشده** در مسیر باید همان نوشته را بدهد.
   *
   * این همان مسیری است که مرورگر واقعاً می‌فرستد — نشانی فارسی در
   * `Location` و در لینک، به شکل درصددار می‌رود. اگر فقط با شکل خام
   * سنجیده می‌شد، تنها چیزی که در تولید کار نمی‌کرد از تست‌ها رد
   * می‌شد.
   */
  it("اسلاگ فارسیِ درصدکدشده هم به همان نوشته می‌رسد", async () => {
    await createPost({ slug: "آموزش-سنتور", status: "PUBLISHED" });

    const response = await request(server)
      .get(`/api/posts/${encodeURIComponent("آموزش-سنتور")}`)
      .expect(200);

    expect(response.body.post.slug).toBe("آموزش-سنتور");
  });
});

describe("پیوند به ساز", () => {
  it("نوشته به ساز وصل می‌شود و فیلتر ساز کار می‌کند", async () => {
    await createPost({
      slug: "گیتار-یک",
      status: "PUBLISHED",
      instrumentId: fixture.instrumentId,
    });
    await createPost({ slug: "عمومی", status: "PUBLISHED" });

    const filtered = await request(server)
      .get("/api/posts")
      .query({ instrument: "classical-guitar" })
      .expect(200);

    expect(filtered.body.posts).toHaveLength(1);
    expect(filtered.body.posts[0]).toMatchObject({
      slug: "گیتار-یک",
      instrumentSlug: "classical-guitar",
      instrumentName: "گیتار کلاسیک",
    });
  });

  /**
   * نوشته‌های مرتبط، پیوند داخلی می‌سازند. بدون آن‌ها هر نوشته یک بن‌بست
   * است و بازدیدکننده‌ای که از گوگل آمده همان‌جا خارج می‌شود.
   */
  it("نوشته‌های هم‌ساز به‌عنوان مرتبط برمی‌گردند، خودش نه", async () => {
    await createPost({
      slug: "گیتار-یک",
      status: "PUBLISHED",
      instrumentId: fixture.instrumentId,
    });
    await createPost({
      slug: "گیتار-دو",
      status: "PUBLISHED",
      instrumentId: fixture.instrumentId,
    });

    const response = await request(server).get("/api/posts/گیتار-یک").expect(200);

    expect(response.body.related.map((row: { slug: string }) => row.slug)).toEqual([
      "گیتار-دو",
    ]);
  });

  it("پیش‌نویس به‌عنوان نوشته‌ی مرتبط نمی‌آید", async () => {
    await createPost({
      slug: "گیتار-یک",
      status: "PUBLISHED",
      instrumentId: fixture.instrumentId,
    });
    await createPost({
      slug: "گیتار-پیش‌نویس",
      status: "DRAFT",
      instrumentId: fixture.instrumentId,
    });

    const response = await request(server).get("/api/posts/گیتار-یک").expect(200);

    expect(response.body.related).toEqual([]);
  });
});

describe("تصویر شاخص", () => {
  it("نشانی از کلید بلیت ساخته می‌شود", async () => {
    const objectKey = await uploadCover();

    const post = await request(server)
      .post("/api/admin/posts")
      .set("authorization", `Bearer ${adminToken}`)
      .send({
        slug: "با-تصویر",
        title: "عنوان",
        excerpt: "خلاصه",
        content: "متن",
        coverObjectKey: objectKey,
      })
      .expect(201);

    expect(post.body.coverUrl).toContain(objectKey);
  });

  it("تصویر تازه، فایل قبلی را از باکت پاک می‌کند", async () => {
    const first = await uploadCover();
    const post = await createPost({ coverObjectKey: first });

    const second = await uploadCover();
    await request(server)
      .patch(`/api/admin/posts/${post.id}`)
      .set("authorization", `Bearer ${adminToken}`)
      .send({ coverObjectKey: second })
      .expect(200);

    expect(storage.get(first)).toBeNull();
    expect(storage.get(second)).not.toBeNull();
  });

  it("حذف نوشته، تصویرش را هم می‌برد", async () => {
    const objectKey = await uploadCover();
    const post = await createPost({ coverObjectKey: objectKey });

    await request(server)
      .delete(`/api/admin/posts/${post.id}`)
      .set("authorization", `Bearer ${adminToken}`)
      .expect(204);

    expect(storage.get(objectKey)).toBeNull();
    await request(server).get(`/api/posts/${post.slug}`).expect(200);
  });

  it("فایل غیرتصویری برای تصویر شاخص بلیت نمی‌گیرد", async () => {
    await request(server)
      .post("/api/media/upload-url")
      .set("authorization", `Bearer ${adminToken}`)
      .send({
        purpose: "POST_COVER",
        fileName: "clip.mp3",
        contentType: "audio/mpeg",
        sizeBytes: 4096,
      })
      .expect(415);
  });
});

describe("دسترسی", () => {
  it("خواندن عمومی بدون توکن کار می‌کند", async () => {
    await createPost({ status: "PUBLISHED" });

    await request(server).get("/api/posts").expect(200);
    await request(server).get("/api/posts/slugs").expect(200);
    await request(server).get("/api/posts/آموزش-گیتار").expect(200);
  });

  it("کاربر عادی نمی‌تواند بنویسد یا حذف کند", async () => {
    const post = await createPost();

    await request(server)
      .get("/api/admin/posts")
      .set("authorization", `Bearer ${studentToken}`)
      .expect(403);

    await request(server)
      .post("/api/admin/posts")
      .set("authorization", `Bearer ${studentToken}`)
      .send({ slug: "خودم", title: "عنوان", excerpt: "خلاصه", content: "متن" })
      .expect(403);

    await request(server)
      .delete(`/api/admin/posts/${post.id}`)
      .set("authorization", `Bearer ${studentToken}`)
      .expect(403);
  });

  it("نوشته‌ی ناموجود در پنل ۴۰۴ می‌گیرد", async () => {
    await request(server)
      .get("/api/admin/posts/00000000-0000-4000-8000-000000000000")
      .set("authorization", `Bearer ${adminToken}`)
      .expect(404);
  });
});
