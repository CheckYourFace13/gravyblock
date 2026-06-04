-- Extended location fields for the business profile location redesign.
-- Replaces the old city+radius text encoding with proper structured columns.
ALTER TABLE business_configs ADD COLUMN IF NOT EXISTS service_radius   integer NOT NULL DEFAULT 25;
ALTER TABLE business_configs ADD COLUMN IF NOT EXISTS service_country  text    NOT NULL DEFAULT 'United States';
ALTER TABLE business_configs ADD COLUMN IF NOT EXISTS service_state    text;
ALTER TABLE business_configs ADD COLUMN IF NOT EXISTS service_address  text;
-- focusArea already exists; we're extending valid values to include 'global'
