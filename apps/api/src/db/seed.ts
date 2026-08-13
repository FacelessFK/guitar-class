import { eq, sql } from "drizzle-orm";

import { db, sqlClient } from "./client.js";
import { instruments, offerings, teacherProfiles, users } from "./schema/index.js";
import { INSTRUMENTS, seedInstruments } from "./seed-catalog.js";
import { assertNotProduction } from "../config/env.js";

/**
 * داده‌ی اولیه‌ی توسعه.
 *
 * وجودش برای فرانت‌اند ضروری است: صفحات عمومی در زمان بیلد ساخته
 * می‌شوند و بدون ساز و استاد، بیلد یک سایت خالی تولید می‌کند.
 *
 * **بارها قابل اجراست.** همه‌چیز روی `slug` یکتا `ON CONFLICT` می‌خورد،
 * پس اجرای دوباره نه چیزی را دوباره می‌سازد و نه ویرایش‌های دستی
 * بعدی را عقب می‌زند.
 *
 * ⚠️ **در تولید اجرا نمی‌شود** و خودش جلویش را می‌گیرد. تا پیش از این
 * فقط یک هشدار در همین کامنت بود، و آنچه می‌ساخت — یک ادمین با
 * شماره‌ی معلوم و دو استاد ساختگی — دقیقاً همان چیزی است که نباید در
 * تولید باشد. سه ورودی جدا شد:
 *
 *   • `pnpm db:seed`          — همین فایل، کامل، فقط توسعه
 *   • `pnpm db:seed:catalog`  — فقط سازها، بدون هیچ کاربری، امن در تولید
 *   • `pnpm db:admin <شماره>` — ادمین واقعی، صریح و تک‌به‌تک
 */

/**
 * استادهای نمونه.
 *
 * ⚠️ این‌ها **داده‌ی جای‌گیرند** تا صفحات قابل ساخت و دیدن باشند. پیش از
 * انتشار عمومی باید حذف یا با استاد واقعی جایگزین شوند؛ استاد ساختگی در
 * صفحه‌ای که ایندکس می‌شود، هم بی‌فایده است و هم گمراه‌کننده.
 *
 * شماره‌ها از بازه‌ی آزمایشی انتخاب شده‌اند تا با شماره‌ی واقعی کسی
 * تداخل نکنند.
 */
interface TeacherSeed {
  phone: string;
  fullName: string;
  slug: string;
  headline: string;
  bio: string;
  yearsExperience: number;
  offerings: { instrumentSlug: string; priceRial: bigint; durationMinutes: number }[];
}

const TEACHERS: readonly TeacherSeed[] = [
  {
    phone: "+989000000001",
    fullName: "نمونه — استاد گیتار",
    slug: "sample-guitar-teacher",
    headline: "مدرس گیتار کلاسیک و پاپ",
    bio: "این یک پروفایل نمونه برای توسعه است و باید پیش از انتشار با اطلاعات استاد واقعی جایگزین شود.",
    yearsExperience: 8,
    offerings: [
      { instrumentSlug: "classical-guitar", priceRial: 3_000_000n, durationMinutes: 45 },
      { instrumentSlug: "pop-guitar", priceRial: 2_500_000n, durationMinutes: 45 },
    ],
  },
  {
    phone: "+989000000002",
    fullName: "نمونه — استاد سنتور",
    slug: "sample-santoor-teacher",
    headline: "مدرس سنتور و ردیف موسیقی ایرانی",
    bio: "این یک پروفایل نمونه برای توسعه است و باید پیش از انتشار با اطلاعات استاد واقعی جایگزین شود.",
    yearsExperience: 12,
    offerings: [
      { instrumentSlug: "santoor", priceRial: 3_500_000n, durationMinutes: 45 },
    ],
  },
];

