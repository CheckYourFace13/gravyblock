-- Add status column to jobs table if it does not already exist
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending';
