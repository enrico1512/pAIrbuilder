/**
 * RESET PER SESSIONE DI PROVA — pulizia database.
 *
 * Tiene SOLO l'account admin "Ambrosia Vino" (login intatto, ma dati svuotati);
 * cancella tutti gli altri ristoranti/utenti e i loro dati, piu' cache AI e token.
 *
 * Sicurezza:
 *  - NON cancella nulla senza il flag --confirm (di default fa solo l'anteprima).
 *  - Lavora dentro una transazione: o va a buon fine tutto, o non cambia nulla.
 *  - Stampa i conteggi PRIMA e DOPO.
 *  - Si ferma se l'utente admin non viene trovato.
 *
 * Uso:
 *   npx tsx scripts/reset-for-test.ts            # anteprima (dry-run, nessuna modifica)
 *   npx tsx scripts/reset-for-test.ts --confirm  # esegue davvero la cancellazione
 */
import 'dotenv/config';
import { pool } from '../db/client';

const ADMIN_EMAIL = 'enrico.patrizio@ambrosiavino.com';
const confirmed = process.argv.includes('--confirm');

async function counts() {
  const r = await pool.query(
    `SELECT
       (SELECT count(*) FROM restaurants)      AS restaurants,
       (SELECT count(*) FROM users)            AS users,
       (SELECT count(*) FROM food_items)       AS dishes,
       (SELECT count(*) FROM drinks)           AS drinks,
       (SELECT count(*) FROM pairings)         AS pairings,
       (SELECT count(*) FROM upload_sessions)  AS upload_sessions`,
  );
  return r.rows[0];
}

async function main() {
  console.log('Conteggi PRIMA:', await counts());

  const admin = await pool.query(
    'SELECT restaurant_id FROM users WHERE email = $1',
    [ADMIN_EMAIL],
  );
  if (admin.rowCount === 0) {
    console.error(`\nSTOP: utente admin "${ADMIN_EMAIL}" non trovato. Nessuna modifica.`);
    process.exitCode = 1;
    return;
  }

  if (!confirmed) {
    console.log('\nDRY-RUN (anteprima): nessuna cancellazione eseguita.');
    console.log('Per eseguire davvero:  npx tsx scripts/reset-for-test.ts --confirm');
    return;
  }

  const c = await pool.connect();
  try {
    await c.query('BEGIN');

    // 1) Elimina tutti i ristoranti TRANNE quello dell'admin.
    //    Il vincolo ON DELETE CASCADE rimuove a catena i loro utenti, piatti,
    //    drink, abbinamenti, sessioni di upload, ecc.
    await c.query(
      'DELETE FROM restaurants WHERE id NOT IN (SELECT restaurant_id FROM users WHERE email = $1)',
      [ADMIN_EMAIL],
    );

    // 2) Svuota i dati del ristorante admin rimasto (resta SOLO lui in tabella,
    //    quindi "IN (SELECT id FROM restaurants)" = il ristorante admin).
    for (const t of [
      'pairings',
      'food_items',
      'drinks',
      'food_categories',
      'contacts',
      'opening_hours',
      'upload_sessions',
    ]) {
      await c.query(`DELETE FROM ${t} WHERE restaurant_id IN (SELECT id FROM restaurants)`);
    }

    // 3) Azzera audit AI, cache estrazioni e token (reset/verifica) — globali.
    await c.query('DELETE FROM ai_requests');
    await c.query('DELETE FROM ai_extractions_cache');
    await c.query('DELETE FROM auth_tokens');

    await c.query('COMMIT');
  } catch (e) {
    await c.query('ROLLBACK');
    throw e;
  } finally {
    c.release();
  }

  console.log('Conteggi DOPO: ', await counts());
  console.log('\nReset completato: resta solo "Ambrosia Vino" (login admin), dati svuotati.');
}

main()
  .catch((err: any) => {
    console.error('ERRORE (transazione annullata, nessuna modifica applicata):', err?.message || err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
