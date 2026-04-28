-- Migration: add stripe_subscription_item_id to locations
-- Safe to run on a live database — uses IF NOT EXISTS

ALTER TABLE "locations"
  ADD COLUMN IF NOT EXISTS "stripe_subscription_item_id" text;
