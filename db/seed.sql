-- ============================================================================
-- pAIrbuilder — Seed di esempio (1 ristorante demo)
-- Esegui DOPO schema.sql
-- ============================================================================
BEGIN;

-- Ristorante demo
INSERT INTO restaurants (id, slug, name, description, cuisine_type, phone, email, city, country)
VALUES (
  '11111111-1111-1111-1111-111111111111',
  'trattoria-demo',
  'Trattoria Demo',
  'Cucina italiana tradizionale con tocco moderno',
  'italiana',
  '+39 02 1234567',
  'info@trattoriademo.it',
  'Milano',
  'IT'
);

-- Utente owner (password fittizia: sostituire con hash bcrypt vero)
-- bcrypt di "password123" cost 12: $2b$12$KIXxPfnK4hY4M0c8rPq8XO6Ld7QwVl1nM5wXY6L9zJ4kFvNqRpHmW
INSERT INTO users (restaurant_id, email, password_hash, full_name, role)
VALUES (
  '11111111-1111-1111-1111-111111111111',
  'owner@trattoriademo.it',
  '$2b$12$KIXxPfnK4hY4M0c8rPq8XO6Ld7QwVl1nM5wXY6L9zJ4kFvNqRpHmW',
  'Mario Rossi',
  'owner'
);

-- Categorie cibo
INSERT INTO food_categories (id, restaurant_id, name, course, sort_order) VALUES
  ('aaaa1111-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Antipasti', 'antipasto', 1),
  ('aaaa1111-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'Primi',     'primo',     2),
  ('aaaa1111-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'Secondi',   'secondo',   3);

-- Piatti
INSERT INTO food_items (restaurant_id, category_id, name, description, price_cents, is_vegetarian)
VALUES
  ('11111111-1111-1111-1111-111111111111', 'aaaa1111-0000-0000-0000-000000000001',
   'Tartare di manzo', 'Filetto crudo, capperi, tuorlo, olio extravergine', 1600, FALSE),
  ('11111111-1111-1111-1111-111111111111', 'aaaa1111-0000-0000-0000-000000000002',
   'Tagliolini al ragù bianco', 'Pasta fresca, ragù di vitello, parmigiano', 1400, FALSE),
  ('11111111-1111-1111-1111-111111111111', 'aaaa1111-0000-0000-0000-000000000003',
   'Branzino al sale', 'Branzino di lenza, patate al forno, limone', 2800, FALSE);

-- Drinks
INSERT INTO drinks (restaurant_id, category, name, producer, country, region, vintage,
                    wine_color, grape_varieties, price_bottle_cents, abv)
VALUES
  ('11111111-1111-1111-1111-111111111111', 'wine', 'Barolo DOCG', 'Cantina Demo', 'IT', 'Piemonte',
   2019, 'red', ARRAY['Nebbiolo'], 6500, 14.5),
  ('11111111-1111-1111-1111-111111111111', 'wine', 'Vermentino', 'Cantina Demo', 'IT', 'Sardegna',
   2023, 'white', ARRAY['Vermentino'], 2800, 12.5),
  ('11111111-1111-1111-1111-111111111111', 'beer', 'Pils artigianale', 'Birrificio Demo', 'IT', NULL,
   NULL, NULL, NULL, 850, 4.8);

-- Contatti
INSERT INTO contacts (restaurant_id, label, full_name, role, phone, email, is_primary)
VALUES
  ('11111111-1111-1111-1111-111111111111', 'Chef',      'Anna Bianchi', 'Executive Chef', '+39 333 1112222', 'chef@trattoriademo.it', TRUE),
  ('11111111-1111-1111-1111-111111111111', 'Sommelier', 'Luca Verdi',   'Head Sommelier', '+39 333 3334444', 'sommelier@trattoriademo.it', FALSE);

-- Orari
INSERT INTO opening_hours (restaurant_id, day_of_week, opens_at, closes_at, is_closed) VALUES
  ('11111111-1111-1111-1111-111111111111', 1, '12:00', '14:30', FALSE),
  ('11111111-1111-1111-1111-111111111111', 1, '19:00', '23:00', FALSE),
  ('11111111-1111-1111-1111-111111111111', 0, '00:00', '00:00', TRUE);  -- Domenica chiuso

COMMIT;
