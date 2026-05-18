import 'dotenv/config';
import { readFileSync } from 'fs';
import { Pool } from 'pg';

const file = process.argv[2];
if (!file) {
  console.error('Uso: tsx scripts/apply-sql.ts <file.sql>');
  process.exit(1);
}

const sql = readFileSync(file, 'utf8');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
});

try {
  console.log(`Applico ${file} su Neon...`);
  await pool.query(sql);
  console.log('OK applicato.');
} catch (err: any) {
  console.error('Errore:', err?.message || err);
  process.exit(1);
} finally {
  await pool.end();
}
