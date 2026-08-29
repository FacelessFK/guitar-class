ALTER TABLE "credit_entries" DROP CONSTRAINT "credit_amount_sign_matches_reason";--> statement-breakpoint
DROP INDEX "credit_one_cancellation_per_booking";--> statement-breakpoint
DROP INDEX "credit_one_spend_per_order";--> statement-breakpoint
ALTER TYPE "public"."credit_reason" RENAME TO "credit_reason_old";--> statement-breakpoint
CREATE TYPE "public"."credit_reason" AS ENUM('CANCELLATION', 'PAYMENT_RECOVERY', 'SPEND', 'ADMIN_ADJUSTMENT');--> statement-breakpoint
ALTER TABLE "credit_entries" ALTER COLUMN "reason" TYPE "public"."credit_reason" USING "reason"::text::"public"."credit_reason";--> statement-breakpoint
DROP TYPE "public"."credit_reason_old";--> statement-breakpoint
CREATE UNIQUE INDEX "credit_one_cancellation_per_booking" ON "credit_entries" USING btree ("booking_id") WHERE "credit_entries"."reason" = 'CANCELLATION';--> statement-breakpoint
CREATE UNIQUE INDEX "credit_one_spend_per_order" ON "credit_entries" USING btree ("order_id") WHERE "credit_entries"."reason" = 'SPEND';--> statement-breakpoint
ALTER TABLE "credit_entries" ADD CONSTRAINT "credit_amount_sign_matches_reason" CHECK (("credit_entries"."reason" = 'CANCELLATION' AND "credit_entries"."amount" > 0)
        OR ("credit_entries"."reason" = 'SPEND' AND "credit_entries"."amount" < 0)
        OR "credit_entries"."reason" = 'ADMIN_ADJUSTMENT');
