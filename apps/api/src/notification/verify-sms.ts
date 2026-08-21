/**
 * راستی‌آزمایی پنل پیامک، با یک ارسال **واقعی** به شماره‌ی خودت.
 *
 *   pnpm verify:sms 09123456789          فقط کد ورود (verify/lookup)
 *   pnpm verify:sms 09123456789 --text   کد ورود و پیام آزاد (sms/send)
 *
 * چرا این اسکریپت وجود دارد: تا وقتی یک پیامک واقعی نرفته، سه چیز
 * ثابت نشده‌اند و هیچ‌کدام با تست یا تایپ‌چک گرفته نمی‌شوند —
 *
 *   ۱. **نام الگو.** `SMS_OTP_TEMPLATE` باید دقیقاً نام الگوی تأییدشده
 *      در پنل باشد. اشتباهش خطای ۴۲۴ است.
 *   ۲. **خط خدماتی.** یادآوری‌ها از `sms/send` می‌روند و بدون خط
 *      تأییدشده خطای ۴۲۶ می‌گیرند، در حالی که کد ورود سالم کار می‌کند.
 *      یعنی نیمی از سیستم بی‌صدا خراب است و تا اولین یادآوری دیده
 *      نمی‌شود. برای همین `--text` جداست.
 *   ۳. **اعتبار حساب.** ۴۱۸ یعنی هیچ پیامکی نمی‌رود و هیچ ربطی به کد
 *      ندارد.
 *
 * از همان `KavenegarSmsSender` مسیر تولید استفاده می‌کند، نه یک کپی
 * موازی — اسکریپتی که خودش درخواست را بسازد می‌تواند سبز باشد در حالی
 * که برنامه قرمز است. به همین دلیل هم `createSmsSender()` صدا زده
 * می‌شود و اگر کلید نباشد، اسکریپت می‌ایستد به‌جای اینکه با آداپتور
 * کنسول سبز شود.
 *
 * ⚠️ این اسکریپت اعتبار واقعی مصرف می‌کند و به شماره‌ی واقعی پیامک
 * می‌فرستد.
 */

import { createInterface } from "node:readline/promises";

import { normalizePhone, toLocalPhone } from "@music/shared";

import { ConsoleSmsSender, createSmsSender } from "./sms.port.js";

/** کد نمونه — شش‌رقمی، هم‌شکل کد واقعی ورود تا الگو همان‌طور پر شود. */
const PROBE_CODE = "123456";

const PROBE_TEXT =
  "این یک پیام آزمایشی از پلتفرم کلاس آنلاین موسیقی است. اگر آن را دریافت کردید، خط خدماتی درست کار می‌کند.";

async function ask(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return (await rl.question(question)).trim();
  } finally {
    rl.close();
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const withText = args.includes("--text");
  const rawPhone = args.find((arg) => !arg.startsWith("--"));

  if (!rawPhone) {
    console.error("شماره‌ی گیرنده را بده:\n  pnpm verify:sms 09123456789 [--text]");
    process.exit(1);
  }

  const phone = normalizePhone(rawPhone);

  if (!phone) {
    console.error(`«${rawPhone}» شماره‌ی موبایل معتبر ایران نیست.`);
    process.exit(1);
  }

  const sender = createSmsSender();

  /**
   * آداپتور کنسول یعنی `SMS_API_KEY` ست نیست و بیرونِ تولید، سکوت
   * می‌کند. اسکریپت با آن سبز می‌شود بی‌آنکه چیزی فرستاده باشد —
   * بدترین نتیجه‌ی ممکن برای اسکریپتی که کارش اثباتِ ارسال است.
   */
  if (sender instanceof ConsoleSmsSender) {
    console.error(
      "SMS_API_KEY تعریف نشده است. این اسکریپت با آداپتور کنسول معنایی ندارد:\n" +
        "کد را در همین ترمینال چاپ می‌کند و هیچ پیامکی نمی‌رود.",
    );
    process.exit(1);
  }

  console.log("");
  console.log(`  گیرنده:      ${toLocalPhone(phone)}`);
  console.log(`  الگوی لوکاپ: ${process.env.SMS_OTP_TEMPLATE ?? "verify  (پیش‌فرض)"}`);
  console.log(`  خط فرستنده:  ${process.env.SMS_SENDER ?? "پیش‌فرض حساب"}`);
  console.log(`  پیام آزاد:   ${withText ? "بله" : "نه  (با --text)"}`);
  console.log("");
  console.log("  ⚠️  پیامک واقعی و اعتبار واقعی.");
  console.log("");

  const answer = await ask("ادامه؟ (yes) ");
  if (answer !== "yes") {
    console.log("لغو شد.");
    return;
  }

  console.log("\n→ کد ورود (verify/lookup)");

  try {
    await sender.sendOtp(phone, PROBE_CODE);
    console.log(`✓ پذیرفته شد. باید کد «${PROBE_CODE}» برسد.`);
  } catch (error) {
    console.log(`✗ ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }

  if (withText) {
    console.log("\n→ پیام آزاد (sms/send)");

    try {
      await sender.sendText(phone, PROBE_TEXT);
      console.log("✓ پذیرفته شد.");
    } catch (error) {
      console.log(`✗ ${error instanceof Error ? error.message : String(error)}`);
      process.exitCode = 1;
    }
  }

  /**
   * «پذیرفته شد» یعنی کاوه‌نگار وضعیت ۲۰۰ داد، نه اینکه پیامک رسید.
   * `entries[].status` مسیر تحویل را جدا گزارش می‌کند و ما آن را
   * نمی‌خوانیم — تنها راه تشخیص، خودِ گوشی است.
   */
  console.log(
    "\n«پذیرفته شد» یعنی کاوه‌نگار درخواست را قبول کرد. تحویل واقعی را\n" +
      "روی گوشی ببین؛ نرسیدن با وجود پذیرش یعنی مشکل از سمت اپراتور یا\n" +
      "فیلترینگ متن است، نه از پیکربندی.",
  );
}

await main();
