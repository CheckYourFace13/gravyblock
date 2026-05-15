-- Multi-platform review support
-- Adds source column to business_reviews and platform ID fields to businesses

ALTER TABLE business_reviews
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'google';

ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS yelp_business_id TEXT,
  ADD COLUMN IF NOT EXISTS trip_advisor_location_id TEXT;
