ALTER TABLE "groups" ADD COLUMN "learned_taste" jsonb;--> statement-breakpoint
ALTER TABLE "session_participants" ADD COLUMN "transport_mode" text;--> statement-breakpoint
ALTER TABLE "session_participants" ADD COLUMN "travel_tolerance_min" integer;