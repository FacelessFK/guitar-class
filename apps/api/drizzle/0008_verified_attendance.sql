-- حضورِ تأییدشده‌ی سرور، کنار حضورِ گزارش‌شده‌ی کلاینت.
--
-- هیچ بک‌فیلی ندارد و عمدی است: جلسه‌های گذشته را هیچ سروری تأیید نکرده
-- و پر کردن این ستون‌ها از روی داده‌ی کلاینت یعنی همان داده‌ی جعل‌پذیر با
-- برچسب «تأییدشده». تهی ماندنشان حقیقت را می‌گوید و جاروی بستن جلسه
-- می‌داند با جلسه‌ی تأییدنشده چه کند.
--
-- `ADD VALUE` بدون `BEFORE`/`AFTER` مقدار را ته فهرست می‌گذارد. برای این
-- شمارشی مهم نیست (هیچ‌جا روی `session_review_reason` مرتب نمی‌شویم)، ولی
-- برای `booking_status` بود — مایگریشن ۰۰۰۳ به همین دلیل `BEFORE 'EXPIRED'`
-- دارد.
CREATE TYPE "public"."attendance_event" AS ENUM('JOINED', 'LEFT');--> statement-breakpoint
CREATE TYPE "public"."attendance_source" AS ENUM('CLIENT', 'SERVER_HOOK');--> statement-breakpoint
ALTER TYPE "public"."session_review_reason" ADD VALUE 'ATTENDANCE_UNVERIFIED';--> statement-breakpoint
CREATE TABLE "attendance_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"event" "attendance_event" NOT NULL,
	"source" "attendance_source" NOT NULL,
	"occurred_at" timestamp (3) with time zone NOT NULL,
	"reported_at" timestamp (3) with time zone,
	"occupant_jid" text,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "teacher_verified_at" timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "student_verified_at" timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "attendance_events" ADD CONSTRAINT "attendance_events_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_events" ADD CONSTRAINT "attendance_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "attendance_events_booking_idx" ON "attendance_events" USING btree ("booking_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "attendance_events_delivery_idx" ON "attendance_events" USING btree ("booking_id","user_id","event","reported_at") WHERE "attendance_events"."reported_at" IS NOT NULL;