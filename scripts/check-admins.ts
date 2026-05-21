/**
 * check-admins.ts — lista tutti gli utenti, con flag admin e ristorante.
 * Uso una tantum per verificare lo stato auth nel DB.
 */
import 'dotenv/config';
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
});

try {
  const { rows } = await pool.query(`
    SELECT u.email, u.role, u.is_platform_admin, r.name AS restaurant
    FROM users u
    LEFT JOIN restaurants r ON r.id = u.restaurant_id
    ORDER BY u.is_platform_admin DESC NULLS LAST, u.email
  `);
  console.log(`Totale utenti: ${rows.length}`);
  for (const r of rows) {
    const adm = r.is_platform_admin ? '[PLATFORM ADMIN]' : '';
    console.log(`  ${r.email}  (role=${r.role}, restaurant="${r.restaurant || '-'}") ${adm}`);
  }
} catch (e: any) {
  console.error('Errore:', e?.message || e);
  process.exit(1);
} finally {
  await pool.end();
}
