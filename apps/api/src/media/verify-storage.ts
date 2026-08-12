/**
 * راستی‌آزمایی آبجکت‌استوریج در برابر یک باکت **واقعی**.
 *
 *   pnpm verify:storage
 *
 * چرا این اسکریپت وجود دارد: امضای SigV4 در `sigv4.test.ts` تا حد بردار
 * مرجع خود AWS سنجیده شده، ولی سه چیز را هیچ تست واحدی نشان نمی‌دهد و
 * فقط سرویس واقعی جوابشان را دارد:
 *
 *   ۱. سیاست CORS باکت — آیا `PUT` را از `WEB_ORIGIN` می‌پذیرد؟
 *   ۲. آیا `UNSIGNED-PAYLOAD` پذیرفته می‌شود؟
 *   ۳. شکل درست میزبان — زیردامنه‌ای یا مسیری؟
 *
 * و مهم‌تر از پاسخ هرکدام، این است که وقتی آپلود شکست می‌خورد، هر سه به
 * یک شکل دیده می‌شوند. سرویس فقط `SignatureDoesNotMatch` می‌دهد و
 * مرورگر فقط «network error». پس این اسکریپت هر فرضیه را **جدا**
 * می‌آزماید و می‌گوید کدام‌یک شکست.
 *
 * از همان `s3ConfigFromEnv()` و `S3ObjectStorage` مسیر تولید استفاده
 * می‌کند، نه یک کپی موازی: اسکریپتی که امضای خودش را بسازد می‌تواند سبز
 * باشد در حالی که برنامه قرمز است.
 *
 * چیزی که می‌سازد را خودش پاک می‌کند، حتی وقتی وسط کار شکست بخورد.
 */

import { createHash, randomUUID } from "node:crypto";

import { presignUrl } from "./sigv4.js";
import {
  S3ObjectStorage,
  bucketHost,
  endpointHost,
  s3ConfigFromEnv,
  type S3Config,
} from "./storage.port.js";

const PROBE_BODY = Buffer.from(
  "راستی‌آزمایی آبجکت‌استوریج — این فایل باید خودکار پاک شود.\n",
  "utf8",
);
const PROBE_CONTENT_TYPE = "text/plain";

type Outcome = "ok" | "fail" | "warn" | "skip";

interface CheckResult {
  name: string;
  outcome: Outcome;
  /** چه دیده شد */
  detail: string;
  /** اگر شکست خورد، محتمل‌ترین علت — همان چیزی که پیام خام نمی‌گوید */
  diagnosis?: string;
  /** کد خطای S3، برای نتیجه‌گیری نهایی که آزمون‌ها را کنار هم می‌گذارد */
  code?: string | null;
}

/**
 * چیزی که آزمون ساخته و باید پاک شود.
 *
 * `host` هم نگه داشته می‌شود نه فقط کلید: آزمون سبک مسیری روی میزبان
 * دیگری می‌نویسد و پاک کردنش با میزبان اصلی، کلید اشتباهی را هدف
 * می‌گیرد و آبجکت آزمایشی برای همیشه در باکت می‌ماند.
 */
interface Leftover {
  host: string;
  signedKey: string;
}

// ---------------------------------------------------------------------------
// تشخیص
// ---------------------------------------------------------------------------

/**
 * پیام خام سرویس را به علت محتمل ترجمه می‌کند.
 *
 * کل ارزش این اسکریپت همین‌جاست. `SignatureDoesNotMatch` می‌تواند یعنی
 * کلید غلط، منطقه‌ی غلط، یا شکل میزبان غلط — و سرویس هیچ‌وقت نمی‌گوید
 * کدام. این جدول آدم را به جای درست می‌فرستد به‌جای اینکه ساعت‌ها دنبال
 * اشکالِ امضا بگردد که سالم است.
 */
