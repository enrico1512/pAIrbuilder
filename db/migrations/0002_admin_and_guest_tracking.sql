-- Migration 0002: platform admin flag + guest restaurant tracking + pairing language
-- Idempotent: safe to run multiple times.

-- 1. Platform admin (cross-restaurant visibility for the platform owner)
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS is_platform_admin BOOLEAN NOT NULL DEFAULT FALSE;

-- 2. Guest restaurants — created on the fly when an anonymous user finishes
--    the onboarding form. Keeps the data shape uniform so every food_item /
--    drink / pairing has a restaurant_id, whether the originating session
--    was logged in or guest. Contact fields captured from the onboarding
--    form so the platform owner can later analyze/contact those leads.
ALTER TABLE restaurants
  ADD COLUMN IF NOT EXISTS is_guest BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE restaurants
  ADD COLUMN IF NOT EXISTS guest_email TEXT;

ALTER TABLE restaurants
  ADD COLUMN IF NOT EXISTS guest_phone TEXT;

CREATE INDEX IF NOT EXISTS idx_restaurants_is_guest ON restaurants(is_guest);

-- 3. Pairing language — tracks which language the AI-generated descriptions
--    were written in. Prevents mixed-language display if the user switches
--    UI language after pairings have been generated.
ALTER TABLE pairings
  ADD COLUMN IF NOT EXISTS language CHAR(2) DEFAULT 'it';

UPDATE pairings SET language = 'it' WHERE language IS NULL;
