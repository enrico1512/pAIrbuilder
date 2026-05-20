-- ============================================================================
-- pAIrbuilder — Query SQL utili per il platform owner (Enrico)
-- ============================================================================
-- Da lanciare nella console SQL di Neon (https://console.neon.tech) o con
-- psql "$DATABASE_URL" -f db/ADMIN-QUERIES.sql.
--
-- NOTA: nessuna di queste query modifica dati. Solo SELECT. Per
-- aggiornamenti/cancellazioni vedi script in scripts/.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. Overview piattaforma
-- ----------------------------------------------------------------------------

-- Stat globali (gli stessi numeri dell'endpoint /api/admin/stats).
SELECT
  (SELECT COUNT(*) FROM restaurants WHERE NOT is_guest)        AS ristoranti_registrati,
  (SELECT COUNT(*) FROM restaurants WHERE is_guest)            AS sessioni_ospite,
  (SELECT COUNT(*) FROM users WHERE NOT is_platform_admin)     AS utenti_totali,
  (SELECT COUNT(*) FROM food_items)                            AS piatti_totali,
  (SELECT COUNT(*) FROM drinks)                                AS drinks_totali,
  (SELECT COUNT(*) FROM pairings)                              AS abbinamenti_totali,
  (SELECT COUNT(*) FROM pairings WHERE language = 'it')        AS pairings_it,
  (SELECT COUNT(*) FROM pairings WHERE language = 'en')        AS pairings_en;


-- ----------------------------------------------------------------------------
-- 2. Lista ristoranti (registrati + ospiti) con contatori
-- ----------------------------------------------------------------------------
SELECT
  r.slug,
  r.name,
  r.cuisine_type,
  r.is_guest,
  COALESCE(u.email, r.guest_email) AS contact_email,
  COALESCE(NULL, r.guest_phone)    AS contact_phone,
  r.default_language               AS lingua,
  r.created_at,
  (SELECT COUNT(*) FROM food_items WHERE restaurant_id = r.id) AS piatti,
  (SELECT COUNT(*) FROM drinks      WHERE restaurant_id = r.id) AS drinks,
  (SELECT COUNT(*) FROM pairings    WHERE restaurant_id = r.id) AS abbinamenti
FROM restaurants r
LEFT JOIN users u ON u.restaurant_id = r.id AND NOT u.is_platform_admin
ORDER BY r.created_at DESC;


-- ----------------------------------------------------------------------------
-- 3. Solo ospiti recenti (ultimi 30 giorni) — contatti da poter ricontattare
-- ----------------------------------------------------------------------------
SELECT
  r.created_at,
  r.name,
  r.cuisine_type,
  r.guest_email,
  r.guest_phone,
  r.default_language,
  (SELECT COUNT(*) FROM food_items WHERE restaurant_id = r.id) AS piatti,
  (SELECT COUNT(*) FROM drinks      WHERE restaurant_id = r.id) AS drinks
FROM restaurants r
WHERE r.is_guest = TRUE
  AND r.created_at > NOW() - INTERVAL '30 days'
  AND r.guest_email IS NOT NULL
ORDER BY r.created_at DESC;


-- ----------------------------------------------------------------------------
-- 4. Menu cibo completo di un ristorante (per slug)
-- ----------------------------------------------------------------------------
SELECT
  fi.name        AS piatto,
  fi.description AS categoria_estratta,  -- pre-promozione a food_categories
  fi.ingredients,
  fi.price_cents / 100.0 AS prezzo_eur,
  fi.is_vegetarian, fi.is_vegan, fi.is_gluten_free,
  fi.created_at
FROM food_items fi
JOIN restaurants r ON r.id = fi.restaurant_id
WHERE r.slug = 'trattoria-demo'   -- <-- sostituisci con lo slug del ristorante
ORDER BY fi.created_at, fi.name;


-- ----------------------------------------------------------------------------
-- 5. Carta drink completa di un ristorante
-- ----------------------------------------------------------------------------
SELECT
  d.category,
  d.wine_color,
  d.producer,
  d.name AS prodotto,
  d.vintage,
  d.region,
  d.price_bottle_cents / 100.0 AS bottiglia_eur,
  d.price_glass_cents  / 100.0 AS calice_eur,
  d.created_at
FROM drinks d
JOIN restaurants r ON r.id = d.restaurant_id
WHERE r.slug = 'trattoria-demo'   -- <-- sostituisci con lo slug del ristorante
ORDER BY d.category, d.name;


-- ----------------------------------------------------------------------------
-- 6. Tutti gli abbinamenti AI di un ristorante
-- ----------------------------------------------------------------------------
SELECT
  fi.name AS piatto,
  d.name  AS bevanda,
  p.rationale,
  p.language,
  p.source,
  p.model,
  p.created_at
FROM pairings p
JOIN food_items fi ON fi.id = p.food_item_id
JOIN drinks     d  ON d.id  = p.drink_id
JOIN restaurants r ON r.id  = p.restaurant_id
WHERE r.slug = 'trattoria-demo'
ORDER BY p.created_at DESC;


-- ----------------------------------------------------------------------------
-- 7. Piatti piu' frequenti cross-ristorante (per intelligence)
-- ----------------------------------------------------------------------------
SELECT
  LOWER(TRIM(name)) AS piatto_normalizzato,
  COUNT(*)          AS occorrenze,
  COUNT(DISTINCT restaurant_id) AS ristoranti_diversi
FROM food_items
GROUP BY LOWER(TRIM(name))
HAVING COUNT(*) > 1
ORDER BY occorrenze DESC, ristoranti_diversi DESC
LIMIT 50;


-- ----------------------------------------------------------------------------
-- 8. Vini piu' frequenti cross-ristorante
-- ----------------------------------------------------------------------------
SELECT
  LOWER(TRIM(name))     AS vino_normalizzato,
  LOWER(TRIM(COALESCE(producer, ''))) AS produttore,
  COUNT(*)              AS occorrenze,
  COUNT(DISTINCT restaurant_id) AS ristoranti_diversi
FROM drinks
WHERE category = 'wine'
GROUP BY LOWER(TRIM(name)), LOWER(TRIM(COALESCE(producer, '')))
HAVING COUNT(*) > 1
ORDER BY occorrenze DESC, ristoranti_diversi DESC
LIMIT 50;


-- ----------------------------------------------------------------------------
-- 9. Acquisizione utenti per settimana (ultimi 12 weeks)
-- ----------------------------------------------------------------------------
SELECT
  DATE_TRUNC('week', created_at)::date AS settimana,
  COUNT(*) FILTER (WHERE NOT is_guest) AS ristoranti_registrati,
  COUNT(*) FILTER (WHERE is_guest)     AS sessioni_ospite,
  COUNT(*)                             AS totale
FROM restaurants
WHERE created_at > NOW() - INTERVAL '12 weeks'
GROUP BY 1
ORDER BY 1 DESC;


-- ----------------------------------------------------------------------------
-- 10. Top 10 ristoranti per attivita' (n. pairings generati)
-- ----------------------------------------------------------------------------
SELECT
  r.slug,
  r.name,
  r.is_guest,
  COALESCE(u.email, r.guest_email) AS contact,
  COUNT(p.id) AS pairings_generati,
  MAX(p.created_at) AS ultimo_pairing
FROM restaurants r
LEFT JOIN users u ON u.restaurant_id = r.id AND NOT u.is_platform_admin
LEFT JOIN pairings p ON p.restaurant_id = r.id
GROUP BY r.id, u.email
ORDER BY pairings_generati DESC, ultimo_pairing DESC
LIMIT 10;
