DROP INDEX "orders_gateway_authority_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_one_earning_per_booking" ON "ledger_entries" USING btree ("booking_id") WHERE "ledger_entries"."type" = 'EARNING';--> statement-breakpoint
CREATE UNIQUE INDEX "orders_gateway_authority_key" ON "orders" USING btree ("gateway_authority");