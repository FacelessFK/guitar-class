import type { NextConfig } from "next";

/**
 * تنظیمات Next.js.
 *
 * `@music/shared` به‌صورت TypeScript خام منتشر می‌شود (بدون مرحله‌ی
 * بیلد، مثل کاری که `apps/api` می‌کند)، پس Next باید صریحاً ترنسپایلش
 * کند وگرنه در بیلد به `import` از فایل `.ts` بیرون از این پکیج گیر
 * می‌کند.
 */
const nextConfig: NextConfig = {
  transpilePackages: ["@music/shared"],

  // خروجی standalone برای دیپلوی داکری بدون node_modules کامل
  output: "standalone",

  typedRoutes: true,
};

export default nextConfig;
