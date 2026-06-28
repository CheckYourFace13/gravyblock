-- Account email (separate from billing) + verification flag.
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS account_email  text;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS email_verified text NOT NULL DEFAULT 'false';

-- Backfill account_email from billing_email where present.
UPDATE businesses SET account_email = billing_email WHERE account_email IS NULL AND billing_email IS NOT NULL;
