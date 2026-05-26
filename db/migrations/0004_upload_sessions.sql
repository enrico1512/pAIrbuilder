-- Migration 0004: traccia delle sessioni di upload per il modello pay-per-use.
-- Idempotent: safe to run multiple times.
--
-- Scopo: contare quante sessioni di upload completate ha un ristorante e
-- abilitare il paywall pay-per-use (1ª gratis, dalla 2ª in poi 10€ via
-- Stripe Checkout). Vedi memoria progetto `pairbuilder_freemium_model.md`.
--
-- Una "sessione di upload" = onboarding + menu + carta drink + generazione
-- pairing. Si crea un record con status='initiated' all'inizio del flow,
-- e passa a 'completed' quando i pairing sono salvati (per il free) o
-- quando arriva il webhook Stripe checkout.session.completed (per i pagati).
--
-- amount_cents resta 0 per il free, 1000 per il pagato (10 EUR).

CREATE TABLE IF NOT EXISTS upload_sessions (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id               UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  status                      TEXT NOT NULL DEFAULT 'initiated'
                                CHECK (status IN ('initiated', 'completed', 'refunded', 'cancelled')),
  is_free                     BOOLEAN NOT NULL DEFAULT FALSE,
  amount_cents                INTEGER NOT NULL DEFAULT 1000,
  currency                    CHAR(3) NOT NULL DEFAULT 'EUR',
  stripe_checkout_session_id  TEXT,
  stripe_payment_intent_id    TEXT,
  metadata                    JSONB,                 -- { num_dishes, num_drinks, num_pairings, ... }
  started_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at                TIMESTAMPTZ,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_upload_sessions_restaurant
  ON upload_sessions(restaurant_id);

CREATE INDEX IF NOT EXISTS idx_upload_sessions_status
  ON upload_sessions(restaurant_id, status);

CREATE UNIQUE INDEX IF NOT EXISTS uq_upload_sessions_stripe_checkout
  ON upload_sessions(stripe_checkout_session_id)
  WHERE stripe_checkout_session_id IS NOT NULL;

-- Trigger updated_at (riusa la funzione globale set_updated_at gia' presente
-- da schema.sql). Idempotente: drop+create se gia' esistente.
DROP TRIGGER IF EXISTS trg_upload_sessions_updated_at ON upload_sessions;
CREATE TRIGGER trg_upload_sessions_updated_at
  BEFORE UPDATE ON upload_sessions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
