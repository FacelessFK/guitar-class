import { eq, sql } from "drizzle-orm";

import { db, sqlClient } from "./client.js";
import { instruments, offerings, teacherProfiles, users } from "./schema/index.js";

/**
 * داده‌ی اولیه‌ی کاتالوگ.
 *
 * وجودش برای فرانت‌اند ضروری است: صفحات عمومی در زمان بیلد ساخته
 * می‌شوند و بدون ساز و استاد، بیلد یک سایت خالی تولید می‌کند.
 *
 * **بارها قابل اجراست.** همه‌چیز روی `slug` یکتا `ON CONFLICT` می‌خورد،
 * پس اجرای دوباره نه چیزی را دوباره می‌سازد و نه ویرایش‌های دستی
 * بعدی را عقب می‌زند — که مهم است، چون تا وقتی پنل ادمین نیست،
 * `db:studio` تنها راه ویرایش این داده‌هاست.
 *
 * ⚠️ اجرا روی دیتابیس تولید در نظر گرفته نشده. متن‌ها جای‌گیرند و باید
 * پیش از انتشار با محتوای واقعی جایگزین شوند — این متن‌ها دقیقاً همان
 * چیزی هستند که گوگل ایندکس می‌کند.
 */

interface InstrumentSeed {
  slug: string;
  nameFa: string;
  descriptionFa: string;
  sortOrder: number;
}

/**
 * توضیح هر ساز عمداً مفصل است.
 *
 * سند معماری این صفحات را موتور اصلی سئو می‌داند و صریح می‌گوید
 * «محتوای واقعی و مفصل، نه فقط لیست استاد». یک جمله‌ی کوتاه، صفحه‌ای
 * می‌سازد که گوگل آن را کم‌ارزش حساب می‌کند.
 */
const INSTRUMENTS: readonly InstrumentSeed[] = [
  {
    slug: "classical-guitar",
    nameFa: "گیتار کلاسیک",
    descriptionFa:
      "گیتار کلاسیک با سیم نایلونی نواخته می‌شود و پایه‌ی محکمی برای هر سبک دیگری از گیتار است. " +
      "در کلاس آنلاین گیتار کلاسیک، از نشستن و گرفتن درست ساز شروع می‌کنیم و به تکنیک دست راست، " +
      "خواندن نت و اجرای قطعه می‌رسیم. جلسه‌ها یک‌به‌یک و زنده برگزار می‌شوند، پس استاد همان لحظه " +
      "دست‌ها را می‌بیند و اصلاح می‌کند.",
    sortOrder: 1,
  },
  {
    slug: "pop-guitar",
    nameFa: "گیتار پاپ",
    descriptionFa:
      "گیتار پاپ راه سریع رسیدن به نواختن و همراهی آواز است. در کلاس آنلاین گیتار پاپ روی آکورد، " +
      "ریتم دست راست و همراهی ترانه کار می‌کنیم و از همان جلسه‌های اول یک قطعه‌ی کامل را می‌نوازید. " +
      "برای شروع، گیتار سیم فلزی یا نایلونی هر دو مناسب‌اند.",
    sortOrder: 2,
  },
  {
    slug: "piano",
    nameFa: "پیانو",
    descriptionFa:
      "پیانو سازی است که هم ملودی و هم هارمونی را با هم نشان می‌دهد و به همین دلیل درک موسیقی را " +
      "سریع‌تر می‌کند. کلاس آنلاین پیانو با شناخت کلاویه، وضعیت درست دست و خواندن نت شروع می‌شود. " +
      "برای شرکت در کلاس، پیانوی دیجیتال یا کیبورد با کلید استاندارد کافی است.",
    sortOrder: 3,
  },
  {
    slug: "santoor",
    nameFa: "سنتور",
    descriptionFa:
      "سنتور از سازهای اصلی موسیقی ایرانی است و صدای درخشانش آن را در ردیف بی‌جایگزین کرده. " +
      "در کلاس آنلاین سنتور، از شیوه‌ی گرفتن مضراب و کوک ساز شروع می‌کنیم و به ریزِ درست، " +
      "گوشه‌های ردیف و اجرای قطعه می‌رسیم. کوک ساز پیش از هر جلسه لازم است.",
    sortOrder: 4,
  },
  {
    slug: "tar",
    nameFa: "تار",
    descriptionFa:
      "تار ساز محوری موسیقی کلاسیک ایرانی است و ردیف بیشتر بر پایه‌ی آن آموزش داده می‌شود. " +
      "کلاس آنلاین تار با شناخت دسته، پرده‌بندی و شیوه‌ی مضراب‌زنی آغاز می‌شود و با ردیف ادامه " +
      "پیدا می‌کند. تمرین منظم روزانه، حتی کوتاه، بیشترین اثر را در این ساز دارد.",
    sortOrder: 5,
  },
  {
    slug: "violin",
    nameFa: "ویولن",
    descriptionFa:
      "ویولن هم در موسیقی کلاسیک غربی و هم در موسیقی ایرانی جایگاه مهمی دارد. کلاس آنلاین ویولن " +
      "با وضعیت درست ساز و آرشه، کوک گوش و تولید صدای تمیز شروع می‌شود — همان چیزهایی که اگر از " +
      "اول درست جا بیفتند، مسیر بعدی را کوتاه می‌کنند.",
    sortOrder: 6,
  },
  {
    slug: "tonbak",
    nameFa: "تنبک",
    descriptionFa:
      "تنبک ساز اصلی ریتم در موسیقی ایرانی است و یادگیری‌اش حس ریتم را در هر ساز دیگری تقویت می‌کند. " +
      "در کلاس آنلاین تنبک با تکنیک‌های پایه مثل تم، بک و ریز شروع می‌کنیم و به اجرای وزن‌های " +
      "رایج موسیقی ایرانی می‌رسیم.",
    sortOrder: 7,
  },
];

/**
 * سازها **به‌روزرسانی** می‌شوند، نه فقط درج.
 *
 * برخلاف پروفایل استاد که دستی ویرایش می‌شود، متن صفحه‌ی ساز را همین
 * فایل مالک است — همان متنی که گوگل ایندکس می‌کند. با
 * `onConflictDoNothing`، سازی که از قبل (مثلاً از باقی‌مانده‌ی تست‌ها)
 * وجود داشت برای همیشه بدون توضیح می‌ماند و مهم‌ترین صفحه‌ی سئو خالی
 * منتشر می‌شود. `isActive` عمداً به‌روز نمی‌شود تا سازی که دستی خاموش
 * شده، دوباره روشن نشود.
 */
async function seedInstruments(): Promise<void> {
  for (const instrument of INSTRUMENTS) {
    await db
      .insert(instruments)
      .values(instrument)
      .onConflictDoUpdate({
        target: instruments.slug,
        set: {
          nameFa: sql`excluded.name_fa`,
          descriptionFa: sql`excluded.description_fa`,
          sortOrder: sql`excluded.sort_order`,
        },
      });
  }
}

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

async function main(): Promise<void> {
  await seedInstruments();
  await seedTeachers();

  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(instruments);

  console.log(
    `داده‌ی اولیه نوشته شد: ${row?.count ?? 0} ساز، ${TEACHERS.length} استاد نمونه.`,
  );

  await sqlClient.end();
}

await main();
