/**
 * اعتبارسنجی محیط هنگام بالا آمدن.
 *
 * الگویی که `media/storage.port.ts` از قبل داشت اینجا تعمیم پیدا کرده:
 * **اگر در تولید تنظیمی ناقص باشد، برنامه عمداً بالا نمی‌آید** به‌جای
 * اینکه بی‌صدا به آداپتور جعلی برگردد. تفاوتش با قبل دو چیز است:
 *
 *   ۱. بررسی **پیش از** ساخته شدن اپ انجام می‌شود، نه در لحظه‌ای که
 *      اولین کاربر به آن ماژول می‌رسد. سه کارخانه‌ی جدا (پیامک، درگاه،
 *      ذخیره‌سازی) یعنی سه استقرارِ ظاهراً موفق که هرکدام روی اولین
 *      استفاده‌ی واقعی می‌شکنند — و آن لحظه معمولاً اولین فروش است.
 *   ۲. **همه‌ی** مشکلات با هم گزارش می‌شوند، نه اولینشان. حلقه‌ی
 *      «متغیر را بگذار، دوباره دیپلوی کن، متغیر بعدی» با هر بار
 *      راه‌اندازی کامل، یک بعدازظهر است.
 *
 * این فایل عمداً هیچ چیزی از نست، دیتابیس یا ردیس import نمی‌کند: هم
 * `main.ts` و هم `worker.ts` و هم اسکریپت‌های `db/` پیش از هر چیز
 * دیگری صدایش می‌زنند، و وابستگی به ماژولی که خودش به محیط نیاز دارد
 * یعنی خطا پیش از رسیدن به پیام درست پرتاب شود.
 */

/** فقط برای خوانایی امضاها — `process.env` هم دقیقاً همین شکل است. */
export type EnvRecord = Record<string, string | undefined>;

export type AppEnv = "production" | "test" | "development";

/**
 * مقدار `JWT_SECRET` در `.env.example`.
 *
 * جدا نوشته شده چون بررسی طول از آن رد می‌شود: ۵۲ کاراکتر است و هر
 * قاعده‌ای که فقط «حداقل ۳۲ کاراکتر» را بسنجد، سبز می‌گوید. تنها راه
 * گرفتنش مقایسه با خودِ مقدار است — یعنی همین ثابت باید هر وقت
 * `.env.example` عوض شد با آن جابه‌جا شود.
 */
export const DEV_JWT_SECRET = "dev-only-secret-do-not-use-in-production-min-32-chars";

const MIN_JWT_SECRET_LENGTH = 32;

/**
 * پرچمِ برگرداندن کد ورود در پاسخ `otp/request`.
 *
 * چرا یک پرچم صریح و نه `NODE_ENV !== "production"`: آن شرط **پیش‌فرضش
 * باز است**. یک `NODE_ENV` فراموش‌شده در استقرار — که رایج‌ترین اشتباه
 * پیکربندی است و هیچ نشانه‌ی دیگری هم ندارد — کد ورود هر کاربری را در
 * پاسخِ یک اندپوینت عمومی می‌گذارد، و آن یعنی ورود به هر حسابی از جمله
 * ادمین. با این پرچم، پیش‌فرض **بسته** است: باز شدنش یک کار عمدی
 * می‌خواهد، و همان کار عمدی در تولید جلوی بالا آمدن را می‌گیرد.
 */
export const DEV_LOGIN_CODE_FLAG = "ALLOW_DEV_LOGIN_CODE";

export interface EnvIssue {
  variable: string;
  problem: string;
}

interface Rule {
  variable: string;
  /** در پیام خطا می‌آید — «چه چیزی خراب می‌شود اگر این نباشد» */
  why: string;
  /** بررسی مقدارِ **موجود**. `null` یعنی سالم. نبودنِ مقدار جداگانه گرفته می‌شود. */
  validate?: (value: string, env: EnvRecord) => string | null;
}

// ---------------------------------------------------------------------------
// محیط
// ---------------------------------------------------------------------------

export function appEnv(env: EnvRecord = process.env): AppEnv {
  if (env.NODE_ENV === "production") return "production";
  if (env.NODE_ENV === "test") return "test";
  return "development";
}

export function isProduction(env: EnvRecord = process.env): boolean {
  return appEnv(env) === "production";
}

