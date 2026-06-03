-- Add source column to keyword_rankings to distinguish GSC vs DataForSEO data
ALTER TABLE keyword_rankings ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'gsc';
