DROP INDEX "notifications_once_per_booking";--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "read_at" timestamp (3) with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_once_per_booking" ON "notifications" USING btree ("booking_id","user_id","type") WHERE "notifications"."booking_id" IS NOT NULL AND "notifications"."type" LIKE 'SESSION_REMINDER%';