function diagnose(code: string | null, status: number): string {
  switch (code) {
    case "SignatureDoesNotMatch":
      return (
        "امضا خوانده شد ولی نخواند. چون تست‌های sigv4 سبزند، محتمل‌ترین علت " +
        "به ترتیب: S3_REGION اشتباه، شکل میزبان اشتباه (زیردامنه‌ای در برابر " +
        "مسیری — نتیجه‌ی آزمون سبک مسیری پایین را ببین)، یا فاصله/نقل‌قول " +
        "اضافی در S3_SECRET_KEY."
      );
    case "InvalidAccessKeyId":
      return "S3_ACCESS_KEY در این سرویس شناخته نشد. کلید مال باکت دیگری است یا باطل شده.";
    case "AccessDenied":
      return (
        "کلید معتبر است ولی اجازه‌ی این عمل را ندارد. سیاست دسترسی کلید را " +
        "بررسی کن — برای آپلود `PutObject` و برای جاروی پاک‌سازی `DeleteObject` لازم است."
      );
    case "NoSuchBucket":
      return "باکت با این نام وجود ندارد. S3_BUCKET یا S3_ENDPOINT اشتباه است.";
    case "RequestTimeTooSkewed":
      return "ساعت این ماشین با سرویس بیش از حد فاصله دارد. ساعت سیستم را همگام کن.";
    case "XAmzContentSHA256Mismatch":
    case "InvalidRequest":
      return (
        "احتمالاً UNSIGNED-PAYLOAD پذیرفته نشد. نتیجه‌ی آزمون «هش بدنه‌ی " +
        "امضاشده» پایین را ببین: اگر آن یکی سبز است، مسیر آپلود مستقیم از " +
        "مرورگر با این سرویس کار نمی‌کند و باید بازطراحی شود."
      );
    default:
      break;
  }

  if (status === 403) {
    return "دسترسی رد شد بدون کد مشخص. اگر روی خواندن است، باکت خصوصی است و نشانی عمومی کار نمی‌کند.";
  }
  if (status === 404) {
    return "مسیر پیدا نشد. شکل میزبان یا نام باکت اشتباه است.";
  }

  return "پاسخ ناشناخته. متن خام بالا را ببین.";
}

/** کد خطای S3 از بدنه‌ی XML. */
function errorCodeOf(body: string): string | null {
  return /<Code>([^<]+)<\/Code>/.exec(body)?.[1] ?? null;
}

/**
 * پیام خوانا از بدنه‌ی خطا.
 *
 * XML خام سه خط طول دارد و شناسه‌ی درخواست و میزبان را هم می‌آورد؛
 * چاپ کاملش گزارش را طوری شلوغ می‌کند که تشخیصِ زیرش دیده نشود. اگر
 * `<Message>` نبود، متن خام کوتاه‌شده می‌ماند.
 */
function errorMessageOf(body: string): string {
  const message = /<Message>([^<]+)<\/Message>/.exec(body)?.[1];
  return (message ?? body.replace(/\s+/g, " ")).trim().slice(0, 300) || "بدون بدنه";
}

/** خطای شبکه — یعنی درخواست اصلاً به سرویس نرسید. */
function networkFailure(name: string, error: unknown): CheckResult {
  const message = error instanceof Error ? error.message : String(error);

  return {
    name,
    outcome: "fail",
    detail: message,
    diagnosis:
      "درخواست به سرویس نرسید. DNS، فیلترینگ، یا S3_ENDPOINT اشتباه. " +
      "این خطا هیچ ربطی به امضا ندارد.",
  };
}

/** پاسخ ناموفق را به نتیجه‌ی تشخیص‌دار تبدیل می‌کند. */
async function failureFrom(name: string, response: Response): Promise<CheckResult> {
  const body = (await response.text()).slice(0, 2000);
  const code = errorCodeOf(body);

  return {
    name,
    outcome: "fail",
    code,
    detail: `کد ${response.status}${code ? ` (${code})` : ""} — ${errorMessageOf(body)}`,
    diagnosis: diagnose(code, response.status),
  };
}

// ---------------------------------------------------------------------------
// آزمون‌ها
// ---------------------------------------------------------------------------

/**
 * پیش‌پرواز CORS.
 *
 * اول از همه اجرا می‌شود چون تنها شکستی است که در مرورگر **بدون هیچ
 * پیام قابل استفاده‌ای** ظاهر می‌شود: فایل هرگز به سرویس نمی‌رسد، پس
 * لاگ باکت خالی است و کنسول فقط «network error» می‌گوید. از خط فرمان
 * دیدنش ساده است چون پیش‌پرواز فقط یک `OPTIONS` است.
 *
 * `PUT` همیشه پیش‌پرواز دارد — روش ساده نیست — پس این مسیر در تولید
 * قابل دور زدن نیست.
 */
