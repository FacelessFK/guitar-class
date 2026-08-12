CREATE TYPE "public"."session_review_reason" AS ENUM('NO_SHOW_TEACHER', 'NO_SHOW');--> statement-breakpoint
CREATE TYPE "public"."session_review_status" AS ENUM('OPEN', 'RESOLVED');--> statement-breakpoint
CREATE TABLE "session_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" uuid NOT NULL,
	"reason" "session_review_reason" NOT NULL,
	"status" "session_review_status" DEFAULT 'OPEN' NOT NULL,
	"resolution" text,
	"resolved_by_id" uuid,
	"resolved_at" timestamp (3) with time zone,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "session_reviews_booking_id_unique" UNIQUE("booking_id")
);
--> statement-breakpoint
ALTER TABLE "session_reviews" ADD CONSTRAINT "session_reviews_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_reviews" ADD CONSTRAINT "session_reviews_resolved_by_id_users_id_fk" FOREIGN KEY ("resolved_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "session_reviews_status_idx" ON "session_reviews" USING btree ("status","created_at");--> statement-breakpoint
-- دستی اضافه شد: جلسه‌های برگزارنشده‌ای که پیش از وجود این جدول بسته شدند.
--
-- بدون این، صف از امروز پر می‌شود و هرچه پیش از این اتفاق افتاده تا ابد
-- نامرئی می‌ماند: جاروی بستن جلسه فقط سطرهایی را برمی‌گرداند که همان
-- اجرا بسته، پس هیچ‌وقت دوباره سراغ جلسه‌های قدیمی نمی‌رود. دقیقاً همان
-- داده‌ای که این صف برای دیده شدنش ساخته شد.
--
-- created_at از پایان جلسه گرفته می‌شود نه از now(): با now()، همه‌ی
-- پرونده‌های قدیمی هم‌سن می‌شوند و ترتیب «قدیمی‌ترین اول» در صف بی‌معنا.
INSERT INTO "session_reviews" ("booking_id", "reason", "created_at")
SELECT "id", "status"::text::"session_review_reason", "ends_at"
FROM "bookings"
WHERE "status" IN ('NO_SHOW_TEACHER', 'NO_SHOW')
ON CONFLICT ("booking_id") DO NOTHING;