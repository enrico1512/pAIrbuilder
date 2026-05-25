/**
 * Client per la cache estrazioni AI (vedi server.ts /api/ai-cache/*).
 *
 * Scopo: prima di passare un file all'estrazione AI (listItemNames +
 * extractMenuData = 2 chiamate AI), calcoliamo l'hash binario SHA-256 e
 * chiediamo al server se ha gia' il risultato in cache. Se si', skippiamo
 * entrambe le chiamate. Se no, dopo l'estrazione salviamo il risultato per
 * il prossimo upload (anche da utenti diversi).
 *
 * La cache e' globale (non scoped al ristorante): se due ristoranti
 * caricano lo stesso PDF, paghiamo l'AI una sola volta.
 */

export type UploadType = 'menu' | 'drinks';

export interface CachedExtraction {
  dishes: any[];
  drinks: any[];
  [k: string]: any;
}

/**
 * SHA-256 hex del contenuto binario di un File. Usa Web Crypto, disponibile
 * in tutti i browser moderni (https-only) e su localhost.
 */
export async function sha256File(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buf);
  const bytes = new Uint8Array(digest);
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return hex;
}

/**
 * Lookup cache. Ritorna { hit: true, result, model } se il server ha gia'
 * un'estrazione cachata per (hash, uploadType), altrimenti { hit: false }.
 * Non lancia mai: se il server e' down o l'endpoint risponde 500,
 * ritorniamo miss e l'estrazione AI parte normalmente.
 */
export async function lookupCache(
  hash: string,
  uploadType: UploadType
): Promise<{ hit: boolean; result?: CachedExtraction; model?: string | null }> {
  try {
    const res = await fetch(`/api/ai-cache/${hash}?type=${uploadType}`);
    if (!res.ok) return { hit: false };
    const data = await res.json();
    return data?.hit
      ? { hit: true, result: data.result, model: data.model }
      : { hit: false };
  } catch {
    return { hit: false };
  }
}

/**
 * Salva un'estrazione in cache. Fire-and-forget: errori loggati ma non
 * propagati — il fallimento del salvataggio cache non deve impattare l'UX.
 */
export async function saveCache(
  hash: string,
  uploadType: UploadType,
  result: CachedExtraction,
  model: string | null = null
): Promise<void> {
  try {
    await fetch('/api/ai-cache', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hash, uploadType, result, model }),
    });
  } catch (err) {
    console.warn('[aiCache] save failed (non-fatal):', err);
  }
}
