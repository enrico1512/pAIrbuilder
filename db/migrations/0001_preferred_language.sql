-- Migration 0001: add preferred_language to users and default_language to restaurants
-- Idempotent: safe to run multiple times. Backfills NULL to 'it' on existing rows.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS preferred_language CHAR(2) DEFAULT 'it';

UPDATE users SET preferred_language = 'it' WHERE preferred_language IS NULL;

ALTER TABLE restaurants
  ADD COLUMN IF NOT EXISTS default_language CHAR(2) DEFAULT 'it';

UPDATE restaurants SET default_language = 'it' WHERE default_language IS NULL;
