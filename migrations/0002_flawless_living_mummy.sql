ALTER TABLE "users" ALTER COLUMN "password" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "notification_prefs" ADD COLUMN "push_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "auth_provider" text DEFAULT 'password';--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "facebook_id" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "avatar_url" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "push_token" text;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_facebook_id_unique" UNIQUE("facebook_id");