# ایمیج فرانت‌اند.
#
# ⚠️ **بیلد به API بالا و در دسترس نیاز دارد.** صفحات سئو در زمان بیلد
# `fetch` می‌کنند و شکست fetch عمداً بیلد را می‌شکند (سند استقرار بخش
# ۸). یعنی ترتیب انتشار اجباری است: اول API روی سرور بالا بیاید، بعد
# این ایمیج ساخته شود.
#
# ⚠️ `NEXT_PUBLIC_*` در **زمان بیلد** داخل باندل می‌نشینند. عوض کردنشان
# در کامپوز هیچ اثری ندارد؛ باید دوباره بیلد گرفت. برای همین `ARG`اند و
# نه فقط متغیر محیطیِ زمان اجرا.

FROM node:24-slim AS builder

RUN corepack enable

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/

RUN --mount=type=cache,id=pnpm-store,target=/pnpm-store \
    pnpm config set store-dir /pnpm-store && \
    pnpm install --frozen-lockfile --filter @music/web... --filter @music/shared...

COPY packages/shared packages/shared
COPY apps/web apps/web

ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_SITE_URL

# آدرسی که **بیلد** برای گرفتن داده‌ی کاتالوگ استفاده می‌کند.
#
# جدا از آدرس عمومی است چون بیلد روی ماشین توسعه اجرا می‌شود و از آنجا
# API فقط از راه تونل ssh در دسترس است. آدرس عمومی همچنان همان چیزی
# است که در باندل مرورگر می‌نشیند.
ARG API_INTERNAL_URL

ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL \
    API_INTERNAL_URL=$API_INTERNAL_URL \
    NEXT_TELEMETRY_DISABLED=1

RUN pnpm --filter @music/web build

FROM node:24-slim AS runtime

WORKDIR /app

ENV NODE_ENV=production \
    TZ=UTC \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# خروجی standalone خودش node_modulesِ لازم را همراه دارد، پس اینجا
# نصبی انجام نمی‌شود. ساختار مونوریپو در standalone حفظ می‌شود، یعنی
# سرور در `apps/web/server.js` می‌نشیند نه در ریشه.
COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static

# `apps/web/public` وجود ندارد و عمداً کپی نمی‌شود: خط `COPY` برای مسیر
# نبوده بیلد را می‌شکند. اگر روزی فایل ثابتی اضافه شد، باید برگردد.

EXPOSE 3000

# ⚠️ `next start` کار نمی‌کند چون خروجی standalone است — سند استقرار
# بخش ۸.
CMD ["node", "apps/web/server.js"]
