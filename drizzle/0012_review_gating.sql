-- ─── Migration 0012: Review gating ────────────────────────────────────────────
-- Shareable links that route happy customers to Google and capture
-- unhappy customers privately — zero ongoing API cost.

CREATE TABLE IF NOT EXISTS review_request_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  token UUID UNIQUE NOT NULL DEFAULT gen_random_uuid(),
  positive_redirect_url TEXT,     -- Google review URL, auto-populated from place_id
  threshold INTEGER NOT NULL DEFAULT 4, -- rating >= threshold → redirect to Google
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS review_request_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  link_id UUID NOT NULL REFERENCES review_request_links(id) ON DELETE CASCADE,
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL,
  feedback TEXT,
  submitted_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS review_request_responses_business_idx
  ON review_request_responses(business_id, submitted_at DESC);

-- Also add a status field to business_reviews for reply tracking
ALTER TABLE business_reviews ADD COLUMN IF NOT EXISTS replied_at TIMESTAMPTZ;
