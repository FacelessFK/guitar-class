# استقرار روی سرور

استقرار فعلی: **استیجینگ روی `hyggemode.com`**، کنار همان jitsi که
پلتفرم استفاده می‌کند.

`docs/deployment.md` می‌گوید *چه چیزی* لازم است. این فایل می‌گوید روی
**این سرور** چطور انجام می‌شود، چون یک محدودیت همه‌چیز را عوض می‌کند.

---

## محدودیتی که شکل کل کار را تعیین می‌کند

**سرور به اینترنت عمومی دسترسی خروجی ندارد.** نه گیت‌هاب، نه رجیستری
npm، نه Let's Encrypt — نه از میزبان و نه از داخل کانتینر. تنها چیزی که
باز است، میرور داکر (`mirror-docker.runflare.com`) است.

نتیجه‌ها:

- `git clone` و `pnpm install` روی سرور کار نمی‌کنند. **ایمیج‌ها روی
  ماشین توسعه ساخته و با `docker save` منتقل می‌شوند.**
- صدور گواهی با HTTP-01 هم شکست می‌خورد، ولی به دلیل معکوس: ورودی
  سرور از **بیرون ایران** بسته است، پس اعتبارسنج Let's Encrypt به
  `/.well-known/acme-challenge/` نمی‌رسد (`Timeout during connect`).
  تنها راه، DNS-01 است — همان کاری که `scripts/renew-jitsi-cert.sh`
  برای `class.hyggemode.com` می‌کند.

---

## نقشه‌ی سرور

| | |
|---|---|
| مسیر | `/home/fardin/music-platform/app` |
| پروژه‌ی کامپوز | `music-platform` (نامش صریح است — پوشه‌ی هم‌نام یک بار کانتینرهای پروژه‌ی دیگری را جایگزین کرد) |
| فرانت | `127.0.0.1:7341` |
| API | `127.0.0.1:7342` |
| پستگرس و ردیس | بدون پورت روی میزبان، فقط داخل شبکه‌ی کامپوز |
| nginx | `/etc/nginx/sites-available/music-platform` |
| jitsi پلتفرم | `/home/fardin/music-platform/jitsi` (پروژه‌ی `jitsi-class`) |

**یک مبدأ برای فرانت و API.** `hyggemode.com/api/*` به API می‌رود و
بقیه به Next. این تصمیم کوکی تازه‌سازی را از کلاس خرابیِ «دامنه‌ی
متفاوت، `SameSite=Lax`، نشست بی‌صدا می‌پرد» بیرون می‌برد — آن خرابی
اینجا اصلاً وجود ندارد.

راکت‌چت پیش از این روی همین دامنه بود و به `chat.hyggemode.com` منتقل
شد. پشتیبان کانفیگ قدیمی در `/root/nginx-backups/`.

---

## انتشار نسخه‌ی تازه

ترتیب اجباری است: **API پیش از بیلد فرانت** باید بالا باشد، چون بیلد
Next صفحات سئو را در همان لحظه `fetch` می‌کند.

```bash
# ۱. API
docker build -f deploy/api.Dockerfile -t music-api:staging .
docker save music-api:staging | gzip -1 > /tmp/music-api.tar.gz
scp /tmp/music-api.tar.gz SERVER:/tmp/
ssh SERVER 'docker load < /tmp/music-api.tar.gz && rm /tmp/music-api.tar.gz'

# ۲. مایگریشن — پیش از بالا آوردن API جدید
ssh SERVER 'cd /home/fardin/music-platform/app && \
  docker compose run --rm --entrypoint sh api -c \
  "cd /app/apps/api && node_modules/.bin/drizzle-kit migrate"'

ssh SERVER 'cd /home/fardin/music-platform/app && docker compose up -d api worker'

# ۳. فرانت — بیلد به API زنده نیاز دارد، پس از تونل ssh می‌رود
ssh -f -N -L 7342:127.0.0.1:7342 SERVER
docker build -f deploy/web.Dockerfile \
  --network=host \
  --build-arg NEXT_PUBLIC_API_URL=https://hyggemode.com/api \
  --build-arg NEXT_PUBLIC_SITE_URL=https://hyggemode.com \
  --build-arg API_INTERNAL_URL=http://127.0.0.1:7342/api \
  -t music-web:staging .
docker save music-web:staging | gzip -1 > /tmp/music-web.tar.gz
scp /tmp/music-web.tar.gz SERVER:/tmp/
ssh SERVER 'docker load < /tmp/music-web.tar.gz && rm /tmp/music-web.tar.gz && \
  cd /home/fardin/music-platform/app && docker compose up -d web'
```

⚠️ `NEXT_PUBLIC_*` در **زمان بیلد** داخل باندل می‌نشینند. عوض کردنشان در
`.env` سرور هیچ اثری ندارد.

⚠️ `API_INTERNAL_URL` عمداً از `NEXT_PUBLIC_API_URL` جداست: رندر سمت
سرور از شبکه‌ی داخلی داکر به API می‌رود (`http://api:4000/api`) و
مرورگر از دامنه‌ی عمومی. رفتن سمت سرور از راه دامنه‌ی عمومی یعنی
درخواست از کانتینر بیرون برود و برگردد — با سه شکستِ ممکن که هیچ‌کدام
ربطی به برنامه ندارند: گواهی TLS، برگشت DNS، و باز بودن مسیر از بیرون.

---

## هوک حضور جیتسی

```bash
./scripts/install-jitsi-attendance-hook.sh          # نصب یا به‌روزرسانی
./scripts/install-jitsi-attendance-hook.sh --check  # فقط گزارش
```

