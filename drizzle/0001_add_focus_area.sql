-- Migration: add focus_area and target_scope to businesses and business_configs
-- Safe to run on a live database — all columns use IF NOT EXISTS
-- Run order matters: businesses first, then business_configs

-- businesses table
ALTER TABLE "businesses"
  ADD COLUMN IF NOT EXISTS "focus_area" text NOT NULL DEFAULT 'local',
  ADD COLUMN IF NOT EXISTS "target_scope" text;

-- business_configs table
ALTER TABLE "business_configs"
  ADD COLUMN IF NOT EXISTS "focus_area" text NOT NULL DEFAULT 'local',
  ADD COLUMN IF NOT EXISTS "target_scope" text;
