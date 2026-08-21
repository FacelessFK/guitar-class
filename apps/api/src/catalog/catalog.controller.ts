import { Controller, Get, Injectable, NotFoundException, Param, Query } from "@nestjs/common";
import { and, asc, eq, inArray, sql } from "drizzle-orm";

import { db } from "../db/client.js";
import {
  bookings,
  instruments,
  offerings,
  teacherProfiles,
  teacherReviews,
  users,
} from "../db/schema/index.js";
import { zodPipe } from "../common/validation.pipe.js";
import { slugSchema } from "../common/schemas.js";
import { Public } from "../auth/auth.guard.js";

/**
 * کاتالوگ عمومی — سازها، استادها و سرویس‌هایشان.
 *
 * این اندپوینت‌ها احراز هویت نمی‌خواهند و همان داده‌ای را می‌دهند که
 * صفحات سئوی Next.js در زمان بیلد مصرف می‌کنند.
 */
@Injectable()
export class CatalogService {
  /** فقط سازهای فعال، به ترتیبی که ادمین تعیین کرده. */
  async listInstruments() {
    return db
      .select({
        id: instruments.id,
        slug: instruments.slug,
        nameFa: instruments.nameFa,
        descriptionFa: instruments.descriptionFa,
        iconUrl: instruments.iconUrl,
      })
      .from(instruments)
      .where(eq(instruments.isActive, true))
      .orderBy(asc(instruments.sortOrder), asc(instruments.nameFa));
  }

  /**
   * استادهای تأییدشده، در صورت نیاز محدود به یک ساز.
   *
   * فقط استاد `APPROVED` برگردانده می‌شود — استاد در انتظار تأیید نباید
   * در فهرست عمومی دیده شود.
   */
  async listTeachers(instrumentSlug?: string) {
    const rows = await db
      .select({
        profileId: teacherProfiles.id,
        slug: teacherProfiles.slug,
        headline: teacherProfiles.headline,
        bio: teacherProfiles.bio,
        introVideoUrl: teacherProfiles.introVideoUrl,
        yearsExperience: teacherProfiles.yearsExperience,
        fullName: users.fullName,
        avatarUrl: users.avatarUrl,
        offeringId: offerings.id,
        price: offerings.price,
        durationMinutes: offerings.durationMinutes,
        instrumentSlug: instruments.slug,
        instrumentName: instruments.nameFa,
      })
      .from(teacherProfiles)
      .innerJoin(users, eq(teacherProfiles.userId, users.id))
      .innerJoin(offerings, eq(offerings.teacherId, teacherProfiles.id))
      .innerJoin(instruments, eq(offerings.instrumentId, instruments.id))
      .where(
        and(
          eq(teacherProfiles.status, "APPROVED"),
          eq(offerings.isActive, true),
          instrumentSlug ? eq(instruments.slug, instrumentSlug) : undefined,
        ),
      )
      .orderBy(asc(teacherProfiles.slug));

    // چند سرویس به ازای هر استاد می‌آید؛ در یک کارت جمعشان می‌کنیم
    const byTeacher = new Map<string, ReturnType<typeof buildTeacherCard>>();
    for (const row of rows) {
      const existing = byTeacher.get(row.profileId);
      const offering = {
        id: row.offeringId,
        price: row.price.toString(),
        durationMinutes: row.durationMinutes,
        instrumentSlug: row.instrumentSlug,
        instrumentName: row.instrumentName,
      };

      if (existing) {
        existing.offerings.push(offering);
      } else {
        byTeacher.set(row.profileId, buildTeacherCard(row, offering));
      }
    }

    const cards = [...byTeacher.values()];
    await this.attachStats(cards);
    return cards;
  }

