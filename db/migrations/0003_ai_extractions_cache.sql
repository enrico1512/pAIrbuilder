-- Migration 0003: cache risultati estrazione AI per file
-- Idempotent: safe to run multiple times.
--
-- Scopo: evitare di rifare le 2 chiamate AI (listItemNames + extractMenuData)
-- quando lo stesso file binario viene ricaricato. Coerente col modello
-- freemium: il paywall scatta sul "numero di upload tentati", la cache
-- evita di pagare due volte la stessa estrazione AI.
--
-- Chiave: SHA-256 del file (hex, 64 char) + tipo di upload ('menu' | 'drinks').
-- Lo stesso byte-stream caricato come menu vs carta drink puo' dare risultati
-- diversi (il prompt cambia), quindi tipiamo il key.

CREATE TABLE IF NOT EXISTS ai_extractions_cache (
  file_hash    CHAR(64) NOT NULL,
  upload_type  TEXT NOT NULL CHECK (upload_type IN ('menu', 'drinks')),
  result       JSONB NOT NULL,                  -- { dishes: [...], drinks: [...] }
  model        TEXT,                            -- es. 'anthropic/claude-sonnet-4-6'
  hit_count    INTEGER NOT NULL DEFAULT 0,      -- quante volte la cache e' stata riusata
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_hit_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (file_hash, upload_type)
);

CREATE INDEX IF NOT EXISTS idx_ai_cache_last_hit
  ON ai_extractions_cache(last_hit_at);
