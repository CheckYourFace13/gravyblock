-- Email event tracking: opens, clicks, bounces, unsubscribes from Resend webhooks
CREATE TABLE IF NOT EXISTS email_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type  text NOT NULL,           -- 'opened', 'clicked', 'bounced', 'complained', 'delivered'
  email_id    text,                    -- Resend email ID
  recipient   text,                    -- email address
  email_type  text,                    -- 'cold_outreach', 'cold_outreach_followup', 'lead_drip', etc.
  click_url   text,                    -- for click events
  metadata    jsonb NOT NULL DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_events_recipient  ON email_events (recipient);
CREATE INDEX IF NOT EXISTS idx_email_events_event_type ON email_events (event_type);
CREATE INDEX IF NOT EXISTS idx_email_events_created_at ON email_events (created_at DESC);