async function checkCorsPreflight(host: string, origin: string): Promise<CheckResult> {
  const name = `پیش‌پرواز CORS برای PUT از ${origin}`;

  let response: Response;
  try {
    response = await fetch(`https://${host}/${probeKey()}`, {
      method: "OPTIONS",
      headers: {
        origin,
        "access-control-request-method": "PUT",
        "access-control-request-headers": "content-type",
      },
    });
  } catch (error) {
    return networkFailure(name, error);
  }

  const allowOrigin = response.headers.get("access-control-allow-origin");
  const allowMethods = response.headers.get("access-control-allow-methods") ?? "";

  if (!response.ok || !allowOrigin) {
    return {
      name,
      outcome: "fail",
      detail: `کد ${response.status}، بدون access-control-allow-origin`,
      diagnosis:
        `سیاست CORS باکت این مبدأ را نمی‌پذیرد. در پنل باکت یک قاعده با ` +
        `AllowedOrigin=${origin}، AllowedMethod=PUT و AllowedHeader=* اضافه کن. ` +
        "بدون این، آپلود در مرورگر شکست می‌خورد ولی از این اسکریپت (که مرورگر " +
        "نیست) سبز درمی‌آید — پس همین یک آزمون تنها جای دیدنش است.",
    };
  }

  if (allowOrigin !== "*" && allowOrigin !== origin) {
    return {
      name,
      outcome: "fail",
      detail: `مبدأ مجاز «${allowOrigin}» است، نه «${origin}»`,
      diagnosis: "قاعده‌ی CORS برای مبدأ دیگری نوشته شده. WEB_ORIGIN را با آن یکی کن.",
    };
  }

  if (!/put/i.test(allowMethods)) {
    return {
      name,
      outcome: "fail",
      detail: `روش‌های مجاز: «${allowMethods || "اعلام‌نشده"}»`,
      diagnosis: "مبدأ پذیرفته شد ولی PUT در روش‌های مجاز نیست.",
    };
  }

  return { name, outcome: "ok", detail: `مبدأ «${allowOrigin}»، روش‌ها «${allowMethods}»` };
}

interface UploadProbe {
  name: string;
  host: string;
  /** مسیر آبجکت در آدرس — در سبک مسیری نام باکت را هم دارد */
  signedKey: string;
  payloadHash?: string;
  /** آزمون تشخیصی: شکستش برنامه را نمی‌شکند */
  advisory?: boolean;
}

/** یک آپلود امضاشده‌ی واقعی. */
async function checkUpload(
  probe: UploadProbe,
  config: S3Config,
  origin: string,
  leftovers: Leftover[],
): Promise<CheckResult> {
  const url = presignUrl({
    method: "PUT",
    host: probe.host,
    key: probe.signedKey,
    region: config.region,
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    expiresInSeconds: 300,
    payloadHash: probe.payloadHash,
  });

  let response: Response;
  try {
    response = await fetch(url, {
      method: "PUT",
      // `origin` گذاشته می‌شود تا پاسخ **واقعی** هم بررسی شود: پیش‌پرواز
      // می‌تواند پاس شود ولی پاسخ خود PUT هدر CORS نداشته باشد، و آن
      // وقت مرورگر پاسخ را از کد جاوااسکریپت پنهان می‌کند.
      headers: { "content-type": PROBE_CONTENT_TYPE, origin },
      body: PROBE_BODY,
    });
  } catch (error) {
    const failure = networkFailure(probe.name, error);
    return probe.advisory ? { ...failure, outcome: "warn" } : failure;
  }

  if (!response.ok) {
    const failure = await failureFrom(probe.name, response);
    return probe.advisory ? { ...failure, outcome: "warn" } : failure;
  }

  leftovers.push({ host: probe.host, signedKey: probe.signedKey });

  const echoed = response.headers.get("access-control-allow-origin");

  return {
    name: probe.name,
    outcome: "ok",
    detail:
      `کد ${response.status}` +
      (echoed ? `، پاسخ هم هدر CORS دارد («${echoed}»)` : "، ولی پاسخ هدر CORS ندارد"),
  };
}

/** پاک کردن یک آبجکت آزمایشی، روی همان میزبانی که ساخته شد. */
async function removeLeftover(leftover: Leftover, config: S3Config): Promise<void> {
  const url = presignUrl({
    method: "DELETE",
    host: leftover.host,
    key: leftover.signedKey,
    region: config.region,
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    expiresInSeconds: 60,
  });

  await fetch(url, { method: "DELETE" });
}