/**
 * آیا کد ورود در پاسخ برگردانده شود.
 *
 * فقط رشته‌ی دقیق `"true"` روشنش می‌کند؛ `"1"` و `"yes"` نه. سخت‌گیری
 * عمدی است — پرچمی که چند شکلِ روشن دارد، در پیکربندی به شکلی روشن
 * می‌شود که کسی انتظارش را ندارد.
 */
export function devLoginCodeEnabled(env: EnvRecord = process.env): boolean {
  return env[DEV_LOGIN_CODE_FLAG] === "true" && !isProduction(env);
}

// ---------------------------------------------------------------------------
// قاعده‌ها
// ---------------------------------------------------------------------------

function connectionUrl(protocols: string[]): Rule["validate"] {
  return (value) => {
    let parsed: URL;

    try {
      parsed = new URL(value);
    } catch {
      return "آدرس اتصال معتبر نیست.";
    }

    if (!protocols.includes(parsed.protocol)) {
      return `پروتکل باید یکی از ${protocols.join(" یا ")} باشد، نه «${parsed.protocol}».`;
    }

    return null;
  };
}

/**
 * آدرسی که **از بیرون** باید قابل دسترسی باشد.
 *
 * localhost اینجا از نبودنِ مقدار بدتر است: پیکربندی کامل به نظر
 * می‌رسد و برنامه بالا می‌آید. `PAYMENT_CALLBACK_URL` که روی localhost
 * مانده باشد یعنی درگاه کاربر را به جایی می‌فرستد که وجود ندارد، هیچ
 * سفارشی تأیید نمی‌شود، و اولین باری که کسی متوجه می‌شود اولین فروش
 * است — با پولی که گرفته شده و رزروی که قطعی نشده.
 */
const publicUrl: Rule["validate"] = (value) => {
  let parsed: URL;

  try {
    parsed = new URL(value);
  } catch {
    return "آدرس معتبر نیست؛ باید کامل و با پروتکل باشد.";
  }

  if (parsed.protocol !== "https:") {
    return `در تولید باید https باشد، نه «${parsed.protocol}».`;
  }

  if (["localhost", "127.0.0.1", "::1", "0.0.0.0"].includes(parsed.hostname)) {
    return `به «${parsed.hostname}» اشاره می‌کند که از بیرون در دسترس نیست.`;
  }

  return null;
};

/**
 * دامنه‌ی ثبت‌شده (eTLD+1) — تقریبی و عمداً کوچک.
 *
 * فهرست کامل پسوندهای عمومی هزاران سطر است و آوردنش برای یک بررسیِ
 * بوت، هزینه‌ای است که فایده‌اش را ندارد. اینجا فقط پسوندهای دوسطحی‌ای
 * آمده‌اند که این پروژه واقعاً با آن‌ها روبه‌رو می‌شود. اشتباهش هم به
 * سمت امن می‌افتد: حداکثر دو دامنه‌ی متفاوت را «یکی» می‌بیند، یعنی
 * هشدارِ نابه‌جا نمی‌دهد.
 */
/**
 * مقادیر مجاز `PAYMENT_AMOUNT_UNIT`.
 *
 * عمداً از `payment/gateway.port.ts` import نمی‌شود: این فایل پیش از
 * ساخته شدن اپ اجرا می‌شود و نباید هیچ ماژولی را که نست یا دیتابیس
 * می‌شناسد بالا بیاورد، وگرنه خطا پیش از رسیدن به پیام درست پرتاب
 * می‌شود. دو مقدار است و هر تغییری باید هر دو جا انجام شود.
 */
const AMOUNT_UNITS = ["RIAL", "TOMAN"];

const TWO_LEVEL_SUFFIXES = [
  "co.ir",
  "ac.ir",
  "org.ir",
  "net.ir",
  "gov.ir",
  "id.ir",
  "sch.ir",
  "co.uk",
  "org.uk",
  "com.au",
];

export function registrableDomain(hostname: string): string {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  const labels = host.split(".");

  if (labels.length <= 2) return host;

  const lastTwo = labels.slice(-2).join(".");
  const take = TWO_LEVEL_SUFFIXES.includes(lastTwo) ? 3 : 2;

  return labels.slice(-take).join(".");
}

