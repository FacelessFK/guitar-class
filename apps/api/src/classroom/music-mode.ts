/**
 * حالت موسیقی — بحرانی‌ترین بخش فنی کلاس (سند معماری، بخش ۶.۳).
 *
 * جیتسی به‌صورت پیش‌فرض صدا را برای **گفتار** بهینه می‌کند و همان
 * بهینه‌سازی، صدای ساز را تخریب می‌کند:
 *
 *   • Noise Suppression نُت آرام و رهاشونده را نویز می‌بیند و حذفش می‌کند
 *   • Automatic Gain Control دامنه‌ی دینامیک را صاف می‌کند — پیانو و
 *     فورته یکی می‌شوند
 *   • Echo Cancellation موقع نواختن، صدا را بریده‌بریده می‌کند
 *   • کدک مونو با بیت‌ریت پایین هارمونیک‌های بالا را دور می‌ریزد
 *
 * این شیء عیناً به `configOverwrite` در IFrame API داده می‌شود. سمت
 * سرور تولید می‌شود نه سمت فرانت، تا وقتی فلگی در ارتقای بعدی جیتسی
 * عوض شد یک جا اصلاح شود.
 *
 * ⚠️ **با هدفون سیمی**. با خاموش بودن حذف اکو، بلندگوی باز فیدبک لوپ
 * می‌سازد. این باید در آنبوردینگ و چک‌لیست پیش از ورود گفته شود.
 *
 * ---
 *
 * **از کجا معلوم این نام‌ها درست‌اند؟** روی همان بیلدی که بالا آمده
 * (`jitsi/web:stable-11146`) بررسی شد، نه از روی حافظه:
 *
 *   ۱. `configOverwrite` از IFrame API به صورت پارامترهای `#config.*`
 *      منتقل می‌شود و جیتسی آن‌ها را از یک **فهرست سفید** رد می‌کند؛ هر
 *      کلید بیرون از فهرست بی‌صدا دور ریخته می‌شود. همه‌ی کلیدهای زیر در
 *      فهرست سفید همین بیلد هستند.
 *   ۲. `disableHPF` عمداً اینجا نیست: در این بیلد اصلاً وجود ندارد. در
 *      نسخه‌های قدیمی‌تر بود و کپی کردنش از راهنماهای قدیمی، کلیدِ مرده
 *      اضافه می‌کند.
 *   ۳. `enableOpusDtx` هم نیست: در فهرست سفید نیست، پس از این مسیر
 *      قابل تنظیم نیست. (DTX سکوت را قطع می‌کند و برای ساز هم نامطلوب
 *      است.)
 *   ۴. `stereo` و `opusMaxAverageBitrate` **سطح بالا** فرستاده نمی‌شوند.
 *      لایه‌ی سازگاری جیتسی اگر این دو را ببیند کل `audioQuality` را با
 *      شیئی دو‌کلیده بازنویسی می‌کند و بقیه‌ی کلیدها را می‌خورد.
 */

/**
 * در این بیلد، `disableAP` هر سه پردازش را با هم خاموش می‌کند:
 * `autoGainControl = !disableAGC && !disableAP` و همین شکل برای
 * `echoCancellation` و `noiseSuppression`. سه فلگ ریز هم کنارش می‌آیند
 * تا اگر روزی معنای `disableAP` عوض شد، نیت هر سه صریح مانده باشد.
 */
export interface MusicModeConfig {
  /** کل زنجیره‌ی پردازش صوتی مرورگر */
  disableAP: boolean;
  /** Acoustic Echo Cancellation */
  disableAEC: boolean;
  /** Noise Suppression */
  disableNS: boolean;
  /** Automatic Gain Control */
  disableAGC: boolean;
  /** هشدار «میکروفون شما نویز دارد» — با ساز همیشه اشتباه فعال می‌شود */
  enableNoisyMicDetection: boolean;
  /** هشدار «صدایی شنیده نمی‌شود» */
  enableNoAudioDetection: boolean;
  audioQuality: {
    stereo: boolean;
    /** بیت بر ثانیه */
    opusMaxAverageBitrate: number;
  };
}

/**
 * بیت‌ریت اوپوس، بر حسب بیت بر ثانیه.
 *
 * پیش‌فرض جیتسی برای گفتار حدود ۴۰ کیلوبیت است و هارمونیک‌های بالای ساز
 * را دور می‌ریزد. سقف خود اوپوس ۵۱۰ کیلوبیت است، ولی روی اینترنت خانگی
 * ایران آن عدد یعنی صدای بریده‌بریده — که از صدای کم‌کیفیت بدتر است.
 *
 * ۱۲۸ کیلوبیت استریو نقطه‌ی تعادل است: سه برابر پیش‌فرض، و در حد
 * فایل‌های موسیقی معمولی. اگر روی کیفیت شبکه‌ی واقعی کاربران داده جمع شد
 * و جا داشت، همین یک عدد بالا می‌رود.
 */
const OPUS_BITRATE = 128_000;

export const MUSIC_MODE: MusicModeConfig = Object.freeze({
  disableAP: true,
  disableAEC: true,
  disableNS: true,
  disableAGC: true,
  enableNoisyMicDetection: false,
  enableNoAudioDetection: false,
  audioQuality: Object.freeze({
    stereo: true,
    opusMaxAverageBitrate: OPUS_BITRATE,
  }),
}) as MusicModeConfig;
