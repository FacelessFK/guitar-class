# ایمیج API و وُرکر — یک ایمیج، دو پروسه.
#
# ⚠️ این ایمیج **روی ماشین توسعه** ساخته می‌شود و با `docker save` به
# سرور می‌رود. سرور به رجیستری npm و گیت‌هاب دسترسی ندارد (فقط میرور
# داکر باز است)، پس `pnpm install` آنجا شکست می‌خورد. مسیر انتشار در
# `deploy/README.md` است.
#
# کد تایپ‌اسکریپت **کامپایل نمی‌شود** و با `@swc-node/register` همان‌طور
# اجرا می‌شود که `pnpm --filter @music/api start` اجرایش می‌کند — یعنی
# دقیقاً همان مسیری که تست و توسعه رویش رفته‌اند. برای همین
# devDependencies هم نصب می‌شوند: `@swc-node/register` و `drizzle-kit`
# (برای مایگریشن) هر دو آنجا هستند.

FROM node:24-slim AS deps

# corepack نسخه‌ی pnpm را از `packageManager` در package.json می‌خواند،
# پس نسخه اینجا تکرار نمی‌شود که از هم بیفتند.
RUN corepack enable

WORKDIR /app

# فقط مانیفست‌ها کپی می‌شوند تا لایه‌ی نصب تا وقتی وابستگی‌ها عوض نشده‌اند
# در کش بماند. کپی کردن کل سورس پیش از نصب یعنی هر تغییر کد،
# دوباره‌نصبِ کامل.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY packages/shared/package.json packages/shared/

# فقط وابستگی‌های API و پکیج مشترک. بدون این فیلتر، وابستگی‌های
# فرانت‌اند (که در این ایمیج هیچ استفاده‌ای ندارند) هم نصب می‌شوند.
RUN --mount=type=cache,id=pnpm-store,target=/pnpm-store \
    pnpm config set store-dir /pnpm-store && \
    pnpm install --frozen-lockfile --filter @music/api... --filter @music/shared...

FROM node:24-slim AS runtime

RUN corepack enable

WORKDIR /app

ENV NODE_ENV=production \
    TZ=UTC

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules

# ⚠️ `tsconfig.base.json` هم لازم است. `@swc-node/register` هنگام اجرا
# زنجیره‌ی `extends` را دنبال می‌کند و بدون فایل ریشه، اولین `import`
# نسبی با «Tsconfig not found» می‌شکند — خطایی که ربطش به کانفیگ
# تایپ‌اسکریپت از متنش پیدا نیست.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/api apps/api

# پروسه‌ی پیش‌فرض API است؛ وُرکر همین ایمیج را با دستور دیگری بالا
# می‌آورد. **دو پروسه‌ی جدا** و نه یکی — سند استقرار بخش ۴.
#
# `--env-file-if-exists` عمداً استفاده نمی‌شود: در داکر، محیط از
# `env_file` کامپوز می‌آید و فایلی داخل ایمیج نیست.
WORKDIR /app/apps/api

EXPOSE 4000

CMD ["node", "--import", "@swc-node/register/esm-register", "src/main.ts"]