/**
 * مبدأ عمومی خودِ API.
 *
 * `PAYMENT_CALLBACK_URL` روی همین API است (`/api/payments/callback`)، پس
 * دامنه‌اش را از آن می‌شود فهمید و یک متغیر تازه لازم نیست. اگر روزی
 * جایی جز API سرو شد، `API_ORIGIN` صریح می‌چربد.
 */
function apiOrigin(env: EnvRecord): string | null {
  const explicit = env.API_ORIGIN?.trim();
  const source = explicit || env.PAYMENT_CALLBACK_URL?.trim();

  if (!source) return null;

  try {
    return new URL(source).hostname;
  } catch {
    return null;
  }
}

/**
 * لازم در **هر** محیط.
 *
 * این سه بدون جایگزین‌اند: نه آداپتور توسعه‌ای دارند و نه پیش‌فرض
 * بی‌خطری. نبودنشان در توسعه هم باید همین‌جا و با پیام روشن دیده شود،
 * نه چند لایه پایین‌تر به شکل `ECONNREFUSED`.
 */
const ALWAYS_REQUIRED: readonly Rule[] = [
  {
    variable: "DATABASE_URL",
    why: "بدون دیتابیس هیچ درخواستی کار نمی‌کند.",
    validate: connectionUrl(["postgres:", "postgresql:"]),
  },
  {
    variable: "REDIS_URL",
    why: "کد ورود، بلیت آپلود، صف وُرکر و ضربان جاروها همه در ردیس‌اند.",
    validate: connectionUrl(["redis:", "rediss:"]),
  },
  {
    variable: "JWT_SECRET",
    why: "کلید امضای توکن دسترسی.",
    validate: (value, env) => {
      if (value.length < MIN_JWT_SECRET_LENGTH) {
        return `کوتاه‌تر از ${MIN_JWT_SECRET_LENGTH} کاراکتر است. با «openssl rand -base64 48» یکی بسازید.`;
      }

      if (isProduction(env) && value === DEV_JWT_SECRET) {
        return "هنوز مقدار پیش‌فرض .env.example است — یعنی هرکسی که مخزن را دیده می‌تواند توکن ادمین جعل کند. با «openssl rand -base64 48» عوضش کنید.";
      }

      return null;
    },
  },
];

/**
 * لازم فقط در تولید.
 *
 * هرکدام یک آداپتور جعلی یا پیش‌فرض توسعه دارند که در تولید نباید
 * انتخاب شود. `why` عمداً می‌گوید **چه اتفاقی می‌افتد** اگر بی‌صدا به
 * آن برگردیم، نه اینکه متغیر چیست.
 */
