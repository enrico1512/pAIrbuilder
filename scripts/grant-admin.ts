/**
 * grant-admin.ts — promuove un utente a platform_admin.
 *
 * Uso: tsx scripts/grant-admin.ts <email>
 *
 * Effetto: imposta users.is_platform_admin = TRUE per l'utente con quell'email.
 * Solo gli admin possono usare gli endpoint /api/admin/*.
 */
import 'dotenv/config';
import { Pool } from 'pg';

const email = process.argv[2];
if (!email) {
  console.error('Uso: tsx scripts/grant-admin.ts <email>');
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
});

try {
  const { rows } = await pool.query(
    `UPDATE users SET is_platform_admin = TRUE
     WHERE email = $1
     RETURNING id, email, is_platform_admin`,
    [email],
  );
  if (rows.length === 0) {
    console.error(`Nessun utente trovato con email "${email}".`);
    process.exit(1);
  }
  console.log('Promosso a platform admin:', rows[0]);
} catch (err: any) {
  console.error('Errore:', err?.message || err);
  process.exit(1);
} finally {
  await pool.end();
}
