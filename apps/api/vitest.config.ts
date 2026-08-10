import swc from "unplugin-swc";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    /**
     * ترنسفورم با SWC به‌جای esbuild پیش‌فرض ویتست.
     *
     * تزریق وابستگی نست به فراداده‌ی `design:paramtypes` تکیه دارد که
     * `emitDecoratorMetadata` تولیدش می‌کند — و **esbuild از آن پشتیبانی
     * نمی‌کند**. بدون این پلاگین، نست فکر می‌کند کنترلرها هیچ وابستگی
     * ندارند و آن‌ها را بدون آرگومان می‌سازد، پس سرویس‌ها در زمان اجرا
     * `undefined` می‌شوند — بدون هیچ خطای راه‌اندازی.
     *
     * سرور واقعی این مشکل را ندارد چون از `@swc-node/register` استفاده
     * می‌کند. این تنظیم فقط محیط تست را با آن هم‌تراز می‌کند.
     */
    swc.vite({
      module: { type: "es6" },
      jsc: {
        target: "es2023",
        parser: { syntax: "typescript", decorators: true },
        transform: { legacyDecorator: true, decoratorMetadata: true },
        keepClassNames: true,
      },
    }),
  ],
  test: {
    setupFiles: ["./src/test/setup.ts"],
    /**
     * تست‌های یکپارچگی روی یک دیتابیس مشترک کار می‌کنند و بین تست‌ها
     * جدول‌ها را خالی می‌کنند. اجرای موازی فایل‌ها باعث می‌شود یکی
     * داده‌ی دیگری را زیر پایش پاک کند.
     */
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 20_000,
  },
});