const PRODUCTION_REQUIRED: readonly Rule[] = [
  {
    variable: "SMS_API_KEY",
    why: "بدون آن آداپتور کنسول انتخاب می‌شود و کد ورود همه‌ی کاربران در لاگ سرور نوشته می‌شود.",
  },
  {
    variable: "PAYMENT_MERCHANT_ID",
    why: "بدون آن درگاه جعلی انتخاب می‌شود که هر پرداختی را تأیید می‌کند — یعنی رزرو بدون پرداخت یک ریال قطعی می‌شود.",
  },
  {
    variable: "PAYMENT_CALLBACK_URL",
    why: "درگاه کاربر را به این آدرس برمی‌گرداند و تأیید سرور به سرور از همین‌جا شروع می‌شود.",
    validate: publicUrl,
  },
  {
    variable: "WEB_ORIGIN",
    why: "هم مبدأ مجاز CORS است و هم مقصد ریدایرکت پس از پرداخت.",
    /**
     * علاوه بر شکل آدرس، **هم‌دامنه بودن با API** هم اینجا سنجیده
     * می‌شود.
     *
     * توکن تازه‌سازی در کوکی `SameSite=Lax` می‌رود. اگر API روی دامنه‌ی
     * ثبت‌شده‌ی دیگری باشد، مرورگر آن کوکی را روی درخواست تمدید نشست
     * **نمی‌فرستد** — بی‌هیچ خطایی، در هیچ لاگی. چیزی که دیده می‌شود
     * این است: «کاربرها مدام بیرون می‌افتند»، آن هم فقط بعد از انقضای
     * توکن پانزده‌دقیقه‌ای، یعنی نه در تست دستی بلافاصله پس از استقرار.
     *
     * تنها راه گرفتنش پیش از کاربر واقعی، همین مقایسه است. زیردامنه و
     * پورت متفاوت مشکلی ندارند و رد نمی‌شوند.
     */
    validate: (value, env) => {
      const shape = publicUrl(value, env);
      if (shape) return shape;

      const api = apiOrigin(env);
      if (!api) return null;

      const web = new URL(value).hostname;

      if (registrableDomain(api) === registrableDomain(web)) return null;

      return (
        `دامنه‌ی ثبت‌شده‌اش «${registrableDomain(web)}» است ولی API روی «${registrableDomain(api)}» ` +
        "است. کوکی تازه‌سازی SameSite=Lax است و بین دو دامنه فرستاده نمی‌شود، " +
        "پس تمدید نشست بی‌صدا شکست می‌خورد و به شکل «کاربرها مدام بیرون می‌افتند» دیده می‌شود. " +
        "زیردامنه (api.example.com کنار example.com) مشکلی ندارد. " +
        "اگر آدرس بازگشت پرداخت عمداً روی دامنه‌ی دیگری است، دامنه‌ی واقعی API را در API_ORIGIN بگذارید."
      );
    },
  },
  {
    variable: "PAYMENT_AMOUNT_UNIT",
    why:
      "واحد حساب پذیرندگی زرین‌پال. اشتباهش یعنی هر پرداختی کد -50 می‌گیرد — " +
      "و چون این کد فقط در تأیید ظاهر می‌شود، اولین باری که دیده می‌شود اولین فروش است.",
    /**
     * چرا در تولید **اجباری** است با اینکه پیش‌فرض معقولی دارد:
     *
     * این تنها چیزی در کل پیکربندی است که کد نمی‌تواند حدسش را بسنجد.
     * یک پیش‌فرضِ خاموش یعنی کسی هرگز به آن فکر نکند تا لحظه‌ای که پول
     * واقعی در جریان است. اجباری بودنش آن فکر را به زمان استقرار
     * می‌آورد، جایی که هزینه‌اش یک دستور `pnpm verify:payment` است.
     */
    validate: (value) =>
      AMOUNT_UNITS.includes(value)
        ? null
        : `باید یکی از ${AMOUNT_UNITS.join(" یا ")} باشد، نه «${value}». با «pnpm verify:payment» معلومش کنید.`,
  },
  {
    variable: "S3_ENDPOINT",
    why: "بدون تنظیمات کامل باکت، ذخیره‌سازی درون‌حافظه‌ای انتخاب می‌شود و اجرای هنرجو با اولین ری‌استارت می‌پرد.",
  },
  { variable: "S3_BUCKET", why: "نام باکت آبجکت‌استوریج." },
  { variable: "S3_ACCESS_KEY", why: "کلید دسترسی باکت." },
  { variable: "S3_SECRET_KEY", why: "کلید مخفی باکت." },
  {
    variable: "JITSI_APP_SECRET",
    why: "بدون آن صدور توکن ورود به کلاس خطا می‌دهد و هیچ جلسه‌ای برگزار نمی‌شود.",
  },
  { variable: "JITSI_DOMAIN", why: "دامنه‌ی نمونه‌ی جیتسی پلتفرم." },
  { variable: "JITSI_APP_ID", why: "باید با JWT_ACCEPTED_ISSUERS روی سرور جیتسی یکی باشد." },
  { variable: "JITSI_AUDIENCE", why: "باید با JWT_ACCEPTED_AUDIENCES روی سرور جیتسی یکی باشد." },
  {
    variable: "JITSI_XMPP_DOMAIN",
    why: "ادعای sub توکن — دامنه‌ی داخلی prosody، نه دامنه‌ی عمومی.",
  },
  {
    variable: "JITSI_WEBHOOK_SECRET",
    why:
      "بدون آن هوک حضور همه‌ی رویدادها را رد می‌کند و حضور فقط از گزارش مرورگر می‌آید — " +
      "یعنی استادی که غیبت کرده می‌تواند خودش را حاضر ثبت کند و بازپرداخت هنرجو را به سوختن جلسه تبدیل کند.",
    validate: (value, env) =>
      value === env.JITSI_APP_SECRET
        ? "همان JITSI_APP_SECRET است. آن کلید به هر توکن ورودی که صادر می‌کنیم ربط دارد و نباید نقش دوم بگیرد؛ یکی جدا با «openssl rand -base64 48» بسازید."
        : null,
  },
];

