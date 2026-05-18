/**
 * pAIrbuilder — Drizzle client
 * Inizializza il pool Postgres e l'istanza Drizzle.
 * Importa `db` dal resto dell'app per query type-safe.
 */
import 'dotenv/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL non definita. Controlla il tuo .env');
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Su Neon/Replit/Supabase serve SSL
  ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
});

export const db = drizzle(pool, { schema });
export { schema };
