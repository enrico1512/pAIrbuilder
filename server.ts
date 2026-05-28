import dotenv from 'dotenv';
// override:true → il .env locale vince sulle env gia' presenti nel processo.
// Necessario perche' chi lancia il server (es. Claude Code) puo' iniettare
// ANTHROPIC_API_KEY="" nell'ambiente, e dotenv di default non sovrascrive
// le var gia' definite — risultato: chiave Anthropic letta come vuota.
// In produzione su Render non esiste .env, quindi questa chiamata e' un
// no-op e le var del dashboard restano autoritative.
dotenv.config({ override: true });
import express, { Request, Response, NextFunction } from 'express';
import session from 'express-session';
import connectPg from 'connect-pg-simple';
import bcrypt from 'bcrypt';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import { and, eq } from 'drizzle-orm';
// Provider SDK non piu' usati: tutte le chiamate AI passano per
// l'endpoint openai-compatible (OpenAI diretto o OpenRouter come
// gateway). Il payload Gemini-style viene convertito in messages
// openai-style nel proxy /api/gemini/generate.
// @e965/xlsx = fork patchato (vedi src/lib/fileParser.ts per dettagli CVE).
import * as XLSX from '@e965/xlsx';
import { db, pool } from './db/client';
import { randomBytes, createHash } from 'crypto';
import {
  restaurants,
  users,
  authTokens,
  foodCategories,
  foodItems,
  drinks,
  contacts,
  pairings,
  uploadSessions,
} from './db/schema';
import {
  getLang,
  tError,
  extractSystemPrompt,
  listItemsSystemPrompt,
  menuScanSystemPrompt,
  menuScanFallbackUserText,
  menuExtractSystemPrompt,
  menuExtractUserPrefix,
  pairingsSystemPrompt,
  pairingsUserPrefix,
} from './server/i18n';
import { sendEmail, buildAppUrl } from './server/email';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

declare module 'express-session' {
  interface SessionData {
    userId?: string;
    restaurantId?: string;
    /** Restaurant ID creato al volo per sessioni anonime. Mutuamente
     *  esclusivo con restaurantId/userId in pratica. */
    guestRestaurantId?: string;
  }
}

const BCRYPT_ROUNDS = parseInt(process.env.BCRYPT_ROUNDS || '12', 10);
const PORT = Number(process.env.PORT) || 3000;
const APP_URL = process.env.APP_URL || `http://localhost:${PORT}`;
// Flag diagnostico locale: con DEBUG_AI=1 ogni chiamata proxy AI logga
// prompt + risposta troncati, utile per capire cosa l'AI estrae davvero.
const DEBUG_AI = process.env.DEBUG_AI === '1';

