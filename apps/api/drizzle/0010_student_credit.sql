-- اعتبار هنرجو — نیمه‌ی اجرانشده‌ی سیاست لغو.
--
-- تا امروز لغو فقط سمت استاد اثر داشت: یک سطر منفی در دفتر کل که سهم
-- استاد را برمی‌گرداند. هنرجویی که سه روز قبل لغو می‌کرد، پولش نزد
-- پلتفرم می‌ماند بی‌آنکه راهی برای خرج کردنش داشته باشد.
--
-- `credit_entries` دفتر کلِ سمت هنرجوست و با `ledger_entries` جمع
-- نمی‌شود: آن یکی بدهی به استاد است، این بدهی به هنرجو. موجودی جمع ساده‌ی
-- `amount` است و `users.credit_balance` فقط کشِ همان جمع — که در هر
-- تغییر از نو از روی `SUM` نوشته می‌شود، نه با افزودن به مقدار قبلی.
--
-- سه ستون بک‌فیل ندارند: هیچ لغوی پیش از این مایگریشن اعتبار نساخته و
-- صفر بودن موجودی برای همه‌ی حساب‌های موجود دقیقاً درست است.
CREATE TYPE "public"."credit_reason" AS ENUM('CANCELLATION', 'SPEND', 'ADMIN_ADJUSTMENT');--> statement-breakpoint
CREATE TABLE "credit_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid NOT NULL,
	"reason" "credit_reason" NOT NULL,
	"amount" bigint NOT NULL,
	"booking_id" uuid,
	"order_id" uuid,
	"created_by_id" uuid,
	"description" varchar(200) NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "credit_amount_not_zero" CHECK ("credit_entries"."amount" <> 0),
	CONSTRAINT "credit_amount_sign_matches_reason" CHECK (("credit_entries"."reason" = 'CANCELLATION' AND "credit_entries"."amount" > 0)
        OR ("credit_entries"."reason" = 'SPEND' AND "credit_entries"."amount" < 0)
        OR "credit_entries"."reason" = 'ADMIN_ADJUSTMENT')
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "credit_balance" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "credit_applied" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "credit_entries" ADD CONSTRAINT "credit_entries_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_entries" ADD CONSTRAINT "credit_entries_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_entries" ADD CONSTRAINT "credit_entries_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_entries" ADD CONSTRAINT "credit_entries_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "credit_student_created_idx" ON "credit_entries" USING btree ("student_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "credit_one_cancellation_per_booking" ON "credit_entries" USING btree ("booking_id") WHERE "credit_entries"."reason" = 'CANCELLATION';--> statement-breakpoint
CREATE UNIQUE INDEX "credit_one_spend_per_order" ON "credit_entries" USING btree ("order_id") WHERE "credit_entries"."reason" = 'SPEND';--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_credit_balance_not_negative" CHECK ("users"."credit_balance" >= 0);--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_credit_applied_within_amount" CHECK ("orders"."credit_applied" >= 0 AND "orders"."credit_applied" <= "orders"."amount");