رویدادها از **شبکه‌ی داخلی داکر** می‌روند: کانتینر API به شبکه‌ی
`jitsi-class_default` هم وصل است و prosody با
`http://api:4000/api/classroom/hook` صدایش می‌زند. راز مشترک از همان
`.env`ی خوانده می‌شود که خودِ API با آن بالا آمده.

⚠️ **دو نکته که اگر جا بیفتند، حضور بی‌صدا تأییدنشده می‌ماند:**

۱. `muc_component` باید `muc.meet.jitsi` باشد، نه `conference.meet.jitsi`.
   نصب داکری این‌طور است و ماژول با نام اشتباه **بدون خطا** لود می‌شود و
   روی هیچ اتاقی قلاب نمی‌زند. اسکریپت مقدار را از `.env` خود jitsi
   می‌خواند تا حدس زده نشود.
۲. `/config` و `/prosody-plugins-custom` روی این نصب **ولوم ناشناس**‌اند.
   `restart` و `up -d` حفظشان می‌کنند ولی `--renew-anon-volumes` و
   `down -v` پاکشان می‌کنند. بعد از هر بازسازی prosody، اسکریپت را
   دوباره اجرا کنید — بی‌ضرر و تکرارپذیر است.

---

## آنچه در این استقرار **واقعی نیست**

`NODE_ENV=staging` است، نه `production` — و عمداً: کلید کاوه‌نگار،
مرچنت‌آی‌دی زرین‌پال و باکت S3 هنوز وجود ندارند و اعتبارسنجی محیط با
`production` اجازه‌ی بالا آمدن نمی‌دهد. یعنی:

| | |
|---|---|
| پیامک | آداپتور کنسول — **کد ورود در لاگ API است**، نه روی موبایل |
| پرداخت | درگاه جعلی — رزرو **بدون پول واقعی** قطعی می‌شود |
| فایل | ذخیره‌سازی درون‌حافظه‌ای — آپلود با هر ری‌استارت می‌پرد |
| کوکی | `secure` ندارد (چون تولید نیست) |

خواندن کد ورود:

```bash
ssh SERVER 'cd /home/fardin/music-platform/app && docker compose logs api --tail 50 | grep -i "کد ورود"'
```

با آمدن هر کدام از این سه، همان متغیر در `.env` سرور پر می‌شود و
`NODE_ENV=production` می‌شود — و از آن لحظه، نبودِ هر کدام جلوی بالا
آمدن را می‌گیرد به‌جای اینکه بی‌صدا به آداپتور جعلی برگردد.

---

## گواهی TLS

گواهی Let's Encrypt برای `hyggemode.com`، `www` و `chat` صادر و نصب شده
(تا ۱۱ نوامبر ۲۰۲۶). صدور روی **ماشین توسعه** انجام می‌شود، نه سرور:
سرور نه به Let's Encrypt می‌رسد (خروجی بسته) و نه اعتبارسنجِ آن به
سرور (ورودی از بیرون ایران بسته)، پس HTTP-01 از هر دو طرف ناممکن است.

تمدید — هر ~۶۰ روز، همان مسیر گواهی `class`:

```bash
# ۱. مقدارهای TXT را می‌گیرد و متوقف می‌شود
~/.acme.sh/acme.sh --issue --dns -d hyggemode.com -d www.hyggemode.com \
  -d chat.hyggemode.com --server letsencrypt \
  --yes-I-know-dns-manual-mode-enough-go-ahead-please

# ۲. سه رکورد TXT در پنل آروان (نام‌های نسبی):
#    _acme-challenge  ·  _acme-challenge.www  ·  _acme-challenge.chat
#    انتشارشان را پیش از قدم بعد بررسی کنید — تلاش ناموفق سهمیه
#    می‌سوزاند (پنج شکست در ساعت برای هر نام):
#    dig +short TXT _acme-challenge.hyggemode.com @1.1.1.1

# ۳. تمام کردن صدور
~/.acme.sh/acme.sh --renew --dns -d hyggemode.com -d www.hyggemode.com \
  -d chat.hyggemode.com --server letsencrypt \
  --yes-I-know-dns-manual-mode-enough-go-ahead-please

# ۴. نصب
scp ~/.acme.sh/hyggemode.com_ecc/fullchain.cer \
    SERVER:/etc/nginx/ssl/music/fullchain.pem
scp ~/.acme.sh/hyggemode.com_ecc/hyggemode.com.key \
    SERVER:/etc/nginx/ssl/music/privkey.pem
ssh SERVER 'chmod 600 /etc/nginx/ssl/music/privkey.pem && \
            nginx -t && systemctl reload nginx'
```

⚠️ **رکورد A صریح برای `www` و `chat` لازم است و حذف نشود.** به محض
اینکه `_acme-challenge.www.hyggemode.com` ساخته شود، نام
`www.hyggemode.com` در درخت DNS «موجود» می‌شود و وایلدکارد
`*.hyggemode.com` دیگر پوششش نمی‌دهد — همان چیزی که یک بار سرِ
`class.hyggemode.com` اتفاق افتاد و به شکل «گواهی صادر شد ولی دامنه
resolve نمی‌شود» دیده شد (سند معماری، بخش ۶.۲.۲). خودِ دامنه‌ی اصلی
این مشکل را ندارد؛ وایلدکارد اصلاً apex را پوشش نمی‌دهد.

ℹ️ **`chat` از آروان‌کلاد رد می‌شود، نه مستقیم.** رکوردش با «ابر» روشن
ساخته شده، پس TLS را آروان تمام می‌کند و گواهیِ ما روی آن نام عملاً
استفاده نمی‌شود. کار می‌کند، ولی راکت‌چت وب‌سوکت‌محور است؛ اگر روزی
قطع و وصل شد، اولین چیزی که باید امتحان شود خاموش کردن ابر برای همین
رکورد است تا مستقیم به سرور بیاید.