// =====================================================================
// AI GATEWAY (OpenRouter): se OPENROUTER_API_KEY e' settata, TUTTE le
// chiamate AI passano per OpenRouter via endpoint openai-compatible
// (/api/v1/chat/completions). Una sola chiave, una sola fattura aziendale
// BIBI Srl, dashboard unica. Markup ~5% sui modelli premium.
//
// Se OPENROUTER_API_KEY NON e' settata, fallback al comportamento
// pre-gateway: 3 chiavi separate (OPENAI/ANTHROPIC/GEMINI) verso i
// provider diretti. Permette dev locale con account personali.
// =====================================================================
const USE_OPENROUTER = !!process.env.OPENROUTER_API_KEY;
const AI_BASE_URL = USE_OPENROUTER
  ? (process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1')
  : (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1');
const OPENAI_CHAT_URL = AI_BASE_URL + '/chat/completions';

/** Chiave API da usare per le chiamate openai-style. Con gateway attivo
 *  e' sempre quella OpenRouter; senza gateway, dipende dal provider. */
function aiKey(provider: 'openai' | 'anthropic' | 'gemini'): string | undefined {
  if (USE_OPENROUTER) return process.env.OPENROUTER_API_KEY;
  if (provider === 'openai') return process.env.OPENAI_API_KEY;
  if (provider === 'anthropic') return process.env.ANTHROPIC_API_KEY;
  return process.env.GEMINI_API_KEY;
}

/** Nome modello compatibile con il provider scelto. Su OpenRouter va
 *  prefissato (openai/, anthropic/, google/). Per i modelli Gemini
 *  OpenRouter pretende il suffisso versione esatto (es. `-001`), gli
 *  alias corti tipo `gemini-2.0-flash` non sono accettati. */
const OPENROUTER_GEMINI_MAP: Record<string, string> = {
  'gemini-2.0-flash': 'gemini-2.0-flash-001',
  'gemini-2.5-flash': 'gemini-2.5-flash',
  'gemini-2.5-pro': 'gemini-2.5-pro',
  'gemini-1.5-flash': 'gemini-1.5-flash',
  'gemini-1.5-pro': 'gemini-1.5-pro',
};
function aiModelName(provider: 'openai' | 'anthropic' | 'gemini', model: string): string {
  if (!USE_OPENROUTER) return model;
  if (provider === 'gemini') {
    const remapped = OPENROUTER_GEMINI_MAP[model] || model;
    return `google/${remapped}`;
  }
  return `${provider}/${model}`;
}

/** Headers per le chiamate openai-style. OpenRouter usa HTTP-Referer e
 *  X-Title per analytics e ranking dei provider (best practice raccomandata
 *  dalla loro doc). */
function aiHeaders(provider: 'openai' | 'anthropic' | 'gemini'): Record<string, string> {
  const key = aiKey(provider);
  const h: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${key}`,
  };
  if (USE_OPENROUTER) {
    h['HTTP-Referer'] = APP_URL;
    h['X-Title'] = 'pAIrbuilder';
  }
  return h;
}
function aiLog(label: string, payload: unknown) {
  if (!DEBUG_AI) return;
  const s = typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2);
  const head = s.length > 2000 ? s.slice(0, 2000) + `\n... [+${s.length - 2000} char]` : s;
  console.log(`\n[AI ${label}] ${head}\n`);
}

/**
 * fetch verso OpenAI con retry sui 429 (rate limit TPM). OpenAI suggerisce
 * il delay nel messaggio errore ("Please try again in 13.16s"); lo onoriamo
 * (clampato a 30s) e ritentiamo fino a MAX_ATTEMPTS volte. I 401/400 e gli
 * altri non-429 falliscono subito.
 */
async function openaiFetchWithRetry(url: string, init: RequestInit, label: string): Promise<globalThis.Response> {
  const MAX_ATTEMPTS = 4;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const resp = await fetch(url, init);
    if (resp.ok || resp.status !== 429) return resp;
    if (attempt === MAX_ATTEMPTS) return resp;
    // Peek body senza consumarlo per il caller: clono la response.
    const cloned = resp.clone();
    let bodyText = '';
    try { bodyText = await cloned.text(); } catch {}
    const m = /try again in ([\d.]+)s/i.exec(bodyText);
    const suggested = m ? parseFloat(m[1]) : (2 ** attempt);
    const waitSec = Math.min(30, Math.max(1, suggested));
    console.warn(`[${label}] OpenAI 429 attempt ${attempt}/${MAX_ATTEMPTS}, sleeping ${waitSec.toFixed(1)}s before retry`);
    await new Promise(r => setTimeout(r, waitSec * 1000));
  }
  // Unreachable (sopra ritorniamo prima), ma TS lo vuole esplicito
  return fetch(url, init);
}

async function startServer() {
  const app = express();
  // Render (e tutti i PaaS managed: Heroku, Fly, Vercel, Replit) terminano
  // TLS su un loadbalancer davanti al nostro processo. Senza trust proxy,
  // express-session non vede la request come "secure" e rifiuta di settare
  // il cookie Secure → la sessione non persiste tra chiamate in produzione.
  app.set('trust proxy', 1);

  // Header di sicurezza standard (X-Content-Type-Options, X-Frame-Options DENY,
  // Strict-Transport-Security, ecc.). CSP disabilitata per ora: la SPA Vite
  // carica script con hash inline che andrebbero whitelistati nella policy —
  // lavoro da fare quando il dominio finale e' fissato (pairbuilder.ambrosiavino.com).
  app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));

  app.use(express.json({ limit: '50mb' }));

  // ---------- Rate limiting -----------------------------------------------
  // Tre profili:
  //  - authLimiter: 10 req / 5 min per IP sui POST auth (login/register/etc),
  //    previene brute force credentials.
  //  - aiLimiter: 60 req / min per IP sugli endpoint AI proxy, previene abuse
  //    delle chiavi API server-side.
  //  - defaultLimiter: 300 req / min per IP — copre tutto il resto, evita DoS.
  const authLimiter = rateLimit({
    windowMs: 5 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: false,
    message: { error: 'Troppi tentativi, riprova fra qualche minuto.' },
  });
  const aiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Troppe richieste AI, riprova fra qualche secondo.' },
  });
  const defaultLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
    // Exclude health checks dal rate limit globale — Render lo interroga di
    // frequente per il monitoring.
    skip: (req) => req.path === '/api/health',
    message: { error: 'Troppe richieste, riprova fra qualche secondo.' },
  });
  app.use(defaultLimiter);

  // Health check: minimo, no DB. Render lo usa per healthCheckPath in
  // render.yaml. Risponde anche se Neon e' down — questo deliberatamente
  // tiene il servizio up nelle finestre di degrado parziale.
  //
  // `commit` proviene dalla env var RENDER_GIT_COMMIT che Render espone
  // automaticamente sui Web Service: utile per capire dal client quale
  // build e' attivo, anche dopo un cold-restart che azzera l'uptime
  // senza essere stato un vero redeploy.
  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      ts: Date.now(),
      uptime: process.uptime(),
      commit: process.env.RENDER_GIT_COMMIT?.slice(0, 7) || 'local',
      branch: process.env.RENDER_GIT_BRANCH || null,
    });
  });

  // SESSION_SECRET: in produzione DEVE essere presente. Se manca (cold boot
  // su Render con env dimenticate in dashboard), fail-fast invece di firmare
  // i cookie con 'cambia-questo' = secret pubblico nel codice → session takeover.
  // Decisione 28 mag 2026 (audit security).
  const sessionSecret = process.env.SESSION_SECRET;
  if (process.env.NODE_ENV === 'production' && (!sessionSecret || sessionSecret === 'cambia-questo')) {
    throw new Error(
      "[FATAL] SESSION_SECRET non settato (o ancora al default 'cambia-questo') in produzione. " +
      "Setta la env nella dashboard del provider prima di avviare il server."
    );
  }
  const PgStore = connectPg(session);
  app.use(
    session({
      store: new PgStore({
        pool,
        tableName: 'sessions',
        createTableIfMissing: false,
      }),
      secret: sessionSecret || 'cambia-questo',
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 30 * 24 * 60 * 60 * 1000,
      },
    })
  );

  function requireAuth(req: Request, res: Response, next: NextFunction) {
    if (!req.session.userId || !req.session.restaurantId) {
      return res.status(401).json({ error: tError(getLang(req), 'notAuth') });
    }
    next();
  }

  /** Restaurant scope per la sessione corrente: utente loggato OPPURE ospite
   *  che ha completato /api/guest/onboarding. Null se nessuno. */
  function sessionRestaurantId(req: Request): string | null {
    return req.session.restaurantId || req.session.guestRestaurantId || null;
  }

  function requireSession(req: Request, res: Response, next: NextFunction) {
    if (!sessionRestaurantId(req)) {
      return res.status(401).json({ error: tError(getLang(req), 'notAuth') });
    }
    next();
  }

  async function requireAdmin(req: Request, res: Response, next: NextFunction) {
    if (!req.session.userId) {
      return res.status(401).json({ error: tError(getLang(req), 'notAuth') });
    }
    const [u] = await db.select({ admin: users.isPlatformAdmin })
      .from(users).where(eq(users.id, req.session.userId)).limit(1);
    if (!u || !u.admin) {
      return res.status(403).json({ error: tError(getLang(req), 'notAuth') });
    }
    next();
  }

  // ====================================================================
  // AUTH
  // ====================================================================
  // Genera uno slug univoco a partire dal nome ristorante. Due ristoranti
  // possono chiamarsi uguale (es. due "Trattoria del Borgo"), ma lo slug
  // deve essere unique per il routing admin: aggiungiamo un suffix random
  // di 6 caratteri base36. Probabilita' di collisione con 1M ristoranti:
  // ~0.05%. Retry server-side al 1° conflitto (max 3) per blindare.
  function slugifyServer(name: string): string {
    return String(name || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 50) || 'ristorante';
  }
  function uniqueSlugSuffix(): string {
    return Math.random().toString(36).slice(2, 8);
  }

  app.post('/api/auth/register', authLimiter, async (req, res) => {
    try {
      const { restaurantName, email, password, fullName, preferredLanguage, captchaToken } = req.body || {};
      if (!restaurantName || !email || !password) {
        return res
          .status(400)
          .json({ error: tError(getLang(req), 'missingFields', { fields: 'restaurantName, email, password' }) });
      }
      const captchaOk = await verifyTurnstile(captchaToken, req.ip);
      if (!captchaOk) {
        const lng = getLang(req);
        return res.status(400).json({ error: lng === 'en' ? 'Captcha verification failed. Please retry.' : 'Verifica anti-bot non riuscita. Riprova.' });
      }
      const lang = preferredLanguage === 'en' || preferredLanguage === 'it'
        ? preferredLanguage
        : getLang(req);
      const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

      // Lo slug e' SEMPRE generato server-side: nome ristorante normalizzato
      // + suffix random. Cosi' due ristoranti che si chiamano uguali non
      // collidono mai sull'utente finale (l'identificazione e' email+password).
      const slugBase = slugifyServer(restaurantName);
      const slug = `${slugBase}-${uniqueSlugSuffix()}`;

      // ADOZIONE GUEST: se l'utente sta registrandosi dopo aver gia' usato
      // l'app come ospite, riusa il suo restaurant guest invece di crearne
      // uno nuovo. Cosi' dishes/drinks/pairings/upload_sessions gia' salvati
      // sotto il guest restaurant restano collegati al profilo registrato
      // (incluso il consumo del 1° upload gratuito — coerente col modello
      // pay-per-use: il free vale "per restaurant", non "per utente").
      const guestRid = req.session.guestRestaurantId || null;
      let restaurant;
      if (guestRid) {
        const [existing] = await db.select().from(restaurants).where(eq(restaurants.id, guestRid)).limit(1);
        if (existing && existing.isGuest) {
          [restaurant] = await db.update(restaurants)
            .set({
              slug,
              name: restaurantName,
              defaultLanguage: lang,
              isGuest: false,
              guestEmail: null,
              guestPhone: null,
            })
            .where(eq(restaurants.id, guestRid))
            .returning();
        }
      }
      if (!restaurant) {
        [restaurant] = await db
          .insert(restaurants)
          .values({ slug, name: restaurantName, defaultLanguage: lang })
          .returning();
      }

      const [user] = await db
        .insert(users)
        .values({
          restaurantId: restaurant.id,
          email,
          passwordHash,
          fullName: fullName ?? null,
          preferredLanguage: lang,
        })
        .returning();
      req.session.userId = user.id;
      req.session.restaurantId = restaurant.id;
      // Sostituiamo l'id guest in sessione con quello del restaurant promosso
      // (stesso valore in caso di adozione), e azzeriamo la chiave guest per
      // chiarezza: da ora in poi sessionRestaurantId() torna req.session.restaurantId.
      req.session.guestRestaurantId = undefined;
      // Spedisce l'email di verifica in background (best-effort: se la
      // chiave email manca o c'e' un errore, l'utente viene loggato lo
      // stesso e potra' riconfermare via "rinvia email" piu' tardi).
      void sendVerifyEmail(user.id, user.email, lang as 'it' | 'en');
      res.json({
        user: { id: user.id, email: user.email, fullName: user.fullName, preferredLanguage: user.preferredLanguage, emailVerified: false },
        restaurant: { id: restaurant.id, slug: restaurant.slug, name: restaurant.name },
        adoptedGuest: !!guestRid && restaurant.id === guestRid,
      });
    } catch (err: any) {
      console.error('Register error:', err);
      // Postgres unique constraint violation (codice 23505): traduciamo in
      // un 409 con messaggio comprensibile invece di restituire il dump
      // tecnico Drizzle che il client mostrerebbe come "errore generico".
      // I due constraint che possono fallire sono users_email_key e
      // restaurants_slug_key (oltre a eventuali altri unique non previsti).
      const pgCode = err?.cause?.code || err?.code;
      const constraint = err?.cause?.constraint || err?.constraint;
      if (pgCode === '23505') {
        const lang = getLang(req);
        if (String(constraint).includes('email')) {
          return res.status(409).json({
            error: lang === 'en'
              ? 'This email is already registered. Try logging in instead.'
              : 'Questa email è già registrata. Prova ad accedere invece.',
          });
        }
        if (String(constraint).includes('slug')) {
          return res.status(409).json({
            error: lang === 'en'
              ? 'A restaurant with this name already exists. Try a slightly different name.'
              : 'Esiste già un ristorante con questo nome. Prova con un nome leggermente diverso.',
          });
        }
        return res.status(409).json({
          error: lang === 'en' ? 'Duplicate entry.' : 'Dato duplicato già presente.',
        });
      }
      res.status(500).json({ error: err?.message || tError(getLang(req), 'registrationFailed') });
    }
  });

  app.post('/api/auth/login', authLimiter, async (req, res) => {
    try {
      const { email, password } = req.body || {};
      if (!email || !password) {
        return res.status(400).json({ error: tError(getLang(req), 'emailPasswordRequired') });
      }
      const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
      if (!user) return res.status(401).json({ error: tError(getLang(req), 'invalidCredentials') });
      const ok = await bcrypt.compare(password, user.passwordHash);
      if (!ok) return res.status(401).json({ error: tError(getLang(req), 'invalidCredentials') });
      req.session.userId = user.id;
      req.session.restaurantId = user.restaurantId;
      await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));
      res.json({
        user: { id: user.id, email: user.email, fullName: user.fullName, preferredLanguage: user.preferredLanguage, emailVerified: !!user.emailVerifiedAt },
        restaurantId: user.restaurantId,
      });
    } catch (err: any) {
      console.error('Login error:', err);
      res.status(500).json({ error: err?.message || tError(getLang(req), 'loginFailed') });
    }
  });

  app.post('/api/auth/logout', (req, res) => {
    req.session.destroy(() => res.json({ ok: true }));
  });

  app.get('/api/auth/me', requireAuth, async (req, res) => {
    const [user] = await db.select().from(users).where(eq(users.id, req.session.userId!)).limit(1);
    if (!user) return res.status(401).json({ error: tError(getLang(req), 'userNotFound') });
    const [rest] = await db
      .select()
      .from(restaurants)
      .where(eq(restaurants.id, user.restaurantId))
      .limit(1);
    res.json({
      user: { id: user.id, email: user.email, fullName: user.fullName, preferredLanguage: user.preferredLanguage, emailVerified: !!user.emailVerifiedAt },
      restaurant: rest,
    });
  });

  /** Rinvia l'email di verifica all'utente loggato (utile se l'originale e'
   *  andata persa). Rate-limited come gli altri auth. */
  app.post('/api/auth/resend-verification', authLimiter, requireAuth, async (req, res) => {
    try {
      const [user] = await db.select().from(users).where(eq(users.id, req.session.userId!)).limit(1);
      if (!user) return res.status(401).json({ error: tError(getLang(req), 'userNotFound') });
      if (user.emailVerifiedAt) {
        const lang = getLang(req);
        return res.json({ ok: true, already: true, message: lang === 'en' ? 'Email already verified.' : 'Email gia\' verificata.' });
      }
      await sendVerifyEmail(user.id, user.email, (user.preferredLanguage as 'it'|'en') || 'it');
      res.json({ ok: true });
    } catch (err: any) {
      console.error('Resend verification error:', err);
      res.status(500).json({ error: err?.message || 'resend-verification failed' });
    }
  });

  // ====================================================================
  // VERIFY EMAIL / RESET PASSWORD — token usa-e-getta in `auth_tokens`.
  // Salviamo SOLO l'hash sha256 del token, mai il valore in chiaro:
  // se il DB viene letto, l'attaccante non puo' ricavare token validi.
  // ====================================================================

  function generateAuthToken(): { plain: string; hash: string } {
    // 32 byte random → 64 char hex. Probabilita' di indovinarne uno:
    // 1 / (16^64) → impossibile in pratica.
    const plain = randomBytes(32).toString('hex');
    const hash = createHash('sha256').update(plain).digest('hex');
    return { plain, hash };
  }

  function hashAuthToken(plain: string): string {
    return createHash('sha256').update(plain).digest('hex');
  }

  /**
   * Verifica un token Turnstile (Cloudflare). Se `TURNSTILE_SECRET_KEY`
   * non e' configurata, ritorna `true` (modalita' dev: il captcha e'
   * disattivato). In prod va settata insieme a TURNSTILE_SITE_KEY.
   */
  async function verifyTurnstile(token: string | undefined | null, remoteIp?: string): Promise<boolean> {
    const secret = process.env.TURNSTILE_SECRET_KEY;
    if (!secret) {
      // dev: nessuna chiave → tutti passano. Logghiamo per chiarezza.
      console.log('[turnstile DEV] no TURNSTILE_SECRET_KEY, skipping captcha verification');
      return true;
    }
    if (!token) return false;
    try {
      const form = new URLSearchParams({ secret, response: token });
      if (remoteIp) form.append('remoteip', remoteIp);
      const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST',
        body: form,
      });
      const data = (await r.json().catch(() => ({}))) as { success?: boolean };
      return !!data.success;
    } catch (err) {
      console.error('[turnstile] verify error:', err);
      return false;
    }
  }

  /** Invia email di verifica all'utente appena creato. Best-effort:
   *  loggato come warning su failure ma non blocca il register. */
  async function sendVerifyEmail(userId: string, email: string, lang: 'it' | 'en') {
    try {
      const { plain, hash } = generateAuthToken();
      // 7 giorni di validita' per la verifica email (link cliccabile a
      // partire dalla mail ricevuta).
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      await db.insert(authTokens).values({
        userId,
        tokenHash: hash,
        purpose: 'verify',
        expiresAt,
      });
      const link = buildAppUrl(`/verify-email?token=${plain}`);
      const subject = lang === 'en' ? 'Confirm your email — pAIrbuilder' : 'Conferma la tua email — pAIrbuilder';
      const html = lang === 'en'
        ? `<p>Hi,</p><p>Click the link below to confirm your email address:</p><p><a href="${link}">${link}</a></p><p>The link expires in 7 days.</p><p>If you didn't sign up, ignore this email.</p>`
        : `<p>Ciao,</p><p>Clicca il link qui sotto per confermare il tuo indirizzo email:</p><p><a href="${link}">${link}</a></p><p>Il link scade tra 7 giorni.</p><p>Se non ti sei registrato tu, ignora questa email.</p>`;
      await sendEmail({ to: email, subject, html });
    } catch (err) {
      console.warn('[verify-email] send failed (non-blocking):', err);
    }
  }

  /** POST /api/auth/forgot-password — invia email con link di reset.
   *  Per sicurezza la risposta e' sempre 200 anche se l'email non esiste
   *  (anti-enumeration). Il vero feedback arriva via email. */
  app.post('/api/auth/forgot-password', authLimiter, async (req, res) => {
    try {
      const { email, captchaToken } = req.body || {};
      if (!email) {
        return res.status(400).json({ error: tError(getLang(req), 'missingFields', { fields: 'email' }) });
      }
      const captchaOk = await verifyTurnstile(captchaToken, req.ip);
      if (!captchaOk) {
        const lang = getLang(req);
        return res.status(400).json({ error: lang === 'en' ? 'Captcha verification failed.' : 'Verifica anti-bot non riuscita.' });
      }
      const lang = getLang(req);
      const [user] = await db.select().from(users).where(eq(users.email, String(email).trim())).limit(1);
      if (user) {
        const { plain, hash } = generateAuthToken();
        const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 ora
        await db.insert(authTokens).values({
          userId: user.id,
          tokenHash: hash,
          purpose: 'reset',
          expiresAt,
        });
        const link = buildAppUrl(`/reset-password?token=${plain}`);
        const subject = lang === 'en' ? 'Reset your password — pAIrbuilder' : 'Reimposta la tua password — pAIrbuilder';
        const html = lang === 'en'
          ? `<p>Hi,</p><p>You requested a password reset. Click the link below to set a new password:</p><p><a href="${link}">${link}</a></p><p>The link expires in 1 hour. If you didn't request this, ignore this email.</p>`
          : `<p>Ciao,</p><p>Hai richiesto di reimpostare la password. Clicca il link qui sotto per sceglierne una nuova:</p><p><a href="${link}">${link}</a></p><p>Il link scade tra 1 ora. Se non sei stato tu, ignora questa email.</p>`;
        void sendEmail({ to: user.email, subject, html });
      }
      // Risposta uniforme indipendentemente dall'esistenza dell'utente.
      res.json({ ok: true });
    } catch (err: any) {
      console.error('Forgot password error:', err);
      res.status(500).json({ error: err?.message || 'forgot-password failed' });
    }
  });

  /** POST /api/auth/reset-password — verifica token + cambia password. */
  app.post('/api/auth/reset-password', authLimiter, async (req, res) => {
    try {
      const { token, newPassword } = req.body || {};
      if (!token || !newPassword) {
        return res.status(400).json({ error: tError(getLang(req), 'missingFields', { fields: 'token, newPassword' }) });
      }
      if (String(newPassword).length < 8) {
        const lang = getLang(req);
        return res.status(400).json({ error: lang === 'en' ? 'Password must be at least 8 characters.' : 'La password deve essere di almeno 8 caratteri.' });
      }
      const hash = hashAuthToken(String(token));
      const [row] = await db.select().from(authTokens)
        .where(and(eq(authTokens.tokenHash, hash), eq(authTokens.purpose, 'reset')))
        .limit(1);
      const lang = getLang(req);
      if (!row || row.usedAt || row.expiresAt < new Date()) {
        return res.status(400).json({ error: lang === 'en' ? 'Invalid or expired reset link.' : 'Link di reset non valido o scaduto.' });
      }
      const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
      await db.update(users).set({ passwordHash }).where(eq(users.id, row.userId));
      await db.update(authTokens).set({ usedAt: new Date() }).where(eq(authTokens.id, row.id));
      res.json({ ok: true });
    } catch (err: any) {
      console.error('Reset password error:', err);
      res.status(500).json({ error: err?.message || 'reset-password failed' });
    }
  });

  /** POST /api/auth/verify-email — marca email_verified_at su `users` se
   *  il token e' valido e non scaduto. */
  app.post('/api/auth/verify-email', authLimiter, async (req, res) => {
    try {
      const { token } = req.body || {};
      if (!token) {
        return res.status(400).json({ error: tError(getLang(req), 'missingFields', { fields: 'token' }) });
      }
      const hash = hashAuthToken(String(token));
      const [row] = await db.select().from(authTokens)
        .where(and(eq(authTokens.tokenHash, hash), eq(authTokens.purpose, 'verify')))
        .limit(1);
      const lang = getLang(req);
      if (!row || row.usedAt || row.expiresAt < new Date()) {
        return res.status(400).json({ error: lang === 'en' ? 'Invalid or expired verification link.' : 'Link di verifica non valido o scaduto.' });
      }
      await db.update(users).set({ emailVerifiedAt: new Date() }).where(eq(users.id, row.userId));
      await db.update(authTokens).set({ usedAt: new Date() }).where(eq(authTokens.id, row.id));
      res.json({ ok: true });
    } catch (err: any) {
      console.error('Verify email error:', err);
      res.status(500).json({ error: err?.message || 'verify-email failed' });
    }
  });

  app.put('/api/auth/preferred-language', requireAuth, async (req, res) => {
    try {
      const { language } = req.body || {};
      if (language !== 'it' && language !== 'en') {
        return res.status(400).json({ error: tError(getLang(req), 'missingFields', { fields: 'language (it|en)' }) });
      }
      await db.update(users).set({ preferredLanguage: language }).where(eq(users.id, req.session.userId!));
      res.json({ ok: true, language });
    } catch (err: any) {
      console.error('Update preferred language error:', err);
      res.status(500).json({ error: err?.message || tError(getLang(req), 'updateFailed') });
    }
  });

  // ====================================================================
  // GUEST onboarding — crea un restaurant "ospite" per la sessione anonima
  // ====================================================================
  // Quando un visitatore non loggato compila il form di onboarding, qui
  // creiamo un record `restaurants` con is_guest=true legato alla sua
  // sessione Express. Da quel momento gli endpoint /api/dishes|drinks|
  // pairings/bulk lo trattano come un utente loggato — solo che lo scope
  // restaurant_id punta a una riga marcata guest. L'owner di piattaforma
  // (Enrico) consulta poi questi record via gli endpoint admin.
  app.post('/api/guest/onboarding', async (req, res) => {
    try {
      const { name, type, email, phone, preferredLanguage } = req.body || {};
      if (!name || typeof name !== 'string') {
        return res.status(400).json({ error: tError(getLang(req), 'missingFields', { fields: 'name' }) });
      }
      if (req.session.restaurantId) {
        return res.json({ restaurantId: req.session.restaurantId, alreadyLoggedIn: true });
      }
      const lang = preferredLanguage === 'en' || preferredLanguage === 'it'
        ? preferredLanguage
        : getLang(req);
      if (req.session.guestRestaurantId) {
        await db.update(restaurants)
          .set({
            name: name.trim(),
            cuisineType: (type || '').trim() || null,
            guestEmail: (email || '').trim() || null,
            guestPhone: (phone || '').trim() || null,
            defaultLanguage: lang,
          })
          .where(eq(restaurants.id, req.session.guestRestaurantId));
        return res.json({ restaurantId: req.session.guestRestaurantId, reused: true });
      }
      const slug = `guest-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;
      const [rest] = await db.insert(restaurants).values({
        slug,
        name: name.trim(),
        cuisineType: (type || '').trim() || null,
        guestEmail: (email || '').trim() || null,
        guestPhone: (phone || '').trim() || null,
        isGuest: true,
        defaultLanguage: lang,
      }).returning();
      req.session.guestRestaurantId = rest.id;
      res.json({ restaurantId: rest.id, slug: rest.slug });
    } catch (err: any) {
      console.error('Guest onboarding error:', err);
      res.status(500).json({ error: err?.message || tError(getLang(req), 'insertFailed') });
    }
  });

  // ====================================================================
  // SAVE endpoints — bulk persist per dishes / drinks / pairings.
  // Funzionano sia per utenti loggati sia per ospiti (requireSession).
  // ====================================================================

  // Drink category normalizer: mappa stringhe varianti IT/EN al pgEnum DB
  type DrinkCat = 'wine' | 'beer' | 'spirit' | 'cocktail' | 'soft' | 'water' | 'hot';
  type WineColor = 'red' | 'white' | 'rose' | 'sparkling' | 'dessert' | 'fortified';
  const drinkCategoryMap: Record<string, { category: DrinkCat; wineColor?: WineColor }> = {
    'vino rosso': { category: 'wine', wineColor: 'red' },
    'red wine': { category: 'wine', wineColor: 'red' },
    'vino bianco': { category: 'wine', wineColor: 'white' },
    'white wine': { category: 'wine', wineColor: 'white' },
    'vino rosato': { category: 'wine', wineColor: 'rose' },
    'rose wine': { category: 'wine', wineColor: 'rose' },
    'rosé wine': { category: 'wine', wineColor: 'rose' },
    'bollicine': { category: 'wine', wineColor: 'sparkling' },
    'sparkling': { category: 'wine', wineColor: 'sparkling' },
    'spumante': { category: 'wine', wineColor: 'sparkling' },
    'champagne': { category: 'wine', wineColor: 'sparkling' },
    'prosecco': { category: 'wine', wineColor: 'sparkling' },
    'vino dolce': { category: 'wine', wineColor: 'dessert' },
    'sweet wine': { category: 'wine', wineColor: 'dessert' },
    'passito': { category: 'wine', wineColor: 'dessert' },
    'birra': { category: 'beer' },
    'beer': { category: 'beer' },
    'cocktail': { category: 'cocktail' },
    'spirit': { category: 'spirit' },
    'spirits': { category: 'spirit' },
    'distillato': { category: 'spirit' },
    'soft': { category: 'soft' },
    'analcolico': { category: 'soft' },
    'acqua': { category: 'water' },
    'water': { category: 'water' },
    'caffe': { category: 'hot' },
    'caffè': { category: 'hot' },
    'coffee': { category: 'hot' },
    'tea': { category: 'hot' },
  };

  function normalizeDrink(rawCategory: string): { category: DrinkCat; wineColor: WineColor | null } {
    const key = (rawCategory || '').toLowerCase().trim();
    for (const k of Object.keys(drinkCategoryMap)) {
      if (key.includes(k)) {
        const m = drinkCategoryMap[k];
        return { category: m.category, wineColor: m.wineColor ?? null };
      }
    }
    return { category: 'soft', wineColor: null };
  }

  function parsePriceCents(raw: string | undefined | null): number | null {
    if (!raw) return null;
    const cleaned = String(raw).replace(/[^\d.,]/g, '').replace(',', '.');
    const num = parseFloat(cleaned);
    if (!isFinite(num) || num <= 0) return null;
    return Math.round(num * 100);
  }

  function parseVintage(raw: string | undefined | null): number | null {
    if (!raw) return null;
    const m = String(raw).match(/\b(19|20)\d{2}\b/);
    return m ? parseInt(m[0], 10) : null;
  }

  app.post('/api/dishes/bulk', requireSession, async (req, res) => {
    try {
      const rid = sessionRestaurantId(req)!;
      const list: Array<{ name?: string; category?: string; fullIngredients?: string; price?: string }> = Array.isArray(req.body?.dishes) ? req.body.dishes : [];
      if (list.length === 0) return res.json({ inserted: 0 });
      const rows = list
        .filter(d => d.name && String(d.name).trim().length > 0)
        .map(d => ({
          restaurantId: rid,
          name: String(d.name).trim(),
          ingredients: (d.fullIngredients || '').trim() || null,
          description: (d.category || '').trim() || null, // category AI come hint testuale
          priceCents: parsePriceCents(d.price),
        }));
      if (rows.length === 0) return res.json({ inserted: 0 });
      const inserted = await db.insert(foodItems).values(rows).returning({ id: foodItems.id });
      res.json({ inserted: inserted.length, ids: inserted.map(r => r.id) });
    } catch (err: any) {
      console.error('Dishes bulk error:', err);
      res.status(500).json({ error: err?.message || tError(getLang(req), 'insertFailed') });
    }
  });

  app.post('/api/drinks/bulk', requireSession, async (req, res) => {
    try {
      const rid = sessionRestaurantId(req)!;
      const list: Array<any> = Array.isArray(req.body?.drinks) ? req.body.drinks : [];
      if (list.length === 0) return res.json({ inserted: 0 });
      const rows = list
        .filter(d => d.product && String(d.product).trim().length > 0)
        .map(d => {
          const norm = normalizeDrink(d.category || '');
          return {
            restaurantId: rid,
            category: norm.category,
            wineColor: norm.wineColor,
            name: String(d.product).trim(),
            producer: (d.producer || '').trim() || null,
            vintage: parseVintage(d.vintage),
            priceBottleCents: parsePriceCents(d.price),
          };
        });
      if (rows.length === 0) return res.json({ inserted: 0 });
      const inserted = await db.insert(drinks).values(rows).returning({ id: drinks.id, name: drinks.name });
      res.json({ inserted: inserted.length, ids: inserted.map(r => r.id) });
    } catch (err: any) {
      console.error('Drinks bulk error:', err);
      res.status(500).json({ error: err?.message || tError(getLang(req), 'insertFailed') });
    }
  });

  app.post('/api/pairings/bulk', requireSession, async (req, res) => {
    try {
      const rid = sessionRestaurantId(req)!;
      const list: Array<any> = Array.isArray(req.body?.pairings) ? req.body.pairings : [];
      const language: 'it' | 'en' = req.body?.language === 'en' ? 'en' : 'it';
      const model: string | null = typeof req.body?.model === 'string' ? req.body.model : null;
      if (list.length === 0) return res.json({ inserted: 0 });
      const allDishes = await db.select({ id: foodItems.id, name: foodItems.name }).from(foodItems).where(eq(foodItems.restaurantId, rid));
      const allDrinks = await db.select({ id: drinks.id, name: drinks.name }).from(drinks).where(eq(drinks.restaurantId, rid));
      const dishMap = new Map(allDishes.map(d => [d.name.toLowerCase().trim(), d.id]));
      const drinkMap = new Map(allDrinks.map(d => [d.name.toLowerCase().trim(), d.id]));
      const toInsert: any[] = [];
      let unresolved = 0;
      for (const p of list) {
        const foodId = dishMap.get(String(p.dishName || '').toLowerCase().trim());
        const drinkId = drinkMap.get(String(p.drinkName || '').toLowerCase().trim());
        if (!foodId || !drinkId) { unresolved++; continue; }
        toInsert.push({
          restaurantId: rid,
          foodItemId: foodId,
          drinkId: drinkId,
          rationale: typeof p.description === 'string' ? p.description : null,
          source: 'ai' as const,
          model,
          language,
        });
      }
      if (toInsert.length === 0) return res.json({ inserted: 0, unresolved });
      const inserted = await db.insert(pairings).values(toInsert)
        .onConflictDoNothing({ target: [pairings.foodItemId, pairings.drinkId] })
        .returning({ id: pairings.id });
      res.json({ inserted: inserted.length, unresolved });
    } catch (err: any) {
      console.error('Pairings bulk error:', err);
      res.status(500).json({ error: err?.message || tError(getLang(req), 'insertFailed') });
    }
  });

  // ====================================================================
  // UPLOAD SESSIONS — pay-per-use (1ª gratis, dalla 2ª 10€ via Stripe).
  // Vedi memoria pairbuilder_freemium_model.md.
  // ====================================================================
  // Una "sessione di upload" = un ciclo completo onboarding + menu + drink
  // + generazione pairing. La prima per ogni restaurant_id e' gratis; le
  // successive richiedono un pagamento Stripe Checkout (Fase 3, separata).
  //
  // /quota e' chiamato in apertura per decidere se mostrare paywall.
  // /start e' chiamato quando il guest conferma l'onboarding: crea la riga
  // upload_sessions. Se e' la prima del restaurant, e' marcata is_free=true
  // e status='completed' immediatamente. Altrimenti resta 'initiated' in
  // attesa che il flusso Stripe la chiuda (via webhook, in Fase 3).
  // ====================================================================

  // Bypass paywall per i platform admin (`users.is_platform_admin = TRUE`):
  // i tester interni BIBI Srl (es. enrico.patrizio@ambrosiavino.com,
  // owner@trattoriademo.it) devono poter usare l'app senza limiti di
  // upload, altrimenti dopo la prima sessione di test verrebbero bloccati.
  // Vale solo per gli utenti loggati: l'admin in modalita' guest non viene
  // riconosciuto (e' il comportamento voluto — admin = chi ha login attivo).
  async function isPlatformAdmin(req: Request): Promise<boolean> {
    const uid = req.session.userId;
    if (!uid) return false;
    const rows = await pool.query(
      `SELECT is_platform_admin FROM users WHERE id = $1`,
      [uid]
    );
    return rows.rows[0]?.is_platform_admin === true;
  }

  // Contatore upload completati per il restaurant in sessione (loggato o
  // guest). Risponde sempre 200; can_start_free=true se nessun upload
  // completato finora (incluso il caso "nessuna sessione" — visitatore nuovo).
  // I platform admin saltano sempre il paywall (admin_bypass:true).
  // requireSession aggiunto 28 mag 2026 (audit security): bloccava
  // enumeration anonima della quota globale.
  app.get('/api/uploads/quota', requireSession, async (req, res) => {
    try {
      const rid = sessionRestaurantId(req);
      if (!rid) {
        return res.json({ can_start_free: true, completed_count: 0, has_session: false });
      }
      if (await isPlatformAdmin(req)) {
        return res.json({ can_start_free: true, completed_count: 0, has_session: true, admin_bypass: true });
      }
      const rows = await pool.query(
        `SELECT COUNT(*)::int AS n
           FROM upload_sessions
          WHERE restaurant_id = $1 AND status = 'completed'`,
        [rid]
      );
      const n = rows.rows[0]?.n ?? 0;
      res.json({ can_start_free: n === 0, completed_count: n, has_session: true });
    } catch (err: any) {
      console.error('Uploads quota error:', err);
      res.status(500).json({ error: err?.message || 'quota lookup failed' });
    }
  });

  // Crea una upload_session per il restaurant corrente. Se e' la prima del
  // restaurant (count completed = 0), la riga e' is_free=true e status passa
  // subito a 'completed'. Altrimenti is_free=false, amount=1000 cents, status
  // 'initiated': in attesa di Stripe Checkout (Fase 3 — endpoint
  // /api/checkout/create-session userà l'id ritornato qui).
  // I platform admin sono sempre is_free=true (status='completed') —
  // questi record restano in tabella per il tracking analytics, ma marcati
  // come "interni" via metadata.admin_bypass=true.
  app.post('/api/uploads/start', requireSession, async (req, res) => {
    try {
      const rid = sessionRestaurantId(req)!;
      const adminBypass = await isPlatformAdmin(req);
      const completed = await pool.query(
        `SELECT COUNT(*)::int AS n
           FROM upload_sessions
          WHERE restaurant_id = $1 AND status = 'completed'`,
        [rid]
      );
      const isFree = adminBypass || (completed.rows[0]?.n ?? 0) === 0;
      const now = new Date();
      const [row] = await db.insert(uploadSessions).values({
        restaurantId: rid,
        status: isFree ? 'completed' : 'initiated',
        isFree,
        amountCents: isFree ? 0 : 1000,
        currency: 'EUR',
        completedAt: isFree ? now : null,
        metadata: adminBypass ? { admin_bypass: true } : null,
      }).returning();
      res.json({
        upload_session_id: row.id,
        is_free: row.isFree,
        status: row.status,
        amount_cents: row.amountCents,
        requires_payment: !row.isFree,
        admin_bypass: adminBypass,
      });
    } catch (err: any) {
      console.error('Uploads start error:', err);
      res.status(500).json({ error: err?.message || 'upload start failed' });
    }
  });

  // ====================================================================
  // AI EXTRACTIONS CACHE — evita di rifare le 2 chiamate AI (listItemNames +
  // extractMenuData) quando lo stesso file binario viene ricaricato.
  // Key: SHA-256(file) + upload_type ('menu' | 'drinks'). Globale (non
  // scoped al ristorante) — il caching cross-utente e' voluto: se due
  // ristoranti caricano lo stesso PDF Garzadori, paghiamo l'AI una volta.
  // ====================================================================

  // GET /api/ai-cache/:hash?type=menu|drinks — lookup cache.
  // Risponde 200 con { hit: true, result, model } su hit (e incrementa
  // hit_count + last_hit_at), 200 con { hit: false } su miss.
  // requireSession aggiunto 28 mag 2026 (audit security): la cache è
  // condivisa cross-restaurant per design (-70% chiamate AI su duplicati),
  // ma l'accesso resta gated per evitare oracle anonimo "questo file esiste?".
  app.get('/api/ai-cache/:hash', requireSession, async (req, res) => {
    try {
      const hash = String(req.params.hash || '').toLowerCase();
      const uploadType = String(req.query.type || '');
      if (!/^[a-f0-9]{64}$/.test(hash)) {
        return res.status(400).json({ error: 'invalid hash format (expect SHA-256 hex)' });
      }
      if (uploadType !== 'menu' && uploadType !== 'drinks') {
        return res.status(400).json({ error: 'type must be menu or drinks' });
      }
      const rows = await pool.query(
        `UPDATE ai_extractions_cache
           SET hit_count = hit_count + 1, last_hit_at = NOW()
         WHERE file_hash = $1 AND upload_type = $2
         RETURNING result, model, hit_count`,
        [hash, uploadType]
      );
      if (rows.rowCount === 0) {
        aiLog('cache MISS', { hash, uploadType });
        return res.json({ hit: false });
      }
      aiLog('cache HIT', { hash, uploadType, hits: rows.rows[0].hit_count });
      res.json({ hit: true, result: rows.rows[0].result, model: rows.rows[0].model });
    } catch (err: any) {
      console.error('AI cache GET error:', err);
      res.status(500).json({ error: err?.message || 'cache lookup failed' });
    }
  });

  // POST /api/ai-cache — salva risultato estrazione.
  // Body: { hash, uploadType, result, model? }. Upsert: se la riga esiste
  // gia' (race su upload concorrenti) non sovrascrive. result deve essere
  // { dishes: [...], drinks: [...] } (l'output di extractMenuData).
  // requireSession aggiunto 28 mag 2026 (audit security): senza, chiunque
  // poteva avvelenare la cache scrivendo un payload arbitrario per un hash
  // qualsiasi → vittime che caricano lo stesso file ricevono dati ostili.
  // Scoping per restaurantId su tabella = phase 2 (richiede migrazione).
  app.post('/api/ai-cache', requireSession, async (req, res) => {
    try {
      const hash = String(req.body?.hash || '').toLowerCase();
      const uploadType = String(req.body?.uploadType || '');
      const result = req.body?.result;
      const model = typeof req.body?.model === 'string' ? req.body.model : null;
      if (!/^[a-f0-9]{64}$/.test(hash)) {
        return res.status(400).json({ error: 'invalid hash format' });
      }
      if (uploadType !== 'menu' && uploadType !== 'drinks') {
        return res.status(400).json({ error: 'type must be menu or drinks' });
      }
      if (!result || typeof result !== 'object' || !('dishes' in result) || !('drinks' in result)) {
        return res.status(400).json({ error: 'result must be { dishes, drinks }' });
      }
      await pool.query(
        `INSERT INTO ai_extractions_cache (file_hash, upload_type, result, model)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (file_hash, upload_type) DO NOTHING`,
        [hash, uploadType, result, model]
      );
      aiLog('cache SAVE', { hash, uploadType, model });
      res.json({ saved: true });
    } catch (err: any) {
      console.error('AI cache POST error:', err);
      res.status(500).json({ error: err?.message || 'cache save failed' });
    }
  });

  // ====================================================================
  // ADMIN — endpoint cross-ristorante per il platform owner
  // ====================================================================
  app.get('/api/admin/restaurants', requireAdmin, async (req, res) => {
    try {
      const result = await pool.query(`
        SELECT r.id, r.slug, r.name, r.cuisine_type, r.is_guest,
               r.guest_email, r.guest_phone, r.default_language, r.created_at,
               (SELECT COUNT(*) FROM food_items WHERE restaurant_id = r.id) AS dishes_count,
               (SELECT COUNT(*) FROM drinks WHERE restaurant_id = r.id) AS drinks_count,
               (SELECT COUNT(*) FROM pairings WHERE restaurant_id = r.id) AS pairings_count,
               (SELECT email FROM users WHERE restaurant_id = r.id ORDER BY created_at LIMIT 1) AS owner_email
        FROM restaurants r
        ORDER BY r.created_at DESC
      `);
      res.json({ restaurants: result.rows });
    } catch (err: any) {
      console.error('Admin restaurants error:', err);
      res.status(500).json({ error: err?.message || tError(getLang(req), 'readFailed') });
    }
  });

  app.get('/api/admin/restaurants/:slug/full', requireAdmin, async (req, res) => {
    try {
      const slug = req.params.slug;
      const [restaurant] = await db.select().from(restaurants).where(eq(restaurants.slug, slug)).limit(1);
      if (!restaurant) return res.status(404).json({ error: tError(getLang(req), 'notFound') });
      const dishes = await db.select().from(foodItems).where(eq(foodItems.restaurantId, restaurant.id));
      const drinkRows = await db.select().from(drinks).where(eq(drinks.restaurantId, restaurant.id));
      const pairingRows = await pool.query(`
        SELECT p.id, p.rationale, p.source, p.model, p.language, p.created_at,
               fi.name AS dish_name, d.name AS drink_name
        FROM pairings p
        JOIN food_items fi ON fi.id = p.food_item_id
        JOIN drinks d ON d.id = p.drink_id
        WHERE p.restaurant_id = $1
        ORDER BY p.created_at DESC
      `, [restaurant.id]);
      res.json({ restaurant, dishes, drinks: drinkRows, pairings: pairingRows.rows });
    } catch (err: any) {
      console.error('Admin restaurant full error:', err);
      res.status(500).json({ error: err?.message || tError(getLang(req), 'readFailed') });
    }
  });

  // GET /api/admin/export.xlsx (alias breve: /export) — Excel multi-sheet con
  // TUTTI i dati della piattaforma (4 fogli: Ristoranti, Piatti, Drinks,
  // Abbinamenti). Comodo per analisi offline, intelligence, condivisione con
  // il team. Login richiesto: utente platform admin.
  app.get(['/api/admin/export.xlsx', '/export'], requireAdmin, async (req, res) => {
    try {
      const restaurantsRows = await pool.query(`
        SELECT r.slug, r.name, r.cuisine_type, r.is_guest,
               r.guest_email, r.guest_phone, r.default_language,
               COALESCE(u.email, r.guest_email) AS contact_email,
               r.created_at,
               (SELECT COUNT(*) FROM food_items WHERE restaurant_id = r.id) AS dishes_count,
               (SELECT COUNT(*) FROM drinks      WHERE restaurant_id = r.id) AS drinks_count,
               (SELECT COUNT(*) FROM pairings    WHERE restaurant_id = r.id) AS pairings_count,
               (SELECT COUNT(*) FROM upload_sessions WHERE restaurant_id = r.id AND status = 'completed') AS upload_sessions_completed,
               (SELECT COUNT(*) FROM upload_sessions WHERE restaurant_id = r.id AND status = 'completed' AND is_free) AS upload_sessions_free,
               (SELECT COALESCE(SUM(amount_cents),0)/100.0 FROM upload_sessions WHERE restaurant_id = r.id AND status = 'completed' AND NOT is_free) AS ricavi_eur
        FROM restaurants r
        LEFT JOIN users u ON u.restaurant_id = r.id AND NOT u.is_platform_admin
        ORDER BY r.created_at DESC
      `);
      const dishesRows = await pool.query(`
        SELECT r.slug AS ristorante_slug, r.name AS ristorante,
               r.is_guest AS ospite,
               fi.name AS piatto, fi.description AS categoria,
               fi.ingredients,
               (fi.price_cents / 100.0) AS prezzo_eur,
               fi.is_vegetarian AS vegetariano,
               fi.is_vegan AS vegano,
               fi.is_gluten_free AS senza_glutine,
               fi.created_at
        FROM food_items fi
        JOIN restaurants r ON r.id = fi.restaurant_id
        ORDER BY r.created_at DESC, fi.created_at ASC
      `);
      const drinksRows = await pool.query(`
        SELECT r.slug AS ristorante_slug, r.name AS ristorante,
               r.is_guest AS ospite,
               d.category AS categoria, d.wine_color AS colore_vino,
               d.producer AS produttore, d.name AS prodotto,
               d.vintage AS annata, d.region AS regione, d.country AS paese,
               (d.price_bottle_cents / 100.0) AS prezzo_bottiglia_eur,
               (d.price_glass_cents  / 100.0) AS prezzo_calice_eur,
               d.created_at
        FROM drinks d
        JOIN restaurants r ON r.id = d.restaurant_id
        ORDER BY r.created_at DESC, d.category, d.name
      `);
      const pairingsRows = await pool.query(`
        SELECT r.slug AS ristorante_slug, r.name AS ristorante,
               r.is_guest AS ospite,
               fi.name AS piatto, d.name AS bevanda,
               p.rationale AS descrizione_ai,
               p.language AS lingua,
               p.model AS modello_ai,
               p.source AS sorgente,
               p.created_at
        FROM pairings p
        JOIN food_items fi  ON fi.id = p.food_item_id
        JOIN drinks d       ON d.id  = p.drink_id
        JOIN restaurants r  ON r.id  = p.restaurant_id
        ORDER BY r.created_at DESC, p.created_at DESC
      `);
      const uploadSessionsRows = await pool.query(`
        SELECT r.slug AS ristorante_slug, r.name AS ristorante,
               r.is_guest AS ospite_anonimo,
               us.status,
               us.is_free AS gratuito,
               (us.amount_cents / 100.0) AS importo_eur,
               us.currency AS valuta,
               us.stripe_checkout_session_id AS stripe_id,
               (us.metadata->>'admin_bypass')::boolean AS admin_bypass,
               us.started_at,
               us.completed_at
        FROM upload_sessions us
        JOIN restaurants r ON r.id = us.restaurant_id
        ORDER BY us.started_at DESC
      `);

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(restaurantsRows.rows),     'Ristoranti');
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(dishesRows.rows),          'Piatti');
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(drinksRows.rows),          'Drinks');
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(pairingsRows.rows),        'Abbinamenti');
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(uploadSessionsRows.rows),  'Sessioni Upload');

      const buf: Buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
      const today = new Date().toISOString().slice(0, 10);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="pairbuilder-export-${today}.xlsx"`);
      res.setHeader('Content-Length', String(buf.length));
      res.end(buf);
    } catch (err: any) {
      console.error('Admin export error:', err);
      res.status(500).json({ error: err?.message || tError(getLang(req), 'readFailed') });
    }
  });

  app.get('/api/admin/stats', requireAdmin, async (_req, res) => {
    try {
      const result = await pool.query(`
        SELECT
          (SELECT COUNT(*) FROM restaurants WHERE NOT is_guest) AS registered_restaurants,
          (SELECT COUNT(*) FROM restaurants WHERE is_guest) AS guest_restaurants,
          (SELECT COUNT(*) FROM users WHERE NOT is_platform_admin) AS users_total,
          (SELECT COUNT(*) FROM food_items) AS dishes_total,
          (SELECT COUNT(*) FROM drinks) AS drinks_total,
          (SELECT COUNT(*) FROM pairings) AS pairings_total,
          (SELECT COUNT(*) FROM pairings WHERE language='it') AS pairings_it,
          (SELECT COUNT(*) FROM pairings WHERE language='en') AS pairings_en,
          (SELECT COUNT(*) FROM restaurants WHERE created_at > NOW() - INTERVAL '7 days') AS restaurants_last_7d
      `);
      res.json(result.rows[0]);
    } catch (err: any) {
      console.error('Admin stats error:', err);
      res.status(500).json({ error: err?.message });
    }
  });

  // ====================================================================
  // CRUD scoped per restaurant_id loggato
  // ====================================================================
  function registerCrud(routeName: string, table: any) {
    app.get(`/api/${routeName}`, requireAuth, async (req, res) => {
      try {
        const rid = req.session.restaurantId!;
        const rows = await db.select().from(table).where(eq(table.restaurantId, rid));
        res.json(rows);
      } catch (err: any) {
        res.status(500).json({ error: err?.message || tError(getLang(req), 'readFailed') });
      }
    });

    app.post(`/api/${routeName}`, requireAuth, async (req, res) => {
      try {
        const rid = req.session.restaurantId!;
        const { id, restaurantId, createdAt, updatedAt, ...payload } = req.body || {};
        const [row] = await db
          .insert(table)
          .values({ ...payload, restaurantId: rid })
          .returning();
        res.json(row);
      } catch (err: any) {
        res.status(500).json({ error: err?.message || tError(getLang(req), 'insertFailed') });
      }
    });

    app.put(`/api/${routeName}/:id`, requireAuth, async (req, res) => {
      try {
        const rid = req.session.restaurantId!;
        const { id, restaurantId, createdAt, ...payload } = req.body || {};
        const [row] = await db
          .update(table)
          .set(payload)
          .where(and(eq(table.id, req.params.id), eq(table.restaurantId, rid)))
          .returning();
        if (!row) return res.status(404).json({ error: tError(getLang(req), 'notFound') });
        res.json(row);
      } catch (err: any) {
        res.status(500).json({ error: err?.message || tError(getLang(req), 'updateFailed') });
      }
    });

    app.delete(`/api/${routeName}/:id`, requireAuth, async (req, res) => {
      try {
        const rid = req.session.restaurantId!;
        const [row] = await db
          .delete(table)
          .where(and(eq(table.id, req.params.id), eq(table.restaurantId, rid)))
          .returning();
        if (!row) return res.status(404).json({ error: tError(getLang(req), 'notFound') });
        res.json({ ok: true });
      } catch (err: any) {
        res.status(500).json({ error: err?.message || tError(getLang(req), 'deleteFailed') });
      }
    });
  }

  registerCrud('food-categories', foodCategories);
  registerCrud('food-items', foodItems);
  registerCrud('drinks', drinks);
  registerCrud('contacts', contacts);

  // ====================================================================
  // Diagnostica
  // ====================================================================
  app.get('/api/config-check', (req, res) => {
    const hasVision = !!process.env.GOOGLE_CLOUD_VISION_API_KEY;
    // Con il gateway attivo, una sola chiave OpenRouter copre i 3 provider AI.
    const hasOpenAI = !!aiKey('openai');
    const hasGemini = !!aiKey('gemini');
    const hasAnthropic = !!aiKey('anthropic');
    let status: string;
    if (hasVision && hasOpenAI && hasAnthropic) {
      status = 'Full';
    } else if (!hasVision && !hasOpenAI && !hasAnthropic) {
      status = 'Standard';
    } else {
      status = 'Extended';
    }
    const gatewayInfo = USE_OPENROUTER ? ' (via OpenRouter gateway)' : '';
    res.json({
      visionApiKeyPresent: hasVision,
      openaiApiKeyPresent: hasOpenAI,
      geminiApiKeyPresent: hasGemini,
      anthropicApiKeyPresent: hasAnthropic,
      gateway: USE_OPENROUTER ? 'openrouter' : 'direct',
      appUrl: APP_URL,
      // Site key Turnstile esposto al client (pubblico per design). Se la
      // chiave non e' settata, il widget non viene mostrato e il backend
      // accetta le request senza captcha (modalita' dev).
      turnstileSiteKey: process.env.TURNSTILE_SITE_KEY || null,
      status,
      message: `Gemini: ${hasGemini ? 'OK' : 'NO'} | OpenAI: ${hasOpenAI ? 'OK' : 'NO'} | Anthropic: ${hasAnthropic ? 'OK' : 'NO'} | Vision OCR: ${hasVision ? 'OK' : 'opzionale'}${gatewayInfo}`,
    });
  });

  // ====================================================================
  // AI Proxy: Gemini (chiave server-side, evita 403/CORS dal browser).
  // Implementazione via endpoint openai-compatible: il client invia il
  // payload nel formato Gemini storico ({ model, contents, config }) e
  // qui lo convertiamo in messages openai-style. Cosi' funziona sia con
  // OpenAI/OpenRouter come gateway, sia (in passato) con SDK Google.
  // ====================================================================
  function geminiContentsToOpenAIMessages(contents: any[], config: any): any[] {
    const messages: any[] = [];
    const sys = config?.systemInstruction;
    if (sys) {
      const sysText = typeof sys === 'string'
        ? sys
        : (sys?.parts || []).map((p: any) => p?.text || '').join('\n');
      if (sysText) messages.push({ role: 'system', content: sysText });
    }
    for (const c of (Array.isArray(contents) ? contents : [])) {
      const parts: any[] = Array.isArray(c?.parts) ? c.parts : [];
      const userContent: any[] = parts.map((p: any) => {
        if (p?.text != null) return { type: 'text', text: p.text };
        if (p?.inlineData) {
          const mt = p.inlineData.mimeType || 'image/jpeg';
          return {
            type: 'image_url',
            image_url: { url: `data:${mt};base64,${p.inlineData.data}` },
          };
        }
        return null;
      }).filter(Boolean);
      messages.push({
        role: c?.role === 'model' ? 'assistant' : 'user',
        content: userContent,
      });
    }
    return messages;
  }

  app.post('/api/gemini/generate', requireSession, aiLimiter, async (req, res) => {
    const { model, contents, config } = req.body;
    const API_KEY = aiKey('gemini');
    if (!API_KEY) {
      return res.status(500).json({ error: tError(getLang(req), 'missingGeminiKey') });
    }
    if (DEBUG_AI) {
      const firstText = contents?.[0]?.parts?.find((p: any) => p.text)?.text || '';
      const promptHead = firstText.slice(0, 400).replace(/\s+/g, ' ');
      const nImages = (contents?.[0]?.parts || []).filter((p: any) => p.inlineData).length;
      const nTexts = (contents?.[0]?.parts || []).filter((p: any) => p.text).length;
      aiLog('Gemini REQ', `model=${model} | parts: ${nTexts} text + ${nImages} images | promptHead: "${promptHead}..."`);
    }

    const messages = geminiContentsToOpenAIMessages(contents, config);
    const body: any = {
      model: aiModelName('gemini', model || 'gemini-2.0-flash'),
      messages,
      temperature: typeof config?.temperature === 'number' ? config.temperature : 0,
    };
    if (typeof config?.maxOutputTokens === 'number') body.max_tokens = config.maxOutputTokens;
    if (config?.responseMimeType === 'application/json' || config?.responseSchema) {
      // responseSchema strutturato di Gemini non e' 1:1 con json_schema OpenAI;
      // forziamo solo json_object (il prompt server-side e' gia' specifico
      // abbastanza) e il client fa repairJson() come fallback.
      body.response_format = { type: 'json_object' };
    }

    // Retry su 429 con backoff. Su gateway (OpenRouter) il 429 e' lato
    // gateway ed e' raro; su provider diretto rispecchia il comportamento
    // pre-gateway.
    const MAX_ATTEMPTS = 3;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const response = await fetch(OPENAI_CHAT_URL, {
          method: 'POST',
          headers: aiHeaders('gemini'),
          body: JSON.stringify(body),
        });
        const data = await response.json();
        if (!response.ok) {
          const errMsg = data?.error?.message || `HTTP ${response.status}`;
          const isRateLimit = response.status === 429 || /quota|rate.?limit|resource.?exhausted/i.test(errMsg);
          const isDailyExhausted = /FreeTier|PerDay|RequestsPerDay/i.test(errMsg);
          if (isRateLimit && !isDailyExhausted && attempt < MAX_ATTEMPTS) {
            const waitSec = Math.min(30, 2 ** attempt);
            console.warn(`[Gemini Proxy] 429 on attempt ${attempt}/${MAX_ATTEMPTS}, sleeping ${waitSec}s`);
            await new Promise(r => setTimeout(r, waitSec * 1000));
            continue;
          }
          if (isDailyExhausted) {
            console.warn(`[Gemini Proxy] daily quota exhausted — skipping retries`);
          } else {
            console.error(`[Gemini Proxy] Error (${response.status}) after ${attempt} attempt(s):`, errMsg);
          }
          return res.status(response.status).json({ error: errMsg, status: response.status });
        }
        const text = data?.choices?.[0]?.message?.content || '';
        aiLog('Gemini RES', text);
        return res.json({ text });
      } catch (error: any) {
        const msg = String(error?.message || '');
        if (attempt < MAX_ATTEMPTS) {
          const waitSec = Math.min(30, 2 ** attempt);
          console.warn(`[Gemini Proxy] network error on attempt ${attempt}/${MAX_ATTEMPTS}, sleeping ${waitSec}s: ${msg}`);
          await new Promise(r => setTimeout(r, waitSec * 1000));
          continue;
        }
        console.error(`[Gemini Proxy] Error after ${attempt} attempts:`, msg);
        return res.status(500).json({ error: msg || 'Gemini generation failed', status: 500 });
      }
    }
  });

  // ====================================================================
  // AI proxies (preservati dal server.ts originale)
  // ====================================================================
  app.post('/api/vision/ocr', requireSession, aiLimiter, async (req, res) => {
    const { image } = req.body;
    const API_KEY = process.env.GOOGLE_CLOUD_VISION_API_KEY;
    if (!API_KEY) {
      return res.status(500).json({ error: tError(getLang(req), 'missingVisionKey') });
    }
    try {
      const response = await fetch(
        `https://vision.googleapis.com/v1/images:annotate?key=${API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            requests: [
              {
                image: { content: image },
                features: [{ type: 'DOCUMENT_TEXT_DETECTION' }],
                imageContext: { languageHints: ['it'] },
              },
            ],
          }),
        }
      );
      const data = await response.json();
      if (!response.ok) {
        console.error('Google Vision API Error Response:', data);
        return res.status(response.status).json({
          error: data.error?.message || 'Google Vision API error',
          code: response.status,
          details: data.error?.details || null,
        });
      }
      const text = data.responses?.[0]?.fullTextAnnotation?.text || '';
      console.log(`[OCR SUCCESS] Extracted ${text.length} characters. Preview: ${text.substring(0, 100)}...`);
      res.json(data);
    } catch (error) {
      console.error('Server OCR Exception:', error);
      res.status(500).json({ error: 'OCR operation failed on server due to an internal exception.' });
    }
  });

  app.post('/api/openai/extract', requireSession, aiLimiter, async (req, res) => {
    const { prompt, data, image } = req.body;
    const API_KEY = aiKey('openai');
    if (!API_KEY) return res.status(500).json({ error: tError(getLang(req), 'missingOpenAIKey') });
    try {
      const lang = getLang(req);
      const messages: any[] = [
        {
          role: 'system',
          content: extractSystemPrompt(lang),
        },
        {
          role: 'user',
          content: [{ type: 'text', text: prompt + (data ? `\n\nCONTENUTO TESTUALE:\n${data}` : '') }],
        },
      ];
      if (image) {
        messages[1].content.push({
          type: 'image_url',
          image_url: { url: `data:image/jpeg;base64,${image}` },
        });
      }
      const response = await fetch(OPENAI_CHAT_URL, {
        method: 'POST',
        headers: aiHeaders('openai'),
        body: JSON.stringify({
          model: aiModelName('openai', 'gpt-4o'),
          messages,
          response_format: { type: 'json_object' },
          temperature: 0,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message || 'OpenAI API error');
      res.json(JSON.parse(result.choices[0].message.content));
    } catch (error) {
      console.error('OpenAI Extraction Error:', error);
      res.status(500).json({ error: error instanceof Error ? error.message : 'Extraction failed' });
    }
  });

  app.post('/api/openai/list-items', requireSession, aiLimiter, async (req, res) => {
    const { prompt, data, image } = req.body;
    const API_KEY = aiKey('openai');
    if (!API_KEY) return res.status(500).json({ error: tError(getLang(req), 'missingOpenAIKey') });
    try {
      const lang = getLang(req);
      const messages: any[] = [
        {
          role: 'system',
          content: listItemsSystemPrompt(lang),
        },
        {
          role: 'user',
          content: [{ type: 'text', text: prompt + (data ? `\n\nCONTENUTO TESTUALE:\n${data}` : '') }],
        },
      ];
      if (image) {
        messages[1].content.push({
          type: 'image_url',
          image_url: { url: `data:image/jpeg;base64,${image}` },
        });
      }
      const response = await fetch(OPENAI_CHAT_URL, {
        method: 'POST',
        headers: aiHeaders('openai'),
        body: JSON.stringify({
          model: aiModelName('openai', 'gpt-4o-mini'),
          messages,
          response_format: { type: 'json_object' },
          temperature: 0,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message || 'OpenAI API error');
      res.json(JSON.parse(result.choices[0].message.content));
    } catch (error) {
      console.error('OpenAI List Items Error:', error);
      res.status(500).json({ error: error instanceof Error ? error.message : 'Listing failed' });
    }
  });

  // --- OpenAI Native Menu Scan (fallback quando Gemini esaurisce quota) ---
  app.post('/api/openai/menu-scan', requireSession, aiLimiter, async (req, res) => {
    const { text, images, allowPizzas } = req.body;
    const API_KEY = aiKey('openai');
    if (!API_KEY) return res.status(500).json({ error: tError(getLang(req), 'missingOpenAIKey') });
    const lang = getLang(req);

    const imageList: string[] = Array.isArray(images)
      ? images
      : req.body.image
      ? [req.body.image]
      : [];
    const hasImages = imageList.length > 0;

    const systemPrompt = menuScanSystemPrompt(lang, !!allowPizzas);

    console.log(
      `[OpenAI menu-scan] input: text=${text?.length || 0} chars, images=${imageList.length} (${imageList
        .map((i) => Math.round(i.length / 1024) + 'KB')
        .join(', ')})`
    );
    if (text) console.log(`[OpenAI menu-scan] text preview: ${text.substring(0, 200)}`);

    const userContent: any[] = [
      {
        type: 'text',
        text: text
          ? `MENU:\n${text}`
          : menuScanFallbackUserText(lang),
      },
    ];
    for (const img of imageList) {
      userContent.push({ type: 'image_url', image_url: { url: `data:image/jpeg;base64,${img}` } });
    }

    try {
      const response = await openaiFetchWithRetry(OPENAI_CHAT_URL, {
        method: 'POST',
        headers: aiHeaders('openai'),
        body: JSON.stringify({
          model: aiModelName('openai', hasImages ? 'gpt-4o' : 'gpt-4o-mini'),
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userContent },
          ],
          response_format: { type: 'json_object' },
          temperature: 0,
          // Una carta vini puo' avere 200+ referenze: ognuna ~30 char + JSON
          // overhead ≈ 50 token per voce, 216 voci ≈ 11k token output. Con
          // max_tokens=4096 (precedente) la lista si tronca silenziosamente.
          // Aumentato al massimo supportato da gpt-4o/gpt-4o-mini (16384).
          max_tokens: 16384,
        }),
      }, 'menu-scan');
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message || 'OpenAI error');
      const parsed = JSON.parse(result.choices[0].message.content);
      console.log(
        `[OpenAI menu-scan] dishes:${(parsed.dishes || []).length} drinks:${(parsed.drinks || []).length}`
      );
      aiLog('OpenAI menu-scan FULL', parsed);
      res.json(parsed);
    } catch (error) {
      console.error('OpenAI menu-scan Error:', error);
      res.status(500).json({ error: error instanceof Error ? error.message : 'Scan failed' });
    }
  });

  // --- OpenAI Native Batch Extract (fallback quando Gemini esaurisce quota) ---
  app.post('/api/openai/menu-extract', requireSession, aiLimiter, async (req, res) => {
    const { text, images, itemNames, type } = req.body;
    const API_KEY = aiKey('openai');
    if (!API_KEY) return res.status(500).json({ error: tError(getLang(req), 'missingOpenAIKey') });
    const lang = getLang(req);

    const imageList: string[] = Array.isArray(images)
      ? images
      : req.body.image
      ? [req.body.image]
      : [];

    const isDrinks = type === 'drinks';
    const systemPrompt = menuExtractSystemPrompt(lang, isDrinks, itemNames?.length ?? 0);

    const userContent: any[] = [
      {
        type: 'text',
        text: menuExtractUserPrefix(lang, itemNames || []) + (text || (lang === 'en' ? 'See images' : 'Vedi immagini')),
      },
    ];
    for (const img of imageList) {
      userContent.push({ type: 'image_url', image_url: { url: `data:image/jpeg;base64,${img}` } });
    }

    try {
      const response = await openaiFetchWithRetry(OPENAI_CHAT_URL, {
        method: 'POST',
        headers: aiHeaders('openai'),
        body: JSON.stringify({
          model: aiModelName('openai', 'gpt-4o'),
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userContent },
          ],
          response_format: { type: 'json_object' },
          temperature: 0,
          max_tokens: 8192,
        }),
      }, 'menu-extract');
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message || 'OpenAI error');
      const parsed = JSON.parse(result.choices[0].message.content);
      console.log(`[OpenAI menu-extract] type=${type} items:${(parsed.items || []).length}`);
      if (DEBUG_AI && type === 'drinks') {
        const cats = (parsed.items || []).map((it: any) => it.category || '(no category)');
        aiLog('OpenAI menu-extract DRINKS categories', cats);
      }
      aiLog('OpenAI menu-extract FULL', parsed);
      res.json(parsed);
    } catch (error) {
      console.error('OpenAI menu-extract Error:', error);
      res.status(500).json({ error: error instanceof Error ? error.message : 'Extract failed' });
    }
  });

  // --- OpenAI Native Pairings (fallback quando Gemini esaurisce quota) ---
  app.post('/api/openai/pairings', requireSession, aiLimiter, async (req, res) => {
    const { restaurantInfo, dishes, drinks: drinksList } = req.body;
    const API_KEY = aiKey('openai');
    if (!API_KEY) return res.status(500).json({ error: tError(getLang(req), 'missingOpenAIKey') });
    const lang = getLang(req);
    const systemPrompt = pairingsSystemPrompt(lang);
    const drinksLabel = lang === 'en' ? 'AVAILABLE DRINKS' : 'BEVANDE DISPONIBILI';
    const userContent = `${pairingsUserPrefix(lang, restaurantInfo)}${JSON.stringify(dishes)}\n\n${drinksLabel}: ${JSON.stringify(drinksList)}`;

    try {
      const response = await fetch(OPENAI_CHAT_URL, {
        method: 'POST',
        headers: aiHeaders('openai'),
        body: JSON.stringify({
          model: aiModelName('openai', 'gpt-4o'),
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userContent },
          ],
          response_format: { type: 'json_object' },
          temperature: 0.1,
          max_tokens: 8192,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message || 'OpenAI error');
      const parsed = JSON.parse(result.choices[0].message.content);
      console.log(`[OpenAI pairings] count:${(parsed.pairings || []).length}`);
      res.json(parsed);
    } catch (error) {
      console.error('OpenAI pairings Error:', error);
      res.status(500).json({ error: error instanceof Error ? error.message : 'Pairings failed' });
    }
  });

  // ====================================================================
  // Anthropic Claude — provider primario per estrazione menu.
  //  - Sonnet 4.6: output window 64k token (8x GPT-4o, 4x Gemini Flash)
  //  - max_tokens calcolato dinamicamente in base alla dimensione attesa
  //    dell'output, evita troncamenti silenziosi su liste lunghe.
  //  - Server-side batching adattivo su menu-extract: se la lista voci
  //    supera ANTHROPIC_BATCH_SIZE, il server divide in batch ed esegue
  //    in parallelo con concorrenza limitata. Permette al client di
  //    chiamare con "tutta la lista" (carte da 300-400+ voci) senza
  //    doversi occupare del fan-out.
  // ====================================================================
  // Su OpenRouter il nome modello Sonnet 4.5 e' 'anthropic/claude-sonnet-4.5'
  // (testato 25 mag 2026). Su API native Anthropic e' 'claude-sonnet-4-6'.
  // Sonnet 4.6 su OpenRouter non e' stabile al momento del refactor, ripieghiamo
  // su 4.5 (output window resta a 64k token).
  const ANTHROPIC_MODEL = USE_OPENROUTER ? 'claude-sonnet-4.5' : 'claude-sonnet-4-6';
  const ANTHROPIC_HARD_MAX_TOKENS = 64000;
  const ANTHROPIC_MIN_MAX_TOKENS = 4000;
  const ANTHROPIC_BATCH_SIZE = 60;        // voci per batch server-side
  const ANTHROPIC_BATCH_CONCURRENCY = 5;  // batch paralleli (Tier 1 = 50 RPM, max 5 ondate)

  /**
   * Stima i max_tokens necessari per una call Anthropic, clampati al
   * cap Sonnet (64k). Sovrastima del 30% rispetto al best-guess: il
   * costo non e' il limite (paghi solo gli output emessi), quindi
   * meglio largo che troncato.
   */
  function anthropicMaxTokens(estimatedOutput: number): number {
    const padded = Math.ceil(estimatedOutput * 1.3);
    return Math.min(ANTHROPIC_HARD_MAX_TOKENS, Math.max(ANTHROPIC_MIN_MAX_TOKENS, padded));
  }

  /**
   * Converte un blocco userContent Anthropic-style nel formato openai-style.
   *  - { type: 'text', text }                                    → identico
   *  - { type: 'image', source: { type: 'base64', media_type, data } }
   *      → { type: 'image_url', image_url: { url: 'data:<media_type>;base64,<data>' } }
   */
  function anthropicBlocksToOpenAI(content: any[]): any[] {
    return content.map((b) => {
      if (b?.type === 'image' && b.source?.type === 'base64') {
        const mt = b.source.media_type || 'image/jpeg';
        return {
          type: 'image_url',
          image_url: { url: `data:${mt};base64,${b.source.data}` },
        };
      }
      return b;
    });
  }

  /**
   * Una call al modello Anthropic via endpoint openai-compatible (OpenAI
   * diretto o OpenRouter come gateway). Parsing JSON tollerante a wrapping:
   * estrae il primo blocco { ... } dal testo della risposta.
   */
  async function callAnthropic(opts: {
    apiKey: string;
    systemPrompt: string;
    userContent: any[];
    maxTokens: number;
  }): Promise<any> {
    const messages = [
      { role: 'system' as const, content: opts.systemPrompt },
      { role: 'user' as const, content: anthropicBlocksToOpenAI(opts.userContent) },
    ];
    const response = await fetch(OPENAI_CHAT_URL, {
      method: 'POST',
      headers: aiHeaders('anthropic'),
      body: JSON.stringify({
        model: aiModelName('anthropic', ANTHROPIC_MODEL),
        messages,
        max_tokens: opts.maxTokens,
        temperature: 0,
      }),
    });
    const result = await response.json();
    if (!response.ok) {
      const err: any = new Error(result?.error?.message || 'Anthropic call failed');
      err.status = response.status;
      throw err;
    }
    const rawText: string = result?.choices?.[0]?.message?.content || '';
    const firstBrace = rawText.indexOf('{');
    const lastBrace = rawText.lastIndexOf('}');
    const jsonStr = firstBrace >= 0 && lastBrace > firstBrace
      ? rawText.slice(firstBrace, lastBrace + 1)
      : rawText;
    return JSON.parse(jsonStr);
  }

  app.post('/api/anthropic/menu-scan', requireSession, aiLimiter, async (req, res) => {
    const { text, images, allowPizzas } = req.body;
    const API_KEY = aiKey('anthropic');
    if (!API_KEY) return res.status(500).json({ error: 'Chiave AI non configurata (ANTHROPIC_API_KEY o OPENROUTER_API_KEY)' });
    const lang = getLang(req);
    const imageList: string[] = Array.isArray(images) ? images : req.body.image ? [req.body.image] : [];
    const systemPrompt = menuScanSystemPrompt(lang, !!allowPizzas)
      + '\n\nReturn ONLY a valid JSON object with the structure described above. Start your response with `{` and end with `}`. No markdown, no explanation.';

    const textLen = text?.length || 0;
    // Discovery output ≈ lista nomi: stimiamo 1 voce ogni ~150 char di
    // input testuale (riadattato dai test sul Garzadori: 12k char testo
    // → ~200 voci output). Ogni voce ≈ 25 token nella lista.
    const estimatedItems = Math.max(50, Math.ceil(textLen / 150) + imageList.length * 40);
    const estimatedOutput = estimatedItems * 30;
    const maxTokens = anthropicMaxTokens(estimatedOutput);

    console.log(`[Anthropic menu-scan] text=${textLen} chars, images=${imageList.length}, est_items=${estimatedItems}, max_tokens=${maxTokens}`);

    const userContent: any[] = [
      { type: 'text', text: text ? `MENU:\n${text}` : (lang === 'en' ? 'Extract all items from the menu in the provided images.' : 'Estrai tutte le voci dal menu dalle immagini fornite.') },
    ];
    for (const img of imageList) {
      userContent.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: img } });
    }

    try {
      const parsed = await callAnthropic({ apiKey: API_KEY, systemPrompt, userContent, maxTokens });
      console.log(`[Anthropic menu-scan] result: dishes=${(parsed.dishes || []).length} drinks=${(parsed.drinks || []).length}`);
      aiLog('Anthropic menu-scan FULL', parsed);
      res.json(parsed);
    } catch (error: any) {
      console.error('Anthropic menu-scan Error:', error?.message || error);
      res.status(error?.status || 500).json({ error: error?.message || 'Anthropic scan failed' });
    }
  });

  app.post('/api/anthropic/menu-extract', requireSession, aiLimiter, async (req, res) => {
    const { text, images, itemNames, type } = req.body;
    const API_KEY = aiKey('anthropic');
    if (!API_KEY) return res.status(500).json({ error: 'Chiave AI non configurata (ANTHROPIC_API_KEY o OPENROUTER_API_KEY)' });
    const lang = getLang(req);
    const imageList: string[] = Array.isArray(images) ? images : req.body.image ? [req.body.image] : [];
    const isDrinks = type === 'drinks';
    const names: string[] = Array.isArray(itemNames) ? itemNames : [];

    // Batching server-side: oltre la soglia spezza in batch e li
    // processa in ondate parallele. Sotto la soglia (caso comune con
    // client batch=10) e' una sola call diretta.
    const batches: string[][] = names.length > ANTHROPIC_BATCH_SIZE
      ? Array.from(
          { length: Math.ceil(names.length / ANTHROPIC_BATCH_SIZE) },
          (_, i) => names.slice(i * ANTHROPIC_BATCH_SIZE, (i + 1) * ANTHROPIC_BATCH_SIZE)
        )
      : [names];

    console.log(`[Anthropic menu-extract] type=${type} total=${names.length} batches=${batches.length}`);

    const runBatch = async (batch: string[]): Promise<any[]> => {
      const systemPrompt = menuExtractSystemPrompt(lang, isDrinks, batch.length)
        + '\n\nReturn ONLY a valid JSON object {"items": [...]}. Start your response with `{` and end with `}`. No markdown, no explanation.';
      const userContent: any[] = [
        { type: 'text', text: menuExtractUserPrefix(lang, batch) + (text || (lang === 'en' ? 'See images' : 'Vedi immagini')) },
      ];
      for (const img of imageList) {
        userContent.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: img } });
      }
      // 250 token per voce e' un upper bound generoso (categoria + 6
      // campi stringa + struttura JSON). Per 60 voci ≈ 15k token.
      const maxTokens = anthropicMaxTokens(batch.length * 250);
      const parsed = await callAnthropic({ apiKey: API_KEY, systemPrompt, userContent, maxTokens });
      return Array.isArray(parsed.items) ? parsed.items : [];
    };

    try {
      const allItems: any[] = [];
      for (let i = 0; i < batches.length; i += ANTHROPIC_BATCH_CONCURRENCY) {
        const wave = batches.slice(i, i + ANTHROPIC_BATCH_CONCURRENCY);
        const results = await Promise.all(wave.map(runBatch));
        results.forEach(items => allItems.push(...items));
      }
      console.log(`[Anthropic menu-extract] result: items=${allItems.length}/${names.length}`);
      if (DEBUG_AI && type === 'drinks') {
        const cats = allItems.map((it: any) => it.category || '(no category)');
        aiLog('Anthropic menu-extract DRINKS categories', cats);
      }
      aiLog('Anthropic menu-extract FULL', { items: allItems });
      res.json({ items: allItems });
    } catch (error: any) {
      console.error('Anthropic menu-extract Error:', error?.message || error);
      res.status(error?.status || 500).json({ error: error?.message || 'Anthropic extract failed' });
    }
  });

  // ====================================================================
  // Vite middleware (frontend SPA)
  // ====================================================================
  // Gate stretto: 'development' invece di '!= production'. Se per errore
  // NODE_ENV è vuoto o "staging" su Render, il server NON deve avviare
  // un Vite dev full (che esporrebbe sorgenti + HMR in produzione).
  // Decisione 28 mag 2026 (audit security).
  if (process.env.NODE_ENV === 'development') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Errore avvio server:', err);
  process.exit(1);
});
