import { Controller, Get, Injectable, NotFoundException, Param, Query } from "@nestjs/common";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "../db/client.js";
import {
  instruments,
  offerings,
  teacherProfiles,
  users,
} from "../db/schema/index.js";
import { zodPipe } from "../common/validation.pipe.js";

const slugSchema = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[a-z0-9-]+$/, "شناسه‌ی نشانی نامعتبر است");

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

    return [...byTeacher.values()];
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
  };
}

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
