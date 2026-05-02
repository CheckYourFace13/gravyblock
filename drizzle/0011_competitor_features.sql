-- ─── Migration 0011: Competitor feature additions ────────────────────────────
-- Feature #1: keyword_rankings table (GSC rank tracking)
CREATE TABLE IF NOT EXISTS keyword_rankings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE NOT NULL,
  keyword TEXT NOT NULL,
  position TEXT,
  clicks INTEGER DEFAULT 0,
  impressions INTEGER DEFAULT 0,
  ctr TEXT,
  date TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Feature #2: auto meta tags on published content
ALTER TABLE published_content ADD COLUMN IF NOT EXISTS meta_title TEXT;
ALTER TABLE published_content ADD COLUMN IF NOT EXISTS meta_description TEXT;

-- Feature #3: brand voice config
ALTER TABLE business_configs ADD COLUMN IF NOT EXISTS brand_voice TEXT;

-- Feature #5: article cover images
ALTER TABLE published_content ADD COLUMN IF NOT EXISTS cover_image_url TEXT;
ALTER TABLE published_content ADD COLUMN IF NOT EXISTS cover_image_credit TEXT;

-- Feature #9: Facebook/Instagram per-business credentials
ALTER TABLE business_configs ADD COLUMN IF NOT EXISTS facebook_page_id TEXT;
ALTER TABLE business_configs ADD COLUMN IF NOT EXISTS facebook_access_token TEXT;
ALTER TABLE business_configs ADD COLUMN IF NOT EXISTS instagram_account_id TEXT;
