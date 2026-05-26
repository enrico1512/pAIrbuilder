-- ============================================================================
-- pAIrbuilder — Schema PostgreSQL
-- Target: PostgreSQL 14+ (Neon / Replit DB / Supabase compatibile)
-- Encoding: UTF-8
--
-- Modello dati per:
--   - Account ristoranti con login
--   - Anagrafica e contatti ristorante
--   - Menu cibo (categorie + piatti)
--   - Menu drink (vini, birre, spirits, cocktail, soft)
--   - Abbinamenti AI generati (piatto <-> drink)
-- ============================================================================

BEGIN;

-- Estensioni utili
CREATE EXTENSION IF NOT EXISTS "pgcrypto";   -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "citext";     -- email case-insensitive

-- ---------------------------------------------------------------------------
-- ENUMS
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('owner', 'manager', 'staff');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE drink_category AS ENUM ('wine', 'beer', 'spirit', 'cocktail', 'soft', 'water', 'hot');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE wine_color AS ENUM ('red', 'white', 'rose', 'sparkling', 'dessert', 'fortified');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE food_course AS ENUM ('antipasto', 'primo', 'secondo', 'contorno', 'dessert', 'snack', 'altro');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE pairing_source AS ENUM ('ai', 'manual');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------------
-- Funzione per aggiornare updated_at automaticamente
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ===========================================================================
-- 1. RISTORANTI
-- ===========================================================================
CREATE TABLE restaurants (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug            TEXT NOT NULL UNIQUE,            -- es. "trattoria-da-mario"
  name            TEXT NOT NULL,
  description     TEXT,
  cuisine_type    TEXT,                            -- es. "italiana", "fusion"
  logo_url        TEXT,
  cover_url       TEXT,
  vat_number      TEXT,                            -- P.IVA
  -- contatti
  phone           TEXT,
  email           CITEXT,
  website         TEXT,
  -- indirizzo
  address_line    TEXT,
  city            TEXT,
  postal_code     TEXT,
  province        TEXT,
  country         TEXT DEFAULT 'IT',
  latitude        NUMERIC(9,6),
  longitude       NUMERIC(9,6),
  -- social
  instagram       TEXT,
  facebook        TEXT,
  tripadvisor     TEXT,
  -- preferenze
  default_language CHAR(2) DEFAULT 'it',
  -- guest tracking (ristoranti creati al volo da sessione anonima)
  is_guest        BOOLEAN NOT NULL DEFAULT FALSE,
  guest_email     TEXT,
  guest_phone     TEXT,
  -- stato
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_restaurants_active ON restaurants(is_active);
CREATE INDEX idx_restaurants_city ON restaurants(city);
CREATE INDEX idx_restaurants_is_guest ON restaurants(is_guest);

CREATE TRIGGER trg_restaurants_updated
  BEFORE UPDATE ON restaurants
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ===========================================================================
-- 2. UTENTI (login ristoranti)
-- ===========================================================================
CREATE TABLE users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id   UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  email           CITEXT NOT NULL UNIQUE,
  password_hash   TEXT NOT NULL,                   -- bcrypt / argon2
  full_name       TEXT,
  role            user_role NOT NULL DEFAULT 'owner',
  preferred_language CHAR(2) DEFAULT 'it',
  is_platform_admin BOOLEAN NOT NULL DEFAULT FALSE,   -- visibilità cross-ristorante per owner della piattaforma
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  email_verified_at TIMESTAMPTZ,
  last_login_at   TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_restaurant ON users(restaurant_id);

CREATE TRIGGER trg_users_updated
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ===========================================================================
-- 3. SESSIONI (per express-session + connect-pg-simple, opzionale)
-- ===========================================================================
CREATE TABLE sessions (
  sid     VARCHAR PRIMARY KEY,
  sess    JSON NOT NULL,
  expire  TIMESTAMPTZ NOT NULL
);
CREATE INDEX idx_sessions_expire ON sessions(expire);

-- ===========================================================================
-- 4. TOKEN PASSWORD RESET / VERIFICA EMAIL
-- ===========================================================================
CREATE TABLE auth_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL UNIQUE,
  purpose     TEXT NOT NULL,                       -- 'reset' | 'verify'
  expires_at  TIMESTAMPTZ NOT NULL,
  used_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_auth_tokens_user ON auth_tokens(user_id);

-- ===========================================================================
-- 5. CATEGORIE MENU CIBO
-- ===========================================================================
CREATE TABLE food_categories (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id   UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,                   -- es. "Antipasti di mare"
  course          food_course,                     -- classificazione standard
  description     TEXT,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (restaurant_id, name)
);
CREATE INDEX idx_food_categories_restaurant ON food_categories(restaurant_id);

CREATE TRIGGER trg_food_categories_updated
  BEFORE UPDATE ON food_categories
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ===========================================================================
-- 6. PIATTI (food_items)
-- ===========================================================================
CREATE TABLE food_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id   UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  category_id     UUID REFERENCES food_categories(id) ON DELETE SET NULL,
  name            TEXT NOT NULL,
  description     TEXT,
  ingredients     TEXT,                            -- testo libero o JSON
  allergens       TEXT[],                          -- es. {'gluten','dairy'}
  price_cents     INTEGER,                         -- 1290 = 12,90 EUR
  currency        CHAR(3) DEFAULT 'EUR',
  -- caratteristiche per pairing AI
  flavor_profile  JSONB,                           -- {"sweet":2,"salt":4,"acid":3,...}
  cooking_method  TEXT,                            -- "grigliato", "al vapore"
  is_vegetarian   BOOLEAN DEFAULT FALSE,
  is_vegan        BOOLEAN DEFAULT FALSE,
  is_gluten_free  BOOLEAN DEFAULT FALSE,
  spicy_level     SMALLINT CHECK (spicy_level BETWEEN 0 AND 5),
  -- multimedia
  image_url       TEXT,
  -- stato
  is_available    BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_food_items_restaurant ON food_items(restaurant_id);
CREATE INDEX idx_food_items_category ON food_items(category_id);
CREATE INDEX idx_food_items_available ON food_items(restaurant_id, is_available);

CREATE TRIGGER trg_food_items_updated
  BEFORE UPDATE ON food_items
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ===========================================================================
-- 7. DRINKS (vini, birre, spirits, cocktail, soft)
-- ===========================================================================
CREATE TABLE drinks (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id   UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  category        drink_category NOT NULL,
  name            TEXT NOT NULL,
  producer        TEXT,                            -- cantina / birrificio / distillatore
  description     TEXT,
  -- attributi comuni
  country         TEXT,
  region          TEXT,
  vintage         INTEGER,                         -- anno (solo vino)
  abv             NUMERIC(4,2),                    -- gradazione alcolica %
  serving_size_ml INTEGER,
  -- attributi specifici vino
  wine_color      wine_color,
  grape_varieties TEXT[],                          -- {'Sangiovese','Merlot'}
  -- prezzi
  price_glass_cents  INTEGER,
  price_bottle_cents INTEGER,
  currency        CHAR(3) DEFAULT 'EUR',
  -- profilo per AI pairing
  flavor_profile  JSONB,                           -- {"body":4,"acid":3,"tannin":2,...}
  serving_temp_c  NUMERIC(3,1),                    -- temperatura servizio
  -- multimedia
  image_url       TEXT,
  -- stato
  is_available    BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- coerenza dati: il colore del vino esiste solo se category='wine'
  CONSTRAINT chk_wine_color CHECK (
    (category = 'wine') OR (wine_color IS NULL)
  )
);
CREATE INDEX idx_drinks_restaurant ON drinks(restaurant_id);
CREATE INDEX idx_drinks_category ON drinks(restaurant_id, category);
CREATE INDEX idx_drinks_available ON drinks(restaurant_id, is_available);

CREATE TRIGGER trg_drinks_updated
  BEFORE UPDATE ON drinks
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ===========================================================================
-- 8. CONTATTI AGGIUNTIVI (referenti interni del ristorante)
-- ===========================================================================
CREATE TABLE contacts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id   UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  label           TEXT NOT NULL,                   -- "Chef", "Sommelier", "Amministratore"
  full_name       TEXT,
  role            TEXT,
  phone           TEXT,
  email           CITEXT,
  notes           TEXT,
  is_primary      BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_contacts_restaurant ON contacts(restaurant_id);

CREATE TRIGGER trg_contacts_updated
  BEFORE UPDATE ON contacts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ===========================================================================
-- 9. ORARI APERTURA
-- ===========================================================================
CREATE TABLE opening_hours (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id   UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  day_of_week     SMALLINT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6), -- 0=Domenica
  opens_at        TIME NOT NULL,
  closes_at       TIME NOT NULL,
  is_closed       BOOLEAN NOT NULL DEFAULT FALSE,
  notes           TEXT
);
CREATE INDEX idx_opening_hours_restaurant ON opening_hours(restaurant_id);

