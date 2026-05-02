-- Migration: add google_oauth_connections table
CREATE TABLE IF NOT EXISTS "google_oauth_connections" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "business_id" uuid NOT NULL UNIQUE REFERENCES "businesses"("id") ON DELETE CASCADE,
  "access_token" text NOT NULL,
  "refresh_token" text NOT NULL,
  "expires_at" timestamptz NOT NULL,
  "scopes" text NOT NULL,
  "google_email" text,
  "search_console_property" text,
  "gbp_account_id" text,
  "gbp_location_name" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
