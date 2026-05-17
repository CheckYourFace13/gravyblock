-- Add business_id FK to jobs table (was in schema but never migrated)
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS business_id UUID REFERENCES businesses(id) ON DELETE CASCADE;