/**
 * خواندن از نشانی عمومی.
 *
 * جدا از آپلود است چون شکست‌های متفاوتی دارد: باکت می‌تواند نوشتن را
 * قبول کند و خواندنِ ناشناس را نه. آن حالت یعنی هنرجو فایل را می‌فرستد
 * و استاد صفحه‌ی خالی می‌بیند — خرابی‌ای که سمت آپلود هیچ نشانه‌ای ندارد.
 */
async function checkPublicRead(publicUrl: string): Promise<CheckResult> {
  const name = "خواندن از نشانی عمومی";

  let response: Response;
  try {
    response = await fetch(publicUrl);
  } catch (error) {
    return networkFailure(name, error);
  }

  if (!response.ok) {
    const failure = await failureFrom(name, response);
    return {
      ...failure,
      diagnosis:
        "آپلود کار کرد ولی خواندنِ ناشناس نه. باکت (یا این پیشوند) باید " +
        "خواندن عمومی داشته باشد، وگرنه استاد به‌جای اجرای هنرجو صفحه‌ی " +
        "خالی می‌بیند. اگر عمداً خصوصی است، مسیر پخش باید آدرس امضاشده‌ی " +
        "خواندن بگیرد و `publicUrlFor` باید بازنویسی شود.",
    };
  }

  const body = Buffer.from(await response.arrayBuffer());

  if (!body.equals(PROBE_BODY)) {
    return {
      name,
      outcome: "fail",
      detail: `${body.byteLength} بایت برگشت، انتظار ${PROBE_BODY.byteLength} بایت`,
      diagnosis:
        "محتوا با چیزی که فرستادیم فرق دارد. اگر باکت پشت CDN است، " +
        "احتمالاً نسخه‌ی کش‌شده‌ی قدیمی برگشته.",
    };
  }

  const contentType = response.headers.get("content-type") ?? "";

  return {
    name,
    outcome: "ok",
    detail: `${body.byteLength} بایت، content-type «${contentType}»`,
  };
}

/**
 * حذف — همان چیزی که جاروی پاک‌سازی به آن تکیه می‌کند.
 *
 * جدا سنجیده می‌شود چون کلیدِ فقط-نوشتنی چیز رایجی است: آپلود سبز
 * می‌شود، سیاست نگه‌داری بی‌صدا هیچ‌وقت کار نمی‌کند، و هزینه‌ی
 * ذخیره‌سازی خطی بالا می‌رود بی‌آنکه کسی بفهمد.
 */
async function checkDelete(
  storage: S3ObjectStorage,
  objectKey: string,
): Promise<CheckResult> {
  const name = "حذف آبجکت (لازمِ جاروی پاک‌سازی)";

  try {
    await storage.deleteObject(objectKey);
  } catch (error) {
    return {
      name,
      outcome: "fail",
      detail: error instanceof Error ? error.message : String(error),
      diagnosis:
        "کلید اجازه‌ی DeleteObject ندارد. بدون آن، سیاست نگه‌داری اجرا " +
        "نمی‌شود و فایل‌ها برای همیشه می‌مانند.",
    };
  }

  return { name, outcome: "ok", detail: "پاک شد" };
}

// ---------------------------------------------------------------------------
// اجرا
// ---------------------------------------------------------------------------

const probeKey = (): string => `verify/${randomUUID()}.txt`;

const SIGNED_PAYLOAD_PROBE = "تشخیص: همان آپلود، ولی با هش بدنه‌ی امضاشده";
const ALTERNATE_HOST_PROBE = "تشخیص: همان آپلود، ولی با شکل میزبان دیگر";

const styleName = (pathStyle: boolean): string =>
  pathStyle ? "مسیری" : "زیردامنه‌ای";

/**
 * مسیر امضاشونده — قرینه‌ی `S3ObjectStorage.signedPath` که خصوصی است.
 *
 * تکرارِ کوچکی است، ولی راهِ نتکرار کردنش این بود که آن متد عمومی شود؛
 * و آن یعنی جای دیگری هم بتواند کلیدِ باکت‌دار بسازد و در دیتابیس
 * بنشاند. تنها جایی که این تمایز باید دیده شود همین اسکریپت است.
 */
function signedPathFor(config: S3Config, objectKey: string): string {
  return config.pathStyle ? `${config.bucket}/${objectKey}` : objectKey;
}

/**
 * همان تنظیمات، با شکل میزبان برعکس.
 *
 * `null` وقتی برمی‌گردد که این دو از هم قابل تفکیک نباشند — یعنی
 * `S3_ENDPOINT` از قبل نام باکت را در خود دارد، که آزمودن شکل دیگر را
 * بی‌معنا می‌کند.
 */
