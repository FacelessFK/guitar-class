import { eq } from "drizzle-orm";
import { normalizePhone, toLocalPhone } from "@music/shared";

import { db, sqlClient } from "./client.js";
import { users } from "./schema/index.js";

/**
 * ادمین کردن یک کاربر واقعی — `pnpm db:admin <شماره>`.
 *
 * جایگزین ادمینِ seed است. آن یکی شماره‌اش در مخزن نوشته بود و در هر
 * محیطی که seed اجرا می‌شد وجود داشت؛ این یکی شماره را از خط فرمان
 * می‌گیرد، پس هیچ حساب ادمینی از پیش و بدون تصمیم کسی ساخته نمی‌شود.
 *
 * **کاربر باید از قبل وجود داشته باشد.** ساخته نمی‌شود، و این عمدی
 * است: حساب با ورود OTP ساخته می‌شود و نام واقعی‌اش همان‌جا گرفته
 * می‌شود. اگر این اسکریپت کاربر می‌ساخت، یک شماره‌ی اشتباهِ تایپی به
 * جای «کاربری پیدا نشد» یک حساب ادمینِ خالی می‌ساخت که هیچ‌کس صاحبش
 * نیست و کسی هم متوجه نمی‌شود.
 *
 * در تولید هم اجرا می‌شود — برخلاف `db:seed` — چون دقیقاً همان‌جا لازم
 * است. کاری که می‌کند صریح، تک‌به‌تک و قابل بازگشت است.
 */

function usage(): never {
  console.error(
    "استفاده: pnpm db:admin <شماره‌ی موبایل>\n" +
      "  مثال: pnpm db:admin 09121234567\n\n" +
      "کاربر باید از قبل با ورود به پلتفرم ساخته شده باشد.\n" +
      "برای گرفتن دسترسی: pnpm db:admin --revoke <شماره>",
  );
  process.exit(1);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const revoke = args.includes("--revoke");
  const rawPhone = args.find((arg) => !arg.startsWith("--"));

  if (!rawPhone) usage();

  const phone = normalizePhone(rawPhone);

  if (!phone) {
    console.error(`شماره‌ی «${rawPhone}» معتبر نیست.`);
    process.exit(1);
  }

  const [updated] = await db
    .update(users)
    .set({ isAdmin: !revoke, updatedAt: new Date() })
    .where(eq(users.phone, phone))
    .returning({ id: users.id, fullName: users.fullName, isAdmin: users.isAdmin });

  if (!updated) {
    console.error(
      `کاربری با شماره‌ی ${toLocalPhone(phone)} پیدا نشد.\n` +
        "اول با همین شماره در پلتفرم وارد شوید تا حساب ساخته شود، بعد این دستور را دوباره اجرا کنید.",
    );
    await sqlClient.end();
    process.exit(1);
  }

  console.log(
    updated.isAdmin
      ? `«${updated.fullName}» (${toLocalPhone(phone)}) حالا ادمین است.`
      : `دسترسی ادمین از «${updated.fullName}» (${toLocalPhone(phone)}) گرفته شد.`,
  );

  await sqlClient.end();
}

await main();