-- ===========================================================================
-- 10. ABBINAMENTI AI (food_item <-> drink)
-- ===========================================================================
CREATE TABLE pairings (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id   UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  food_item_id    UUID NOT NULL REFERENCES food_items(id) ON DELETE CASCADE,
  drink_id        UUID NOT NULL REFERENCES drinks(id) ON DELETE CASCADE,
  score           NUMERIC(3,2) CHECK (score BETWEEN 0 AND 1),  -- 0.00 .. 1.00
  rationale       TEXT,                                         -- spiegazione AI
  source          pairing_source NOT NULL DEFAULT 'ai',
  model           TEXT,                                         -- "gemini-1.5-pro", "gpt-4o"
  language        CHAR(2) DEFAULT 'it',                         -- lingua del rationale generato
  approved_by     UUID REFERENCES users(id),
  approved_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (food_item_id, drink_id)
);
CREATE INDEX idx_pairings_restaurant ON pairings(restaurant_id);
CREATE INDEX idx_pairings_food ON pairings(food_item_id);
CREATE INDEX idx_pairings_drink ON pairings(drink_id);

-- ===========================================================================
-- 11. CRONOLOGIA RICHIESTE AI (per audit / cost tracking)
-- ===========================================================================
CREATE TABLE ai_requests (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id   UUID REFERENCES restaurants(id) ON DELETE SET NULL,
  user_id         UUID REFERENCES users(id) ON DELETE SET NULL,
  provider        TEXT,                            -- "google" | "openai"
  model           TEXT,
  prompt_tokens   INTEGER,
  completion_tokens INTEGER,
  cost_cents      INTEGER,
  request_payload JSONB,
  response_payload JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_ai_requests_restaurant ON ai_requests(restaurant_id);
CREATE INDEX idx_ai_requests_created ON ai_requests(created_at DESC);

-- ===========================================================================
-- 12. CACHE ESTRAZIONI AI (per file hash, evita di pagare due volte la stessa estrazione)
-- ===========================================================================
CREATE TABLE ai_extractions_cache (
  file_hash       CHAR(64) NOT NULL,             -- SHA-256 hex del file binario
  upload_type     TEXT NOT NULL CHECK (upload_type IN ('menu', 'drinks')),
  result          JSONB NOT NULL,                -- { dishes: [...], drinks: [...] }
  model           TEXT,
  hit_count       INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_hit_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (file_hash, upload_type)
);
CREATE INDEX idx_ai_cache_last_hit ON ai_extractions_cache(last_hit_at);

-- ===========================================================================
-- 13. SESSIONI DI UPLOAD (modello pay-per-use: 1ª gratis, dalla 2ª 10€)
-- ===========================================================================
CREATE TABLE upload_sessions (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id               UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  status                      TEXT NOT NULL DEFAULT 'initiated'
                                CHECK (status IN ('initiated', 'completed', 'refunded', 'cancelled')),
  is_free                     BOOLEAN NOT NULL DEFAULT FALSE,
  amount_cents                INTEGER NOT NULL DEFAULT 1000,
  currency                    CHAR(3) NOT NULL DEFAULT 'EUR',
  stripe_checkout_session_id  TEXT,
  stripe_payment_intent_id    TEXT,
  metadata                    JSONB,
  started_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at                TIMESTAMPTZ,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_upload_sessions_restaurant ON upload_sessions(restaurant_id);
CREATE INDEX idx_upload_sessions_status ON upload_sessions(restaurant_id, status);
CREATE UNIQUE INDEX uq_upload_sessions_stripe_checkout
  ON upload_sessions(stripe_checkout_session_id)
  WHERE stripe_checkout_session_id IS NOT NULL;
CREATE TRIGGER trg_upload_sessions_updated_at
  BEFORE UPDATE ON upload_sessions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMIT;

-- ============================================================================
-- FINE SCHEMA
-- ============================================================================
