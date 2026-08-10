import { defineConfig } from "vitest/config";

export default defineConfig({
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
