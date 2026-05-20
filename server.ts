import 'dotenv/config';
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
import { GoogleGenAI } from '@google/genai';
import * as XLSX from 'xlsx';
import { db, pool } from './db/client';
import {
  restaurants,
  users,
  foodCategories,
  foodItems,
  drinks,
  contacts,
  pairings,
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

  const PgStore = connectPg(session);
  app.use(
    session({
      store: new PgStore({
        pool,
        tableName: 'sessions',
        createTableIfMissing: false,
      }),
      secret: process.env.SESSION_SECRET || 'cambia-questo',
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
  app.post('/api/auth/register', authLimiter, async (req, res) => {
    try {
      const { restaurantName, slug, email, password, fullName, preferredLanguage } = req.body || {};
      if (!restaurantName || !slug || !email || !password) {
        return res
          .status(400)
          .json({ error: tError(getLang(req), 'missingFields', { fields: 'restaurantName, slug, email, password' }) });
      }
      // Default preferred_language to whatever lang the user is currently
      // using in the UI (X-App-Language header), so the very first session
      // after sign-up keeps their language without an extra round-trip.
      const lang = preferredLanguage === 'en' || preferredLanguage === 'it'
        ? preferredLanguage
        : getLang(req);
      const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
      const [restaurant] = await db
        .insert(restaurants)
        .values({ slug, name: restaurantName, defaultLanguage: lang })
        .returning();
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
      res.json({
        user: { id: user.id, email: user.email, fullName: user.fullName, preferredLanguage: user.preferredLanguage },
        restaurant: { id: restaurant.id, slug: restaurant.slug, name: restaurant.name },
      });
    } catch (err: any) {
      console.error('Register error:', err);
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
        user: { id: user.id, email: user.email, fullName: user.fullName, preferredLanguage: user.preferredLanguage },
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
      user: { id: user.id, email: user.email, fullName: user.fullName, preferredLanguage: user.preferredLanguage },
      restaurant: rest,
    });
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
               (SELECT COUNT(*) FROM pairings    WHERE restaurant_id = r.id) AS pairings_count
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

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(restaurantsRows.rows), 'Ristoranti');
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(dishesRows.rows),      'Piatti');
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(drinksRows.rows),      'Drinks');
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(pairingsRows.rows),    'Abbinamenti');

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
    const hasOpenAI = !!process.env.OPENAI_API_KEY;
    const hasGemini = !!process.env.GEMINI_API_KEY;
    let status: string;
    if (hasVision && hasOpenAI) {
      status = 'Full';
    } else if (!hasVision && !hasOpenAI) {
      status = 'Standard';
    } else {
      status = 'Extended';
    }
    res.json({
      visionApiKeyPresent: hasVision,
      openaiApiKeyPresent: hasOpenAI,
      geminiApiKeyPresent: hasGemini,
      appUrl: APP_URL,
      status,
      message: `Gemini: ${hasGemini ? 'OK' : 'NO'} | Vision OCR: ${hasVision ? 'OK' : 'opzionale'} | OpenAI: ${hasOpenAI ? 'OK' : 'opzionale'}`,
    });
  });

  // ====================================================================
  // AI Proxy: Gemini (chiave server-side, evita 403/CORS dal browser)
  // ====================================================================
  app.post('/api/gemini/generate', aiLimiter, async (req, res) => {
    const { model, contents, config } = req.body;
    const API_KEY = process.env.GEMINI_API_KEY;
    if (!API_KEY) {
      return res.status(500).json({ error: tError(getLang(req), 'missingGeminiKey') });
    }
    try {
      const genai = new GoogleGenAI({ apiKey: API_KEY });
      const response = await genai.models.generateContent({ model, contents, config });
      res.json({ text: response.text });
    } catch (error: any) {
      const status = error?.status || 500;
      console.error(`[Gemini Proxy] Error (${status}):`, error?.message || error);
      res.status(status).json({ error: error?.message || 'Gemini generation failed', status });
    }
  });

  // ====================================================================
  // AI proxies (preservati dal server.ts originale)
  // ====================================================================
  app.post('/api/vision/ocr', aiLimiter, async (req, res) => {
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

  app.post('/api/openai/extract', aiLimiter, async (req, res) => {
    const { prompt, data, image } = req.body;
    const API_KEY = process.env.OPENAI_API_KEY;
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
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({
          model: 'gpt-4o',
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

  app.post('/api/openai/list-items', aiLimiter, async (req, res) => {
    const { prompt, data, image } = req.body;
    const API_KEY = process.env.OPENAI_API_KEY;
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
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
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
  app.post('/api/openai/menu-scan', aiLimiter, async (req, res) => {
    const { text, images, allowPizzas } = req.body;
    const API_KEY = process.env.OPENAI_API_KEY;
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
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({
          model: hasImages ? 'gpt-4o' : 'gpt-4o-mini',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userContent },
          ],
          response_format: { type: 'json_object' },
          temperature: 0,
          max_tokens: 4096,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message || 'OpenAI error');
      const parsed = JSON.parse(result.choices[0].message.content);
      console.log(
        `[OpenAI menu-scan] dishes:${(parsed.dishes || []).length} drinks:${(parsed.drinks || []).length}`
      );
      res.json(parsed);
    } catch (error) {
      console.error('OpenAI menu-scan Error:', error);
      res.status(500).json({ error: error instanceof Error ? error.message : 'Scan failed' });
    }
  });

  // --- OpenAI Native Batch Extract (fallback quando Gemini esaurisce quota) ---
  app.post('/api/openai/menu-extract', aiLimiter, async (req, res) => {
    const { text, images, itemNames, type } = req.body;
    const API_KEY = process.env.OPENAI_API_KEY;
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
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({
          model: 'gpt-4o',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userContent },
          ],
          response_format: { type: 'json_object' },
          temperature: 0,
          max_tokens: 8192,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message || 'OpenAI error');
      const parsed = JSON.parse(result.choices[0].message.content);
      console.log(`[OpenAI menu-extract] items:${(parsed.items || []).length}`);
      res.json(parsed);
    } catch (error) {
      console.error('OpenAI menu-extract Error:', error);
      res.status(500).json({ error: error instanceof Error ? error.message : 'Extract failed' });
    }
  });

  // --- OpenAI Native Pairings (fallback quando Gemini esaurisce quota) ---
  app.post('/api/openai/pairings', aiLimiter, async (req, res) => {
    const { restaurantInfo, dishes, drinks: drinksList } = req.body;
    const API_KEY = process.env.OPENAI_API_KEY;
    if (!API_KEY) return res.status(500).json({ error: tError(getLang(req), 'missingOpenAIKey') });
    const lang = getLang(req);
    const systemPrompt = pairingsSystemPrompt(lang);
    const drinksLabel = lang === 'en' ? 'AVAILABLE DRINKS' : 'BEVANDE DISPONIBILI';
    const userContent = `${pairingsUserPrefix(lang, restaurantInfo)}${JSON.stringify(dishes)}\n\n${drinksLabel}: ${JSON.stringify(drinksList)}`;

    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({
          model: 'gpt-4o',
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
  // Vite middleware (frontend SPA)
  // ====================================================================
  if (process.env.NODE_ENV !== 'production') {
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