  /**
   * میانگینِ امتیاز و شمارِ کلاسِ برگزارشده را روی کارت‌ها می‌نشاند.
   *
   * جدا از کوئریِ اصلی و نه `LEFT JOIN`: کوئریِ استادها به‌ازای هر
   * سرویس یک سطر می‌دهد (فَن‌اوت)، و پیوستنِ تجمیع به آن، امتیاز را در
   * تعداد سرویس‌ها ضرب می‌کرد. دو تجمیعِ مستقل که با شناسه‌ی پروفایل به
   * کارت وصل می‌شوند، این دام را ندارند.
   *
   * دامنه‌اش به همان پروفایل‌های نتیجه محدود است؛ روی کاتالوگی که با ساز
   * فیلتر شده، کلِ جدولِ نظر و رزرو خوانده نمی‌شود.
   */
  private async attachStats(cards: ReturnType<typeof buildTeacherCard>[]): Promise<void> {
    if (cards.length === 0) return;
    const profileIds = cards.map((card) => card.profileId);

    const ratingRows = await db
      .select({
        profileId: teacherReviews.teacherProfileId,
        average: sql<number>`avg(${teacherReviews.rating})::float`,
        count: sql<number>`count(*)::int`,
      })
      .from(teacherReviews)
      .where(inArray(teacherReviews.teacherProfileId, profileIds))
      .groupBy(teacherReviews.teacherProfileId);
    const ratingByProfile = new Map(ratingRows.map((row) => [row.profileId, row]));

    /**
     * شمارِ کلاس از `bookings` می‌آید که `teacher_id`اش `users.id` است،
     * پس به `teacher_profiles` روی `user_id` پیوند می‌خورد تا با شناسه‌ی
     * پروفایلِ کارت بخواند. فقط `COMPLETED` — «کلاسِ برگزارشده» یعنی
     * جلسه‌ای که واقعاً تمام شده، نه رزروِ باز یا لغوشده.
     */
    const classRows = await db
      .select({
        profileId: teacherProfiles.id,
        taught: sql<number>`count(*)::int`,
      })
      .from(bookings)
      .innerJoin(teacherProfiles, eq(teacherProfiles.userId, bookings.teacherId))
      .where(
        and(
          eq(bookings.status, "COMPLETED"),
          inArray(teacherProfiles.id, profileIds),
        ),
      )
      .groupBy(teacherProfiles.id);
    const taughtByProfile = new Map(classRows.map((row) => [row.profileId, row.taught]));

    for (const card of cards) {
      const rating = ratingByProfile.get(card.profileId);
      // میانگین به یک رقم اعشار گرد می‌شود؛ همان چیزی که «۴.۹» را می‌سازد
      card.rating = rating
        ? { average: Math.round(rating.average * 10) / 10, count: rating.count }
        : { average: null, count: 0 };
      card.classesTaught = taughtByProfile.get(card.profileId) ?? 0;
    }
  }

  async getTeacher(slug: string) {
    const teachers = await this.listTeachers();
    return teachers.find((teacher) => teacher.slug === slug) ?? null;
  }
}

function buildTeacherCard(
  row: {
    profileId: string;
    slug: string;
    headline: string;
    bio: string | null;
    introVideoUrl: string | null;
    yearsExperience: number;
    fullName: string;
    avatarUrl: string | null;
  },
  offering: {
    id: string;
    price: string;
    durationMinutes: number;
    instrumentSlug: string;
    instrumentName: string;
  },
) {
  return {
    profileId: row.profileId,
    slug: row.slug,
    fullName: row.fullName,
    avatarUrl: row.avatarUrl,
    headline: row.headline,
    bio: row.bio,
    introVideoUrl: row.introVideoUrl,
    yearsExperience: row.yearsExperience,
    offerings: [offering],
    /**
     * مقدارِ پیش‌فرض؛ `attachStats` بعداً روی همین می‌نشیند. جدا نوشتنش
     * اینجا لازم است تا تایپِ استنتاج‌شده‌ی کارت این فیلدها را داشته باشد.
     */
    rating: { average: null as number | null, count: 0 },
    classesTaught: 0,
  };
}

/** کاتالوگ عمومی است — صفحات سئوی Next.js بدون ورود مصرفش می‌کنند. */
@Public()
@Controller()
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get("instruments")
  async listInstruments() {
    return { instruments: await this.catalog.listInstruments() };
  }

  @Get("teachers")
  async listTeachers(
    @Query("instrument", zodPipe(slugSchema.optional())) instrument?: string,
  ) {
    return { teachers: await this.catalog.listTeachers(instrument) };
  }

  @Get("teachers/:slug")
  async getTeacher(@Param("slug", zodPipe(slugSchema)) slug: string) {
    const teacher = await this.catalog.getTeacher(slug);
    if (!teacher) {
      throw new NotFoundException({
        code: "TEACHER_NOT_FOUND",
        message: "استاد مورد نظر پیدا نشد.",
      });
    }
    return teacher;
  }
}
