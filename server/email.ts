/**
 * Email transazionali via Resend (https://resend.com).
 *
 * Modalita':
 *  - PROD: se `RESEND_API_KEY` e' settata, invia via API REST Resend.
 *    Serve anche `RESEND_FROM_EMAIL` (es. "no-reply@ambrosiavino.com"),
 *    altrimenti ricade su "onboarding@resend.dev" che funziona ma e' brutto.
 *  - DEV/no-key: logga su console il contenuto della mail e ritorna successo.
 *    Cosi' lo sviluppo locale non richiede credenziali esterne: il token
 *    di reset/verifica si vede direttamente nei log del server.
 *
 * L'API Resend e' minimale: POST /emails con { from, to, subject, html }.
 * Niente SDK npm aggiuntivo: usiamo fetch nativo di Node 20.
 */

const RESEND_API_URL = 'https://api.resend.com/emails';

export interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
  /** Plaintext fallback opzionale. Resend lo genera in auto se omesso. */
  text?: string;
}

export interface SendEmailResult {
  ok: boolean;
  /** ID restituito da Resend (utile per supporto). Null in modalita' dev. */
  id?: string | null;
  /** Errore lato provider se ok=false. */
  error?: string;
  /** True se il messaggio non e' stato inviato davvero ma solo loggato
   *  (RESEND_API_KEY mancante). Utile al chiamante per scegliere se
   *  mostrare un avviso in UI in dev mode. */
  devFallback?: boolean;
}

export async function sendEmail(params: SendEmailParams): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  // Default `from` usa il sottodominio dedicato `pairbuilder.ambrosiavino.com`
  // (verificato su Resend con DKIM/SPF/DMARC). Vantaggio rispetto al root:
  // zero impatto sui record DNS del sito principale e reputation email
  // isolata dall'app. Override via env RESEND_FROM_EMAIL se serve.
  const from = process.env.RESEND_FROM_EMAIL || 'pAIrbuilder <noreply@pairbuilder.ambrosiavino.com>';

  // Dev fallback: nessuna chiave, logghiamo la mail in console e basta.
  if (!apiKey) {
    console.log('\n[email DEV-FALLBACK] no RESEND_API_KEY, email NOT actually sent');
    console.log(`  to:      ${params.to}`);
    console.log(`  from:    ${from}`);
    console.log(`  subject: ${params.subject}`);
    console.log(`  body (text):`);
    const bodyForLog = (params.text || params.html).replace(/<[^>]+>/g, '').trim();
    console.log(bodyForLog.split('\n').map((l) => '    ' + l).join('\n'));
    console.log('');
    return { ok: true, id: null, devFallback: true };
  }

  try {
    const res = await fetch(RESEND_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [params.to],
        subject: params.subject,
        html: params.html,
        text: params.text,
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.error('[email Resend] error:', res.status, text);
      return { ok: false, error: `Resend HTTP ${res.status}: ${text || 'unknown'}` };
    }
    const data = (await res.json().catch(() => ({}))) as { id?: string };
    return { ok: true, id: data.id || null };
  } catch (err: any) {
    console.error('[email Resend] network error:', err?.message || err);
    return { ok: false, error: err?.message || 'network error' };
  }
}

/**
 * Helper: costruisce un link assoluto (es. https://pairbuilder.../verify-email?token=XYZ)
 * basato sulla env `APP_URL`. Se non settata, ripiega su localhost:PORT — utile
 * solo in dev, in prod va settato a https://pairbuilder.ambrosiavino.com.
 */
export function buildAppUrl(path: string): string {
  const base = (process.env.APP_URL || `http://localhost:${process.env.PORT || 3000}`).replace(/\/+$/, '');
  const cleanPath = path.startsWith('/') ? path : '/' + path;
  return base + cleanPath;
}
