-- Customer testimonials: submitted via /feedback, shown on site once approved.
CREATE TABLE IF NOT EXISTS testimonials (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id   uuid REFERENCES businesses(id) ON DELETE SET NULL,
  author_name   text NOT NULL,
  business_name text,
  role          text,
  city          text,
  quote         text NOT NULL,
  rating        integer,
  status        text NOT NULL DEFAULT 'pending',
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_testimonials_status ON testimonials (status, created_at DESC);