function alternateStyle(config: S3Config): S3Config | null {
  const endpoint = endpointHost(process.env.S3_ENDPOINT ?? "");
  const withBucket = bucketHost(endpoint, config.bucket);

  if (endpoint === withBucket) return null;

  const pathStyle = !config.pathStyle;
  const host = pathStyle ? endpoint : withBucket;

  return {
    ...config,
    pathStyle,
    host,
    publicBaseUrl: pathStyle ? `https://${host}/${config.bucket}` : `https://${host}`,
  };
}

/**
 * نتیجه‌ی نهایی از **کنار هم گذاشتن** آزمون‌ها.
 *
 * تنها ارزش واقعی سه آزمون تشخیصی همین‌جاست و در نتیجه‌ی تک‌تکشان نیست:
 * هر سه یک پیام می‌دهند (`SignatureDoesNotMatch`) و خواندنشان جدا جدا
 * آدم را به همان بن‌بستی می‌برد که از اول در آن بود. آنچه جواب می‌دهد
 * الگوی بین آن‌هاست — کدام شکست و کدام نه.
 */
function verdict(results: CheckResult[], pathStyle: boolean): string {
  const outcomeOf = (name: string): Outcome | null =>
    results.find((result) => result.name === name)?.outcome ?? null;

  if (outcomeOf(ALTERNATE_HOST_PROBE) === "ok") {
    return (
      `شکل میزبان مقصر است: سبک ${styleName(!pathStyle)} کار می‌کند و ` +
      `${styleName(pathStyle)} نه.\n` +
      `  در .env مقدار \`S3_PATH_STYLE="${!pathStyle}"\` را بگذار و دوباره اجرا کن.`
    );
  }

  if (outcomeOf(SIGNED_PAYLOAD_PROBE) === "ok") {
    return (
      "این سرویس `UNSIGNED-PAYLOAD` را نمی‌پذیرد ولی هش بدنه‌ی امضاشده را می‌پذیرد.\n" +
      "  این جدی است: هش بدنه یعنی سرور باید فایل را پیش از امضا ببیند، و کل\n" +
      "  طراحی «فایل از API عبور نمی‌کند» روی همین بنا شده. یا باید سرویس عوض\n" +
      "  شود یا آپلود مستقیم از مرورگر کنار گذاشته شود."
    );
  }

  const shapeProbesRan =
    outcomeOf(SIGNED_PAYLOAD_PROBE) !== null || outcomeOf(ALTERNATE_HOST_PROBE) !== null;

  if (shapeProbesRan) {
    return (
      "هر سه شکل درخواست یکسان رد شدند، پس مشکل در شکل درخواست نیست —\n" +
      "  بالادستِ آن است: `S3_ACCESS_KEY`، `S3_SECRET_KEY`، یا `S3_REGION`.\n" +
      "  منطقه را از خود پنل سرویس بردار؛ حدس زدنش رایج‌ترین علت این خطاست و\n" +
      "  دقیقاً همان پیامی را می‌دهد که کلید غلط می‌دهد."
    );
  }

  return "";
}

const SYMBOL: Record<Outcome, string> = {
  ok: "✅",
  fail: "❌",
  warn: "⚠️ ",
  skip: "⏭️ ",
};

function report(results: CheckResult[]): void {
  console.log("");

  for (const result of results) {
    console.log(`${SYMBOL[result.outcome]} ${result.name}`);
    console.log(`     ${result.detail}`);
    if (result.diagnosis) console.log(`     ↳ ${result.diagnosis}`);
    console.log("");
  }
}

