ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "address" text;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "text" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "html" text;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "key" text;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "next_attempt_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "resolved_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notifications_key_idx" ON "notifications" USING btree ("key");