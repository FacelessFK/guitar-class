ALTER TYPE "public"."booking_status" ADD VALUE 'NO_SHOW' BEFORE 'EXPIRED';--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "teacher_joined_at" timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "student_joined_at" timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "booking_id" uuid;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bookings_session_close_idx" ON "bookings" USING btree ("status","ends_at");--> statement-breakpoint
CREATE INDEX "bookings_reminder_idx" ON "bookings" USING btree ("status","scheduled_at");--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_one_refund_per_booking" ON "ledger_entries" USING btree ("booking_id") WHERE "ledger_entries"."type" = 'REFUND';--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_once_per_booking" ON "notifications" USING btree ("booking_id","user_id","type") WHERE "notifications"."booking_id" IS NOT NULL;