import 'dotenv/config';
import bcrypt from 'bcrypt';
import { Pool } from 'pg';

const ROUNDS = parseInt(process.env.BCRYPT_ROUNDS || '12', 10);
const DEMO_EMAIL = 'owner@trattoriademo.it';
const DEMO_PASSWORD = 'password123';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
});

try {
  const hash = await bcrypt.hash(DEMO_PASSWORD, ROUNDS);
  const result = await pool.query(
    'UPDATE users SET password_hash = $1 WHERE email = $2 RETURNING id',
    [hash, DEMO_EMAIL]
  );
  console.log(`Aggiornata password demo (${result.rowCount} record).`);
} catch (err: any) {
  console.error('Errore:', err?.message || err);
  process.exit(1);
} finally {
  await pool.end();
}
