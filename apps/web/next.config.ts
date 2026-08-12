import type { NextConfig } from "next";

/**
 * تنظیمات Next.js.
 *
 * `@music/shared` به‌صورت TypeScript خام منتشر می‌شود (بدون مرحله‌ی
 * بیلد، مثل کاری که `apps/api` می‌کند)، پس Next باید صریحاً ترنسپایلش
 * کند وگرنه در بیلد به `import` از فایل `.ts` بیرون از این پکیج گیر
 * می‌کند.
 *
 * ⚠️ به همین دلیل، import‌های **داخلِ** آن پکیج باید بدون پسوند باشند.
 * فرم `from "./time.js"` برای اجرای مستقیم TypeScript در نود لازم بود
 * و در تست‌ها و در خودِ API هم کار می‌کند، ولی Turbopack دنبال فایلی
 * به نام `time.js` می‌گردد که وجود ندارد و بیلد را با
 * «Module not found» رد می‌کند. بدون پسوند، هر چهار مصرف‌کننده —
 * نود، ویتست، tsc و Turbopack — یک جور حلش می‌کنند.
 */
const nextConfig: NextConfig = {
  transpilePackages: ["@music/shared"],

  // خروجی standalone برای دیپلوی داکری بدون node_modules کامل
  output: "standalone",

  typedRoutes: true,
};

export default nextConfig;
