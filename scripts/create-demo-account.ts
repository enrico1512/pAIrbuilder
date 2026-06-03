/**
 * create-demo-account.ts — crea (o aggiorna) l'account demo `test@ambrosiavino.com`.
 *
 * Uso: tsx scripts/create-demo-account.ts
 *
 * Questo account fa login e usa l'app normalmente, ma il server NON salva i suoi
 * dati di dominio (vedi isDemoSession in server.ts): piatti/drink/abbinamenti/
 * upload_sessions vengono ignorati. Resta solo la coppia users + restaurants.
 *
 * Idempotente: rilanciarlo ripristina la password e non duplica le righe.
 */
import 'dotenv/config';
import bcrypt from 'bcrypt';
import { pool } from '../db/client';

const ROUNDS = Number(process.env.BCRYPT_ROUNDS) || 12;
const DEMO_EMAIL = 'test@ambrosiavino.com';
const DEMO_PASSWORD = 'password';
const DEMO_SLUG = 'ristorante-demo';
const DEMO_RESTAURANT_NAME = 'Ristorante Demo';

try {
  // 1) Ristorante demo: trova per slug, altrimenti crealo (is_guest = false).
  let restaurant = (await pool.query(
    `SELECT id, slug, name FROM restaurants WHERE slug = $1 LIMIT 1`,
    [DEMO_SLUG],
  )).rows[0];

  if (!restaurant) {
    restaurant = (await pool.query(
      `INSERT INTO restaurants (slug, name, is_guest)
       VALUES ($1, $2, FALSE)
       RETURNING id, slug, name`,
      [DEMO_SLUG, DEMO_RESTAURANT_NAME],
    )).rows[0];
    console.log(`Ristorante creato: ${restaurant.name} (${restaurant.id})`);
  } else {
    console.log(`Ristorante esistente: ${restaurant.name} (${restaurant.id})`);
  }

  // 2) Utente demo: trova per email, altrimenti crealo; in entrambi i casi
  //    (re)imposta la password così rilanciare lo script la ripristina.
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, ROUNDS);
  const existingUser = (await pool.query(
    `SELECT id FROM users WHERE email = $1 LIMIT 1`,
    [DEMO_EMAIL],
  )).rows[0];

  let user;
  if (existingUser) {
    user = (await pool.query(
      `UPDATE users
          SET password_hash = $1,
              restaurant_id = $2,
              role = 'owner',
              is_platform_admin = FALSE,
              is_active = TRUE,
              updated_at = NOW()
        WHERE email = $3
      RETURNING id, email`,
      [passwordHash, restaurant.id, DEMO_EMAIL],
    )).rows[0];
    console.log(`Utente aggiornato (password reimpostata): ${user.email} (${user.id})`);
  } else {
    user = (await pool.query(
      `INSERT INTO users (restaurant_id, email, password_hash, role, is_platform_admin)
       VALUES ($1, $2, $3, 'owner', FALSE)
       RETURNING id, email`,
      [restaurant.id, DEMO_EMAIL, passwordHash],
    )).rows[0];
    console.log(`Utente creato: ${user.email} (${user.id})`);
  }

  console.log('\nAccount demo pronto:');
  console.log(`  login:      ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
  console.log(`  ristorante: ${restaurant.name} (slug: ${restaurant.slug})`);
} catch (err: any) {
  console.error('Errore:', err?.message || err);
  process.exit(1);
} finally {
  await pool.end();
}