async function main(): Promise<number> {
  const config = s3ConfigFromEnv();

  if (!config) {
    console.error(
      "تنظیمات S3 کامل نیست. این چهار متغیر لازم‌اند و در .env خالی‌اند:\n" +
        "  S3_ENDPOINT  S3_BUCKET  S3_ACCESS_KEY  S3_SECRET_KEY\n\n" +
        "یک باکت روی آروان‌کلاد یا لیارا بساز، کلیدها را در .env بگذار و " +
        "دوباره اجرا کن. تا آن موقع آداپتور حافظه‌ای کار می‌کند و این " +
        "اسکریپت چیزی برای آزمودن ندارد.",
    );
    return 1;
  }

  const origin = process.env.WEB_ORIGIN ?? "http://localhost:3000";
  const storage = new S3ObjectStorage(config);
  const results: CheckResult[] = [];
  const leftovers: Leftover[] = [];

  console.log(`میزبان     : ${config.host}`);
  console.log(`سبک میزبان : ${styleName(config.pathStyle)}`);
  console.log(`منطقه      : ${config.region}`);
  console.log(`نشانی عمومی: ${config.publicBaseUrl}`);
  console.log(`مبدأ وب    : ${origin}`);

  results.push(await checkCorsPreflight(config.host, origin));

  /** مسیر تولید — این یکی است که واقعاً باید کار کند. */
  const mainKey = probeKey();
  const mainUpload = await checkUpload(
    {
      name: `آپلود امضاشده با UNSIGNED-PAYLOAD (میزبان ${styleName(config.pathStyle)})`,
      host: config.host,
      signedKey: signedPathFor(config, mainKey),
    },
    config,
    origin,
    leftovers,
  );
  results.push(mainUpload);

  if (mainUpload.outcome === "ok") {
    results.push(await checkPublicRead(storage.publicUrlFor(mainKey)));

    const deletion = await checkDelete(storage, mainKey);
    results.push(deletion);

    // آزمون حذف کار پاک‌سازی این یکی را انجام داد
    if (deletion.outcome === "ok") {
      leftovers.splice(
        leftovers.findIndex((item) => item.signedKey === mainKey),
        1,
      );
    }
  } else {
    /**
     * آپلود اصلی شکست خورد. حالا دو فرضیه‌ی رقیب جدا آزموده می‌شوند تا
     * معلوم شود کدام‌یک از سه ناشناخته‌ی سند مقصر است. بدون این دو، تنها
     * چیزی که دست آدم می‌ماند «SignatureDoesNotMatch» است.
     */
    results.push({
      name: "خواندن از نشانی عمومی",
      outcome: "skip",
      detail: "آپلود شکست خورد، چیزی برای خواندن نیست",
    });

    results.push(
      await checkUpload(
        {
          name: SIGNED_PAYLOAD_PROBE,
          host: config.host,
          signedKey: signedPathFor(config, probeKey()),
          payloadHash: createHash("sha256").update(PROBE_BODY).digest("hex"),
          advisory: true,
        },
        config,
        origin,
        leftovers,
      ),
    );

    /**
     * همان آپلود با شکل میزبانِ **دیگر**.
     *
     * تنها آزمونی است که «امضایمان غلط است» را از «میزبان را جای
     * اشتباهی گذاشته‌ایم» جدا می‌کند — و آن دو پیام خطای یکسانی دارند.
     */
    const alternate = alternateStyle(config);

    if (alternate) {
      results.push(
        await checkUpload(
          {
            name: ALTERNATE_HOST_PROBE,
            host: alternate.host,
            signedKey: signedPathFor(alternate, probeKey()),
            advisory: true,
          },
          alternate,
          origin,
          leftovers,
        ),
      );
    }
  }

  // هرچه ساخته شد پاک می‌شود — از جمله آبجکت‌های آزمون‌های تشخیصی، که
  // در حالت شکست ساخته شده‌اند و اگر بمانند دفعه‌ی بعد گیج‌کننده‌اند.
  // شکستِ پاک‌سازی خودش نتیجه‌ی آزمون را عوض نمی‌کند؛ آزمون حذف جدا هست.
  for (const leftover of leftovers) {
    await removeLeftover(leftover, config).catch(() => undefined);
  }

  report(results);

  const failed = results.filter((result) => result.outcome === "fail");

  if (failed.length > 0) {
    console.log(`${failed.length} آزمون شکست خورد.`);

    const conclusion = verdict(results, config.pathStyle);
    if (conclusion) console.log(`\n▸ ${conclusion}`);

    return 1;
  }

  const warned = results.filter((result) => result.outcome === "warn");
  console.log(
    warned.length > 0
      ? "مسیر اصلی سالم است، ولی آزمون‌های تشخیصی هشدار دادند."
      : "همه‌ی آزمون‌ها پاس شدند. آداپتور S3 در برابر باکت واقعی کار می‌کند.",
  );

  return 0;
}

try {
  process.exitCode = await main();
} catch (error) {
  // خطای پیش‌بینی‌نشده نباید به‌صورت «صفر آزمون شکست خورد» دیده شود
  console.error("راستی‌آزمایی به خطای پیش‌بینی‌نشده خورد:", error);
  process.exitCode = 1;
}