async function seedTeachers(): Promise<void> {
  for (const teacher of TEACHERS) {
    const [user] = await db
      .insert(users)
      .values({ phone: teacher.phone, fullName: teacher.fullName })
      .onConflictDoUpdate({
        target: users.phone,
        // بدون یک `set`، درج تکراری هیچ سطری برنمی‌گرداند و id لازم را نداریم
        set: { fullName: sql`excluded.full_name` },
      })
      .returning({ id: users.id });

    if (!user) continue;

    const [profile] = await db
      .insert(teacherProfiles)
      .values({
        userId: user.id,
        slug: teacher.slug,
        headline: teacher.headline,
        bio: teacher.bio,
        yearsExperience: teacher.yearsExperience,
        // بدون APPROVED در هیچ صفحه‌ی عمومی دیده نمی‌شود
        status: "APPROVED",
      })
      .onConflictDoUpdate({
        target: teacherProfiles.slug,
        set: { headline: sql`excluded.headline` },
      })
      .returning({ id: teacherProfiles.id });

    if (!profile) continue;

    for (const offering of teacher.offerings) {
      const [instrument] = await db
        .select({ id: instruments.id })
        .from(instruments)
        .where(eq(instruments.slug, offering.instrumentSlug))
        .limit(1);

      if (!instrument) continue;

      await db
        .insert(offerings)
        .values({
          teacherId: profile.id,
          instrumentId: instrument.id,
          price: offering.priceRial,
          durationMinutes: offering.durationMinutes,
          levels: ["BEGINNER", "INTERMEDIATE"],
        })
        .onConflictDoNothing({
          target: [offerings.teacherId, offerings.instrumentId],
        });
    }
  }
}

/**
 * ادمین **توسعه**.
 *
 * شماره‌اش در مخزن نوشته است و ورود با OTP انجام می‌شود، پس این حساب
 * دقیقاً به اندازه‌ی کدِ ورود امن است — و همان چیزی بود که در تولید
 * پنل ادمین را برای هرکسی باز می‌کرد. حالا دو محافظ رویش است:
 * `assertNotProduction` در پایین این فایل، و پرچمِ صریحی که برگشتن کد
 * ورود در پاسخ را کنترل می‌کند (`config/env.ts`).
 *
 * ادمین تولید از `pnpm db:admin <شماره>` ساخته می‌شود — با شماره‌ی
 * واقعی، یکی‌یکی، و بدون اینکه در مخزن بنشیند.
 *
 * `is_admin` با `onConflictDoUpdate` دوباره روشن می‌شود ولی نام دست
 * نمی‌خورد: اگر کسی دستی خاموشش کرده باشد، اجرای دوباره‌ی seed باید
 * برش گرداند، وگرنه «چرا پنل باز نمی‌شود» به یک ساعت جست‌وجو تبدیل
 * می‌شود.
 */
const DEV_ADMIN_PHONE = "+989120000000";

async function seedDevAdmin(): Promise<void> {
  await db
    .insert(users)
    .values({ phone: DEV_ADMIN_PHONE, fullName: "مدیر پلتفرم", isAdmin: true })
    .onConflictDoUpdate({
      target: users.phone,
      set: { isAdmin: sql`true` },
    });
}

async function main(): Promise<void> {
  /**
   * پیش از **هر** نوشتنی.
   *
   * این اسکریپت به `DATABASE_URL` نگاه می‌کند و آن متغیر در سرور تولید
   * به دیتابیس تولید اشاره می‌کند. یک `pnpm db:seed` که از روی عادت
   * تایپ شود، تا پیش از این دو استاد ساختگی را در صفحه‌ی ایندکس‌شده و
   * یک ادمینِ با شماره‌ی عمومی را در تولید می‌نشاند.
   */
  assertNotProduction("db:seed");

  await seedInstruments();
  await seedTeachers();
  await seedDevAdmin();

  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(instruments);

  console.log(
    `داده‌ی اولیه‌ی توسعه نوشته شد: ${row?.count ?? INSTRUMENTS.length} ساز، ` +
      `${TEACHERS.length} استاد نمونه، ادمین توسعه ${DEV_ADMIN_PHONE}.`,
  );

  await sqlClient.end();
}

await main();
