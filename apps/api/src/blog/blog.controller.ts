import { Controller, Get, Injectable, Param, Query } from "@nestjs/common";
import { z } from "zod";

import { Public } from "../auth/auth.guard.js";
import { slugSchema } from "../common/schemas.js";
import { zodPipe } from "../common/validation.pipe.js";
import {
  getPublishedPost,
  listPublishedPosts,
  publishedSlugs,
  relatedPosts,
  type PostDetail,
  type PostSummary,
} from "./blog.service.js";

@Injectable()
export class BlogProvider {
  readonly list = listPublishedPosts;
  readonly get = getPublishedPost;
  readonly related = relatedPosts;
  readonly slugs = publishedSlugs;
}

/**
 * اسلاگ فارسی مجاز است — سند معماری (بخش ۷) صریحاً می‌خواهدش.
 *
 * `slugSchema` مشترک فقط حروف لاتین می‌پذیرد و برای `classical-guitar`
 * ساخته شده. اینجا نمی‌شود از آن استفاده کرد: «آموزش-گیتار» باید کار
 * کند، و کاراکترهای خطرناک مسیر (`/`، `.`، `%`، فاصله) جدا رد می‌شوند.
 *
 * باید با هم‌تایش در `admin.controller.ts` یکی بماند: آنجا نوشته ساخته
 * می‌شود و اینجا خوانده. سخت‌گیرتر بودنِ این یکی یعنی نوشته‌ای ساخته
 * شود که مسیر عمومی‌اش هرگز پیدایش نکند.
 */
const postSlugSchema = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .regex(/^[^/\\.\s%]+$/u, "نشانی نوشته نامعتبر است");

const listQuerySchema = z.object({
  instrument: slugSchema.optional(),
  limit: z
    .string()
    .regex(/^\d{1,4}$/)
    .transform(Number)
    .optional(),
  offset: z
    .string()
    .regex(/^\d{1,9}$/)
    .transform(Number)
    .optional(),
});

/**
 * بلاگ — خواندنِ عمومی.
 *
 * همه‌ی مسیرها `@Public()` هستند چون گارد احراز هویت سراسری است و این
 * صفحات باید هم برای گوگل و هم در زمان بیلد Next بدون توکن خوانده شوند.
 *
 * ⚠️ هیچ‌کدام پیش‌نویس نمی‌دهند. شرط `PUBLISHED` در خودِ سرویس است، نه
 * اینجا: اگر اینجا بود، اولین اندپوینت تازه‌ای که کسی اضافه کند می‌تواند
 * فراموشش کند و نوشته‌ی منتشرنشده را عمومی کند.
 */
@Controller("posts")
export class BlogController {
  constructor(private readonly blog: BlogProvider) {}

  @Public()
  @Get()
  async list(
    @Query(zodPipe(listQuerySchema)) query: z.infer<typeof listQuerySchema>,
  ): Promise<{ posts: PostSummary[]; total: number; limit: number; offset: number }> {
    const page = await this.blog.list({
      instrumentSlug: query.instrument,
      limit: query.limit,
      offset: query.offset,
    });

    return {
      posts: page.rows,
      total: page.total,
      limit: page.limit,
      offset: page.offset,
    };
  }

  /**
   * فقط اسلاگ‌ها، برای `sitemap.xml` و `generateStaticParams`.
   *
   * جدا از فهرست است چون آن‌ها کل متن نوشته‌ها را لازم ندارند و
   * صفحه‌بندی‌شان هم به درد نمی‌خورد — نقشه‌ی سایت باید **همه** را
   * بشناسد.
   */
  @Public()
  @Get("slugs")
  async slugs(): Promise<{ slugs: Array<{ slug: string; updatedAt: string }> }> {
    return { slugs: await this.blog.slugs() };
  }

  @Public()
  @Get(":slug")
  async getOne(
    @Param("slug", zodPipe(postSlugSchema)) slug: string,
  ): Promise<{ post: PostDetail | null; related: PostSummary[] }> {
    const post = await this.blog.get(slug);

    // نوشته‌ی ناموجود ۴۰۴ نمی‌گیرد بلکه `null` می‌دهد: صدازننده صفحه‌ی
    // Next است و باید بتواند خودش `notFound()` بزند، نه اینکه بیلد با
    // خطای درخواست بشکند
    return {
      post,
      related: post ? await this.blog.related(slug) : [],
    };
  }
}
