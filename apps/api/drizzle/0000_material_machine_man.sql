CREATE TYPE "public"."assignment_status" AS ENUM('ASSIGNED', 'SUBMITTED', 'REVIEWED');--> statement-breakpoint
CREATE TYPE "public"."booking_status" AS ENUM('PENDING_PAYMENT', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED_BY_STUDENT', 'CANCELLED_BY_TEACHER', 'NO_SHOW_STUDENT', 'NO_SHOW_TEACHER', 'EXPIRED');--> statement-breakpoint
CREATE TYPE "public"."booking_type" AS ENUM('TRIAL', 'SINGLE', 'PACKAGE');--> statement-breakpoint
CREATE TYPE "public"."enrollment_status" AS ENUM('PENDING_PAYMENT', 'ACTIVE', 'COMPLETED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."exception_type" AS ENUM('BLOCK', 'EXTRA');--> statement-breakpoint
CREATE TYPE "public"."ledger_type" AS ENUM('EARNING', 'REFUND', 'PAYOUT', 'ADJUSTMENT');--> statement-breakpoint
CREATE TYPE "public"."media_type" AS ENUM('AUDIO', 'VIDEO');--> statement-breakpoint
CREATE TYPE "public"."notification_channel" AS ENUM('SMS', 'IN_APP');--> statement-breakpoint
CREATE TYPE "public"."notification_status" AS ENUM('PENDING', 'SENT', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('PENDING', 'PAID', 'FAILED', 'REFUNDED');--> statement-breakpoint
CREATE TYPE "public"."payout_status" AS ENUM('PENDING', 'PAID');--> statement-breakpoint
CREATE TYPE "public"."recording_status" AS ENUM('PROCESSING', 'READY', 'EXPIRED', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."skill_level" AS ENUM('BEGINNER', 'INTERMEDIATE', 'ADVANCED');--> statement-breakpoint
CREATE TYPE "public"."teacher_status" AS ENUM('PENDING', 'APPROVED', 'SUSPENDED');--> statement-breakpoint
CREATE TYPE "public"."user_status" AS ENUM('ACTIVE', 'SUSPENDED');--> statement-breakpoint
CREATE TABLE "refresh_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" varchar(128) NOT NULL,
	"user_agent" varchar(300),
	"expires_at" timestamp (3) with time zone NOT NULL,
	"revoked_at" timestamp (3) with time zone,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "refresh_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"phone" varchar(15) NOT NULL,
	"full_name" varchar(120) NOT NULL,
	"avatar_url" varchar(500),
	"is_admin" boolean DEFAULT false NOT NULL,
	"status" "user_status" DEFAULT 'ACTIVE' NOT NULL,
	"trial_used_at" timestamp (3) with time zone,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_phone_unique" UNIQUE("phone")
);
--> statement-breakpoint
CREATE TABLE "instruments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" varchar(80) NOT NULL,
	"name_fa" varchar(80) NOT NULL,
	"description_fa" text,
	"icon_url" varchar(500),
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "instruments_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "offerings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"teacher_id" uuid NOT NULL,
	"instrument_id" uuid NOT NULL,
	"price" bigint NOT NULL,
	"duration_minutes" integer DEFAULT 60 NOT NULL,
	"levels" "skill_level"[] DEFAULT '{}' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "offerings_teacher_instrument_unique" UNIQUE("teacher_id","instrument_id"),
	CONSTRAINT "offerings_price_positive" CHECK ("offerings"."price" > 0),
	CONSTRAINT "offerings_duration_positive" CHECK ("offerings"."duration_minutes" > 0)
);
--> statement-breakpoint
CREATE TABLE "teacher_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"slug" varchar(80) NOT NULL,
	"headline" varchar(160) NOT NULL,
	"bio" text,
	"intro_video_url" varchar(500),
	"years_experience" integer DEFAULT 0 NOT NULL,
	"status" "teacher_status" DEFAULT 'PENDING' NOT NULL,
	"commission_rate" numeric(5, 2) DEFAULT '20' NOT NULL,
	"buffer_minutes" integer DEFAULT 15 NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "teacher_profiles_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "teacher_profiles_slug_unique" UNIQUE("slug"),
	CONSTRAINT "teacher_profiles_commission_range" CHECK ("teacher_profiles"."commission_rate" >= 0 AND "teacher_profiles"."commission_rate" <= 100),
	CONSTRAINT "teacher_profiles_buffer_positive" CHECK ("teacher_profiles"."buffer_minutes" >= 0)
);
--> statement-breakpoint
CREATE TABLE "availability_exceptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"teacher_id" uuid NOT NULL,
	"date" date NOT NULL,
	"type" "exception_type" NOT NULL,
	"start_minute" integer,
	"end_minute" integer,
	"reason" varchar(200),
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "availability_exceptions_valid_window" CHECK (("availability_exceptions"."start_minute" IS NULL AND "availability_exceptions"."end_minute" IS NULL)
          OR ("availability_exceptions"."start_minute" >= 0 AND "availability_exceptions"."end_minute" <= 1440 AND "availability_exceptions"."start_minute" < "availability_exceptions"."end_minute")),
	CONSTRAINT "availability_exceptions_extra_needs_time" CHECK ("availability_exceptions"."type" <> 'EXTRA' OR "availability_exceptions"."start_minute" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "availability_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"teacher_id" uuid NOT NULL,
	"weekday" integer NOT NULL,
	"start_minute" integer NOT NULL,
	"end_minute" integer NOT NULL,
	"valid_from" date NOT NULL,
	"valid_until" date,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "availability_rules_valid_weekday" CHECK ("availability_rules"."weekday" BETWEEN 0 AND 6),
	CONSTRAINT "availability_rules_valid_window" CHECK ("availability_rules"."start_minute" >= 0 AND "availability_rules"."end_minute" <= 1440 AND "availability_rules"."start_minute" < "availability_rules"."end_minute"),
	CONSTRAINT "availability_rules_valid_range" CHECK ("availability_rules"."valid_until" IS NULL OR "availability_rules"."valid_until" >= "availability_rules"."valid_from")
);
--> statement-breakpoint
CREATE TABLE "bookings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid NOT NULL,
	"teacher_id" uuid NOT NULL,
	"offering_id" uuid NOT NULL,
	"enrollment_id" uuid,
	"session_index" integer,
	"type" "booking_type" NOT NULL,
	"scheduled_at" timestamp (3) with time zone NOT NULL,
	"duration_minutes" integer NOT NULL,
	"ends_at" timestamp (3) with time zone NOT NULL,
	"status" "booking_status" DEFAULT 'PENDING_PAYMENT' NOT NULL,
	"hold_expires_at" timestamp (3) with time zone,
	"price_snapshot" bigint NOT NULL,
	"commission_snapshot" numeric(5, 2) NOT NULL,
	"room_id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"actual_started_at" timestamp (3) with time zone,
	"actual_ended_at" timestamp (3) with time zone,
	"cancelled_at" timestamp (3) with time zone,
	"cancelled_by_id" uuid,
	"cancellation_reason" text,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bookings_room_id_unique" UNIQUE("room_id"),
	CONSTRAINT "bookings_duration_positive" CHECK ("bookings"."duration_minutes" > 0),
	CONSTRAINT "bookings_price_non_negative" CHECK ("bookings"."price_snapshot" >= 0),
	CONSTRAINT "bookings_package_fields_consistent" CHECK (("bookings"."type" = 'PACKAGE' AND "bookings"."enrollment_id" IS NOT NULL AND "bookings"."session_index" IS NOT NULL)
          OR ("bookings"."type" <> 'PACKAGE' AND "bookings"."enrollment_id" IS NULL AND "bookings"."session_index" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "enrollments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid NOT NULL,
	"offering_id" uuid NOT NULL,
	"sessions_total" integer DEFAULT 4 NOT NULL,
	"weekday" integer NOT NULL,
	"start_minute" integer NOT NULL,
	"start_date" date NOT NULL,
	"price_total" bigint NOT NULL,
	"status" "enrollment_status" DEFAULT 'PENDING_PAYMENT' NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "enrollments_valid_weekday" CHECK ("enrollments"."weekday" BETWEEN 0 AND 6),
	CONSTRAINT "enrollments_sessions_positive" CHECK ("enrollments"."sessions_total" > 0)
);
--> statement-breakpoint
CREATE TABLE "ledger_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" "ledger_type" NOT NULL,
	"order_id" uuid,
	"booking_id" uuid,
	"teacher_id" uuid,
	"gross_amount" bigint NOT NULL,
	"commission" bigint NOT NULL,
	"net_amount" bigint NOT NULL,
	"description" varchar(200) NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ledger_amounts_balance" CHECK ("ledger_entries"."gross_amount" = "ledger_entries"."commission" + "ledger_entries"."net_amount")
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"booking_id" uuid,
	"enrollment_id" uuid,
	"amount" bigint NOT NULL,
	CONSTRAINT "order_items_exactly_one_target" CHECK (("order_items"."booking_id" IS NOT NULL) <> ("order_items"."enrollment_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid NOT NULL,
	"amount" bigint NOT NULL,
	"status" "order_status" DEFAULT 'PENDING' NOT NULL,
	"gateway" varchar(40) NOT NULL,
	"gateway_authority" varchar(120),
	"gateway_ref_id" varchar(120),
	"paid_at" timestamp (3) with time zone,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orders_amount_positive" CHECK ("orders"."amount" > 0)
);
--> statement-breakpoint
CREATE TABLE "payouts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"teacher_id" uuid NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"amount" bigint NOT NULL,
	"status" "payout_status" DEFAULT 'PENDING' NOT NULL,
	"paid_at" timestamp (3) with time zone,
	"tracking_code" varchar(120),
	"note" text,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payouts_period_ordered" CHECK ("payouts"."period_end" >= "payouts"."period_start")
);
--> statement-breakpoint
CREATE TABLE "assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" uuid NOT NULL,
	"title" varchar(160) NOT NULL,
	"description" text,
	"attachments" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"due_date" date,
	"status" "assignment_status" DEFAULT 'ASSIGNED' NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feedbacks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"submission_id" uuid NOT NULL,
	"content" text,
	"voice_note_url" varchar(500),
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "feedbacks_submission_id_unique" UNIQUE("submission_id"),
	CONSTRAINT "feedbacks_has_content" CHECK ("feedbacks"."content" IS NOT NULL OR "feedbacks"."voice_note_url" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" varchar(60) NOT NULL,
	"channel" "notification_channel" NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"scheduled_for" timestamp (3) with time zone NOT NULL,
	"sent_at" timestamp (3) with time zone,
	"status" "notification_status" DEFAULT 'PENDING' NOT NULL,
	"error" text,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recordings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" uuid NOT NULL,
	"url" varchar(500) NOT NULL,
	"type" "media_type" NOT NULL,
	"size_bytes" bigint,
	"duration_seconds" integer,
	"status" "recording_status" DEFAULT 'PROCESSING' NOT NULL,
	"expires_at" timestamp (3) with time zone NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" uuid NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "session_notes_booking_id_unique" UNIQUE("booking_id")
);
--> statement-breakpoint
CREATE TABLE "submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"assignment_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"media_url" varchar(500) NOT NULL,
	"media_type" "media_type" NOT NULL,
	"duration_seconds" integer,
	"size_bytes" bigint,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offerings" ADD CONSTRAINT "offerings_teacher_id_teacher_profiles_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."teacher_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offerings" ADD CONSTRAINT "offerings_instrument_id_instruments_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instruments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teacher_profiles" ADD CONSTRAINT "teacher_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "availability_exceptions" ADD CONSTRAINT "availability_exceptions_teacher_id_teacher_profiles_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."teacher_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "availability_rules" ADD CONSTRAINT "availability_rules_teacher_id_teacher_profiles_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."teacher_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_teacher_id_users_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_offering_id_offerings_id_fk" FOREIGN KEY ("offering_id") REFERENCES "public"."offerings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_enrollment_id_enrollments_id_fk" FOREIGN KEY ("enrollment_id") REFERENCES "public"."enrollments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_cancelled_by_id_users_id_fk" FOREIGN KEY ("cancelled_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_offering_id_offerings_id_fk" FOREIGN KEY ("offering_id") REFERENCES "public"."offerings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_teacher_id_teacher_profiles_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."teacher_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_enrollment_id_enrollments_id_fk" FOREIGN KEY ("enrollment_id") REFERENCES "public"."enrollments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_teacher_id_teacher_profiles_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."teacher_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedbacks" ADD CONSTRAINT "feedbacks_submission_id_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."submissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recordings" ADD CONSTRAINT "recordings_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_notes" ADD CONSTRAINT "session_notes_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_assignment_id_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."assignments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "refresh_tokens_user_idx" ON "refresh_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "users_status_idx" ON "users" USING btree ("status");--> statement-breakpoint
CREATE INDEX "offerings_instrument_active_idx" ON "offerings" USING btree ("instrument_id","is_active");--> statement-breakpoint
CREATE INDEX "teacher_profiles_status_idx" ON "teacher_profiles" USING btree ("status");--> statement-breakpoint
CREATE INDEX "availability_exceptions_teacher_date_idx" ON "availability_exceptions" USING btree ("teacher_id","date");--> statement-breakpoint
CREATE INDEX "availability_rules_teacher_weekday_idx" ON "availability_rules" USING btree ("teacher_id","weekday");--> statement-breakpoint
CREATE INDEX "bookings_teacher_scheduled_idx" ON "bookings" USING btree ("teacher_id","scheduled_at");--> statement-breakpoint
CREATE INDEX "bookings_student_scheduled_idx" ON "bookings" USING btree ("student_id","scheduled_at");--> statement-breakpoint
CREATE INDEX "bookings_hold_expiry_idx" ON "bookings" USING btree ("status","hold_expires_at");--> statement-breakpoint
CREATE INDEX "bookings_enrollment_idx" ON "bookings" USING btree ("enrollment_id");--> statement-breakpoint
CREATE INDEX "enrollments_student_status_idx" ON "enrollments" USING btree ("student_id","status");--> statement-breakpoint
CREATE INDEX "ledger_teacher_created_idx" ON "ledger_entries" USING btree ("teacher_id","created_at");--> statement-breakpoint
CREATE INDEX "ledger_type_created_idx" ON "ledger_entries" USING btree ("type","created_at");--> statement-breakpoint
CREATE INDEX "order_items_order_idx" ON "order_items" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "orders_student_status_idx" ON "orders" USING btree ("student_id","status");--> statement-breakpoint
CREATE INDEX "orders_gateway_authority_idx" ON "orders" USING btree ("gateway_authority");--> statement-breakpoint
CREATE INDEX "payouts_teacher_status_idx" ON "payouts" USING btree ("teacher_id","status");--> statement-breakpoint
CREATE INDEX "assignments_booking_idx" ON "assignments" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "notifications_dispatch_idx" ON "notifications" USING btree ("status","scheduled_for");--> statement-breakpoint
CREATE INDEX "notifications_user_idx" ON "notifications" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "recordings_booking_idx" ON "recordings" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "recordings_expiry_idx" ON "recordings" USING btree ("status","expires_at");--> statement-breakpoint
CREATE INDEX "submissions_assignment_idx" ON "submissions" USING btree ("assignment_id");