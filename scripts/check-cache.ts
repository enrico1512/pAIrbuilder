import 'dotenv/config';
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
});

try {
  const rows = await pool.query(`
    SELECT LEFT(file_hash, 16) AS hash_prefix, upload_type, model, hit_count,
           created_at, last_hit_at,
           jsonb_array_length(COALESCE(result->'dishes', '[]'::jsonb)) AS n_dishes,
           jsonb_array_length(COALESCE(result->'drinks', '[]'::jsonb)) AS n_drinks
    FROM ai_extractions_cache
    ORDER BY last_hit_at DESC
  `);
  console.log(`Record in ai_extractions_cache: ${rows.rowCount}`);
  rows.rows.forEach((r, i) => {
    console.log(`\n  [${i + 1}] ${r.hash_prefix}... (${r.upload_type})`);
    console.log(`      model: ${r.model || '-'}`);
    console.log(`      dishes: ${r.n_dishes}, drinks: ${r.n_drinks}`);
    console.log(`      hits: ${r.hit_count}`);
    console.log(`      created: ${r.created_at.toISOString()}`);
    console.log(`      last_hit: ${r.last_hit_at.toISOString()}`);
  });

  if (process.argv[2] === '--purge-test') {
    const del = await pool.query(
      `DELETE FROM ai_extractions_cache WHERE model = 'smoke-test'`
    );
    console.log(`\nPurged ${del.rowCount} test rows.`);
  }
} catch (err: any) {
  console.error('Errore:', err?.message || err);
  process.exit(1);
} finally {
  await pool.end();
}
