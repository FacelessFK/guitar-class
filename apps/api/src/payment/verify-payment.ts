/**
 * راستی‌آزمایی واحد مبلغ درگاه، با یک تراکنش **واقعی** و کمترین مبلغ ممکن.
 *
 *   pnpm verify:payment
 *
 * چرا این اسکریپت وجود دارد: کد `-50` — «مبلغ تأیید با مبلغ پرداخت‌شده
 * یکی نیست» — فقط در مرحله‌ی **تأیید** ظاهر می‌شود، یعنی بعد از اینکه
 * پول از حساب کاربر رفته. اگر حساب پذیرندگی روی تومان تنظیم شده باشد و
 * ما ریال بفرستیم، **هر** پرداختی این کد را می‌گیرد و هیچ چیز دیگری در
 * سیستم نشانه‌ای نمی‌دهد. یعنی این تنها خرابی‌ای است که اولین باری که
 * دیده می‌شود، اولین فروش است.
 *
 * هیچ راهی برای دانستنش بدون پول واقعی نیست. کاری که این اسکریپت
 * می‌کند این است که «پول واقعی» را به هزار تومان و پنج دقیقه کاهش
 * می‌دهد، به‌جای اینکه اولین مشتری هزینه‌اش را بدهد.
 *
 * از همان `ZarinpalGateway` مسیر تولید استفاده می‌کند، نه یک کپی
 * موازی — اسکریپتی که خودش درخواست را بسازد می‌تواند سبز باشد در حالی
 * که برنامه قرمز است.
 *
 * ⚠️ **این اسکریپت پول واقعی جابه‌جا می‌کند** (مگر با `PAYMENT_SANDBOX`).
 * مبلغش را خودت پرداخت می‌کنی و بازگشتش از پنل زرین‌پال است.
 */

import { createInterface } from "node:readline/promises";

import { ZarinpalGateway, toGatewayAmount, type AmountUnit } from "./gateway.port.js";

/**
 * ۱۰۰۰ تومان = ۱۰٬۰۰۰ ریال.
 *
 * حداقل مبلغ قابل قبول زرین‌پال ۱۰۰۰ تومان است. عدد عمداً مضرب ۱۰ است
 * تا در هر دو واحد بدون گِرد شدن بیان شود.
 */
const PROBE_RIALS = 10_000n;

function unitFromEnv(): AmountUnit {
  return process.env.PAYMENT_AMOUNT_UNIT === "TOMAN" ? "TOMAN" : "RIAL";
}

async function ask(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return (await rl.question(question)).trim();
  } finally {
    rl.close();
  }
}

async function main(): Promise<void> {
  const merchantId = process.env.PAYMENT_MERCHANT_ID?.trim();
  const callbackUrl = process.env.PAYMENT_CALLBACK_URL?.trim();
  const sandbox = process.env.PAYMENT_SANDBOX === "true";
  const unit = unitFromEnv();

  if (!merchantId) {
    console.error(
      "PAYMENT_MERCHANT_ID تعریف نشده است. این اسکریپت با درگاه جعلی معنایی ندارد:\n" +
        "درگاه جعلی هر مبلغی را می‌پذیرد و دقیقاً همان چیزی را تأیید می‌کند که فرستادیم.",
    );
    process.exit(1);
  }

  if (!callbackUrl) {
    console.error("PAYMENT_CALLBACK_URL تعریف نشده است.");
    process.exit(1);
  }

  const gateway = new ZarinpalGateway(merchantId, sandbox, unit);
  const sent = toGatewayAmount(PROBE_RIALS, unit);

  console.log("");
  console.log(`  محیط:        ${sandbox ? "سندباکس" : "⚠️  واقعی — پول جابه‌جا می‌شود"}`);
  console.log(`  واحد فعلی:   ${unit}  (PAYMENT_AMOUNT_UNIT)`);
  console.log(`  مبلغ سفارش:  ${PROBE_RIALS} ریال`);
  console.log(`  آنچه می‌رود: ${sent} ${unit === "RIAL" ? "ریال" : "تومان"}`);
  console.log("");

  const answer = await ask("ادامه؟ (yes) ");
  if (answer !== "yes") {
    console.log("لغو شد.");
    return;
  }

  console.log("\n→ درخواست پرداخت");

  const requested = await gateway.request({
    orderId: `verify-${Date.now()}`,
    amount: PROBE_RIALS,
    description: "راستی‌آزمایی واحد مبلغ",
    callbackUrl,
  });

  console.log("\nاین آدرس را در مرورگر باز کن و پرداخت را انجام بده:\n");
  console.log(`  ${requested.redirectUrl}\n`);
  console.log(
    "بعد از پرداخت به آدرس بازگشت هدایت می‌شوی. لازم نیست آن صفحه کاری کند —\n" +
      "این اسکریپت خودش تأیید را می‌زند.\n",
  );

  await ask("پرداخت انجام شد؟ اینتر بزن تا تأیید کنم. ");

  console.log("\n→ تأیید سرور به سرور");

  try {
    const result = await gateway.verify({
      authority: requested.authority,
      amount: PROBE_RIALS,
    });

    if (result.status === "FAILED") {
      console.log(`\n✗ ناموفق: ${result.reason}`);
      console.log(verdictForFailure(result.reason, unit));
      process.exitCode = 1;
      return;
    }

    console.log(`\n✓ تأیید شد. شناسه‌ی پیگیری: ${result.refId}`);
    console.log(
      `\nیعنی «${unit}» درست است. همین مقدار را در PAYMENT_AMOUNT_UNIT تولید بگذار\n` +
        "و در docs/deployment.md بخش ۷ ثبتش کن تا دفعه‌ی بعد کسی دوباره نپرسد.",
    );
  } catch (error) {
    /**
     * پرتاب یعنی «نمی‌دانم» — همان چیزی که در تولید سفارش را `PENDING`
     * می‌گذارد. اینجا هم همان معنی را دارد: نتیجه‌ی این آزمایش نامعلوم
     * است، نه منفی. تکرارش با همان `authority` بی‌خطر است.
     */
    console.log(`\n? نامشخص: ${error instanceof Error ? error.message : String(error)}`);
    console.log(
      "\nاین حالت چیزی درباره‌ی واحد مبلغ ثابت نمی‌کند. در تولید هم دقیقاً همین\n" +
        "پاسخ، سفارش را PENDING نگه می‌دارد تا دستی بررسی شود.",
    );
    process.exitCode = 1;
  }
}

/** ترجمه‌ی شکست به کاری که باید انجام شود. */
function verdictForFailure(reason: string, unit: AmountUnit): string {
  if (!reason.includes("واحد مبلغ")) {
    return "\nربطی به واحد مبلغ ندارد — متن بالا را بخوان.";
  }

  const other: AmountUnit = unit === "RIAL" ? "TOMAN" : "RIAL";

  return (
    `\nاین همان کد -50 است: حساب پذیرندگی روی «${unit}» نیست.\n` +
    `  PAYMENT_AMOUNT_UNIT="${other}"\n` +
    "بگذار و دوباره اجرا کن. هیچ تغییر کدی لازم نیست."
  );
}

await main();