/**
 * چیزهایی که در تولید **نباید** باشند.
 *
 * قرینه‌ی فهرست بالاست و به همان اندازه لازم: یک متغیر توسعه که
 * فراموش شده حذف شود، همان قدر خطرناک است که یک متغیر تولید که
 * فراموش شده اضافه شود — و برخلاف آن، هیچ خطایی نمی‌دهد.
 */
const PRODUCTION_FORBIDDEN: readonly Rule[] = [
  {
    variable: DEV_LOGIN_CODE_FLAG,
    why: "کد ورود را در پاسخ اندپوینت عمومی otp/request برمی‌گرداند — یعنی ورود به هر حسابی، از جمله ادمین.",
    validate: (value) => (value === "true" ? "در تولید روشن است." : null),
  },
];

// ---------------------------------------------------------------------------
// بررسی
// ---------------------------------------------------------------------------

/**
 * فهرست مشکلات محیط — خالی یعنی سالم.
 *
 * تابع خالص است و `env` را می‌گیرد نه اینکه `process.env` را بخواند، تا
 * تست بتواند هر ترکیبی را بسنجد بدون اینکه محیط پروسه‌ی ویتست را
 * دستکاری کند (که با اجرای موازی، تست‌های دیگر را هم می‌بَرد).
 */
export function checkEnvironment(env: EnvRecord): EnvIssue[] {
  const issues: EnvIssue[] = [];
  const production = isProduction(env);

  const applicable = production ? [...ALWAYS_REQUIRED, ...PRODUCTION_REQUIRED] : ALWAYS_REQUIRED;

  for (const rule of applicable) {
    const value = env[rule.variable]?.trim();

    if (!value) {
      issues.push({ variable: rule.variable, problem: `تعریف نشده است. ${rule.why}` });
      continue;
    }

    const problem = rule.validate?.(value, env);
    if (problem) {
      issues.push({ variable: rule.variable, problem: `${problem} ${rule.why}` });
    }
  }

  if (production) {
    for (const rule of PRODUCTION_FORBIDDEN) {
      const value = env[rule.variable]?.trim();
      if (!value) continue;

      const problem = rule.validate?.(value, env);
      if (problem) {
        issues.push({ variable: rule.variable, problem: `${problem} ${rule.why}` });
      }
    }
  }

  return issues;
}

/**
 * محیط را می‌سنجد و در صورت مشکل، پرتاب می‌کند.
 *
 * پیام همه‌ی مشکلات را با نام متغیر می‌آورد. متن فارسی است چون تنها
 * خواننده‌اش همان کسی است که استقرار را انجام می‌دهد.
 */
export function assertEnvironment(env: EnvRecord = process.env): void {
  const issues = checkEnvironment(env);

  if (issues.length === 0) return;

  const lines = issues.map((issue) => `  • ${issue.variable}: ${issue.problem}`);

  throw new Error(
    `پیکربندی محیط «${appEnv(env)}» ناقص است — ${issues.length} مورد:\n${lines.join("\n")}\n` +
      "فهرست کامل متغیرها در .env.example و docs/deployment.md است.",
  );
}

/**
 * جلوی اجرای یک اسکریپت در تولید را می‌گیرد.
 *
 * برای `db:seed` و هر کار دیگری که داده‌ی توسعه می‌سازد. بررسی روی
 * `NODE_ENV` است و همان ضعف همیشگی را دارد، پس **تنها** محافظ نیست:
 * خودِ seed هم دیگر ادمین و استاد نمونه نمی‌سازد مگر اینکه صریحاً
 * خواسته شود.
 */
export function assertNotProduction(task: string, env: EnvRecord = process.env): void {
  if (!isProduction(env)) return;

  throw new Error(
    `«${task}» داده‌ی توسعه می‌سازد و در محیط تولید اجرا نمی‌شود. ` +
      "برای پر کردن کاتالوگ در تولید از «pnpm db:seed:catalog» و برای ساخت ادمین از «pnpm db:admin <شماره>» استفاده کنید.",
  );
}
