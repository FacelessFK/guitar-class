/**
 * Tailwind 4 از طریق پلاگین PostCSS اختصاصی‌اش بار می‌شود و دیگر فایل
 * `tailwind.config.js` لازم ندارد — تنظیمات در خود CSS با `@theme`
 * تعریف می‌شوند (`src/app/globals.css`).
 */
export default {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};
