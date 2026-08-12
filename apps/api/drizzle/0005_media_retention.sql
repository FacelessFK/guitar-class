-- سیاست نگه‌داری فایل: کلید آبجکت به‌عنوان هویت فایل، و ردِ پاک‌سازی.
--
-- تا امروز فقط نشانی فایل ذخیره می‌شد. برای جاروی پاک‌سازی کافی نیست:
-- نشانی از S3_PUBLIC_BASE_URL ساخته می‌شود و آن مقدار عوض می‌شود (باکت
-- پشت CDN می‌رود، سبک میزبان از زیردامنه‌ای به مسیری می‌رود). هر کلیدی
-- که بعداً از روی نشانی درآورده شود اشتباه است، و جارو یا هیچ‌چیز پاک
-- نمی‌کند یا چیز اشتباهی.
--
-- ستون‌ها اول nullable اضافه می‌شوند، از روی نشانی پر می‌شوند، و بعد
-- NOT NULL می‌گیرند. شکل تولیدشده‌ی drizzle مستقیم NOT NULL می‌گذاشت که
-- روی هر جدولِ دارای سطر شکست می‌خورد.

ALTER TABLE "feedbacks" ADD COLUMN "voice_object_key" varchar(300);--> statement-breakpoint
ALTER TABLE "feedbacks" ADD COLUMN "voice_purged_at" timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "submissions" ADD COLUMN "object_key" varchar(300);--> statement-breakpoint
ALTER TABLE "submissions" ADD COLUMN "media_purged_at" timestamp (3) with time zone;--> statement-breakpoint

-- پر کردن از روی نشانی موجود.
--
-- کلید همیشه با پیشوند مقصدش شروع می‌شود (`buildObjectKey`)، و نشانی
-- همیشه «پایه + / + کلید» است. پس بریدن از اولین جای پیشوند، کلید را
-- برمی‌گرداند — هم برای نشانی توسعه (`/api/media/dev/...`) و هم برای
-- نشانی واقعی S3.
--
-- عمداً COALESCE ندارد: سطری که الگو نگیرد، NOT NULL پایین را می‌شکند و
-- مایگریشن بلند شکست می‌خورد. نوشتن یک کلید ساختگی به‌جایش یعنی جارو
-- بعدها سراغ آبجکتی برود که وجود ندارد و خرابی بی‌صدا بماند.
UPDATE "submissions"
   SET "object_key" = substring("media_url" from '(submissions/.*)$');--> statement-breakpoint

UPDATE "feedbacks"
   SET "voice_object_key" = substring("voice_note_url" from '(feedback/.*)$')
 WHERE "voice_note_url" IS NOT NULL;--> statement-breakpoint

ALTER TABLE "submissions" ALTER COLUMN "object_key" SET NOT NULL;--> statement-breakpoint

-- جدول ضبط جلسه هنوز هیچ تولیدکننده‌ای ندارد و همیشه خالی است، پس
-- مستقیم NOT NULL می‌گیرد.
ALTER TABLE "recordings" ADD COLUMN "object_key" varchar(300) NOT NULL;--> statement-breakpoint

-- یک تسویه به ازای هر استاد و هر دوره — جاروی ماهانه به این تکیه
-- می‌کند. بررسیِ «قبلاً هست؟» در کد کافی نیست: دو اجرای هم‌زمان هر دو
-- خالی بودن را می‌بینند، و نتیجه‌اش دو برابر پرداختن به استاد است.
CREATE UNIQUE INDEX "payouts_one_per_teacher_period" ON "payouts" USING btree ("teacher_id","period_start","period_end");--> statement-breakpoint

-- جاروی پاک‌سازی روی همین ایندکس کار می‌کند: «پاک‌نشده و قدیمی‌تر از
-- فلان تاریخ». بدون آن هر شب کل جدول اسکن می‌شود.
CREATE INDEX "submissions_retention_idx" ON "submissions" USING btree ("media_purged_at","created_at");
