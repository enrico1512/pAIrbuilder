import 'dotenv/config';
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
});

try {
  const tables = ['restaurants', 'users', 'food_categories', 'food_items', 'drinks', 'contacts'];
  for (const t of tables) {
    const r = await pool.query(`SELECT count(*)::int AS n FROM ${t}`);
    console.log(`${t.padEnd(20)} ${r.rows[0].n}`);
  }
} finally {
  await pool.end();
}
