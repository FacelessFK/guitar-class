ALTER TABLE "credit_entries" DROP CONSTRAINT "credit_amount_sign_matches_reason";--> statement-breakpoint
CREATE UNIQUE INDEX "credit_one_payment_recovery_per_order" ON "credit_entries" USING btree ("order_id") WHERE "credit_entries"."reason" = 'PAYMENT_RECOVERY';--> statement-breakpoint
ALTER TABLE "credit_entries" ADD CONSTRAINT "credit_amount_sign_matches_reason" CHECK (("credit_entries"."reason" = 'CANCELLATION' AND "credit_entries"."amount" > 0)
        OR ("credit_entries"."reason" = 'PAYMENT_RECOVERY' AND "credit_entries"."amount" > 0)
        OR ("credit_entries"."reason" = 'SPEND' AND "credit_entries"."amount" < 0)
        OR "credit_entries"."reason" = 'ADMIN_ADJUSTMENT');