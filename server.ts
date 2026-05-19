import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import session from 'express-session';
import connectPg from 'connect-pg-simple';
import bcrypt from 'bcrypt';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import { and, eq } from 'drizzle-orm';
import { GoogleGenAI } from '@google/genai';
import { db, pool } from './db/client';
import {
  restaurants,
  users,
  foodCategories,
  foodItems,
  drinks,
  contacts,
} from './db/schema';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

declare module 'express-session' {
  interface SessionData {
    userId?: string;
    restaurantId?: string;
  }
}

const BCRYPT_ROUNDS = parseInt(process.env.BCRYPT_ROUNDS || '12', 10);
const PORT = Number(process.env.PORT) || 3000;
const APP_URL = process.env.APP_URL || `http://localhost:${PORT}`;

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '50mb' }));

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
      return res.status(401).json({ error: 'Non autenticato' });
    }
    next();
  }

  // ====================================================================
  // AUTH
  // ====================================================================
  app.post('/api/auth/register', async (req, res) => {
    try {
      const { restaurantName, slug, email, password, fullName } = req.body || {};
      if (!restaurantName || !slug || !email || !password) {
        return res
          .status(400)
          .json({ error: 'Mancano campi: restaurantName, slug, email, password' });
      }
      const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
      const [restaurant] = await db
        .insert(restaurants)
        .values({ slug, name: restaurantName })
        .returning();
      const [user] = await db
        .insert(users)
        .values({
          restaurantId: restaurant.id,
          email,
          passwordHash,
          fullName: fullName ?? null,
        })
        .returning();
      req.session.userId = user.id;
      req.session.restaurantId = restaurant.id;
      res.json({
        user: { id: user.id, email: user.email, fullName: user.fullName },
        restaurant: { id: restaurant.id, slug: restaurant.slug, name: restaurant.name },
      });
    } catch (err: any) {
      console.error('Register error:', err);
      res.status(500).json({ error: err?.message || 'Registrazione fallita' });
    }
  });

  app.post('/api/auth/login', async (req, res) => {
    try {
      const { email, password } = req.body || {};
      if (!email || !password) {
        return res.status(400).json({ error: 'email e password richiesti' });
      }
      const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
      if (!user) return res.status(401).json({ error: 'Credenziali errate' });
      const ok = await bcrypt.compare(password, user.passwordHash);
      if (!ok) return res.status(401).json({ error: 'Credenziali errate' });
      req.session.userId = user.id;
      req.session.restaurantId = user.restaurantId;
      await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));
      res.json({
        user: { id: user.id, email: user.email, fullName: user.fullName },
        restaurantId: user.restaurantId,
      });
    } catch (err: any) {
      console.error('Login error:', err);
      res.status(500).json({ error: err?.message || 'Login fallito' });
    }
  });

  app.post('/api/auth/logout', (req, res) => {
    req.session.destroy(() => res.json({ ok: true }));
  });

  app.get('/api/auth/me', requireAuth, async (req, res) => {
    const [user] = await db.select().from(users).where(eq(users.id, req.session.userId!)).limit(1);
    if (!user) return res.status(401).json({ error: 'Utente non trovato' });
    const [rest] = await db
      .select()
      .from(restaurants)
      .where(eq(restaurants.id, user.restaurantId))
      .limit(1);
    res.json({
      user: { id: user.id, email: user.email, fullName: user.fullName },
      restaurant: rest,
    });
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
        res.status(500).json({ error: err?.message || 'Errore lettura' });
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
        res.status(500).json({ error: err?.message || 'Errore inserimento' });
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
        if (!row) return res.status(404).json({ error: 'Non trovato' });
        res.json(row);
      } catch (err: any) {
        res.status(500).json({ error: err?.message || 'Errore aggiornamento' });
      }
    });

    app.delete(`/api/${routeName}/:id`, requireAuth, async (req, res) => {
      try {
        const rid = req.session.restaurantId!;
        const [row] = await db
          .delete(table)
          .where(and(eq(table.id, req.params.id), eq(table.restaurantId, rid)))
          .returning();
        if (!row) return res.status(404).json({ error: 'Non trovato' });
        res.json({ ok: true });
      } catch (err: any) {
        res.status(500).json({ error: err?.message || 'Errore eliminazione' });
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
  app.post('/api/gemini/generate', async (req, res) => {
    const { model, contents, config } = req.body;
    const API_KEY = process.env.GEMINI_API_KEY;
    if (!API_KEY) {
      return res.status(500).json({ error: 'Missing Gemini API Key on server.' });
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
  app.post('/api/vision/ocr', async (req, res) => {
    const { image } = req.body;
    const API_KEY = process.env.GOOGLE_CLOUD_VISION_API_KEY;
    if (!API_KEY) {
      return res.status(500).json({ error: 'Missing Vision API Key on server.' });
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

  app.post('/api/openai/extract', async (req, res) => {
    const { prompt, data, image } = req.body;
    const API_KEY = process.env.OPENAI_API_KEY;
    if (!API_KEY) return res.status(500).json({ error: 'Missing OpenAI API Key on server.' });
    try {
      const messages: any[] = [
        {
          role: 'system',
          content:
            'Sei un esperto sommelier e digitalizzatore di menu. Rispondi sempre in formato JSON valido.',
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

  app.post('/api/openai/list-items', async (req, res) => {
    const { prompt, data, image } = req.body;
    const API_KEY = process.env.OPENAI_API_KEY;
    if (!API_KEY) return res.status(500).json({ error: 'Missing OpenAI API Key on server.' });
    try {
      const messages: any[] = [
        {
          role: 'system',
          content:
            'Sei un assistente AI specializzato nel rilevamento di voci in menu di ristoranti. Rispondi in JSON.',
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
  app.post('/api/openai/menu-scan', async (req, res) => {
    const { text, images, allowPizzas } = req.body;
    const API_KEY = process.env.OPENAI_API_KEY;
    if (!API_KEY) return res.status(500).json({ error: 'Missing OpenAI API Key.' });

    const imageList: string[] = Array.isArray(images)
      ? images
      : req.body.image
      ? [req.body.image]
      : [];
    const hasImages = imageList.length > 0;

    const systemPrompt = `Sei un esperto di menu di ristoranti italiani. Il tuo compito è identificare OGNI voce di cibo e OGNI VINO presente nel testo o nelle immagini fornite.
REGOLE:
- Estrai TUTTI i piatti (antipasti, primi, secondi, contorni, dessert${allowPizzas ? ', pizze' : ''}).
- SOLO VINI per la lista "drinks": vini rossi, bianchi, rosati, bollicine/spumanti/champagne/prosecco/franciacorta, vini dolci/passiti/moscato, vini liquorosi (marsala, porto). IGNORA COMPLETAMENTE birre, cocktail, distillati (whisky, gin, rum, vodka, tequila, grappa), liquori, amari, digestivi, aperitivi non a base vino (aperol, campari), soft drink, succhi, acqua, caffè, tè. Se una sezione si chiama "Birre", "Cocktail", "Distillati", "Spiriti", "Soft Drink", "Bibite", SALTALA INTERAMENTE.
${allowPizzas ? '' : '- NON estrarre pizze.\n'}- Restituisci SOLO i nomi, esattamente come scritti nel menu.
- Rispondi SOLO con JSON valido nel formato: {"dishes": ["nome1", "nome2", ...], "drinks": ["nome1", "nome2", ...]}
- NON aggiungere prezzi, descrizioni o altri campi. Solo nomi come stringhe.
- Se ci sono più immagini, analizzale TUTTE.`;

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
          : 'Estrai tutte le voci dal menu dalle immagini fornite.',
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
  app.post('/api/openai/menu-extract', async (req, res) => {
    const { text, images, itemNames, type } = req.body;
    const API_KEY = process.env.OPENAI_API_KEY;
    if (!API_KEY) return res.status(500).json({ error: 'Missing OpenAI API Key.' });

    const imageList: string[] = Array.isArray(images)
      ? images
      : req.body.image
      ? [req.body.image]
      : [];

    const isDrinks = type === 'drinks';
    const schema = isDrinks
      ? `{"category": "Vino Rosso|Vino Bianco|Vino Rosato|Bollicine|Vino Dolce", "producer": "...", "product": "...", "price": "...", "vintage": "...", "origin": "..."}`
      : `{"category": "ANTIPASTI|PRIMI|SECONDI|DESSERT|...", "name": "...", "fullIngredients": "..."}`;

    const systemPrompt = `Sei un esperto di menu di ristoranti. Estrai i dettagli delle voci indicate dal testo/immagini del menu.
Rispondi SOLO con JSON: {"items": [${schema}, ...]}
${isDrinks ? 'SOLO VINI: la lista "items" deve contenere ESCLUSIVAMENTE vini (categorie ammesse: Vino Rosso, Vino Bianco, Vino Rosato, Bollicine, Vino Dolce). Se una voce indicata NON e\' un vino (birra, cocktail, distillato, liquore, amaro, soft drink, ecc.), SALTALA e non includerla nell\'output.\n' : ''}Estrai TUTTE le ${itemNames?.length ?? 0} voci indicate (saltando solo quelle non valide come da regole sopra). NON saltare nessuna voce valida. Analizza tutte le immagini fornite.`;

    const userContent: any[] = [
      {
        type: 'text',
        text: `Voci da estrarre: ${(itemNames || []).join(', ')}\n\nCONTENUTO:\n${text || 'Vedi immagini'}`,
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
  app.post('/api/openai/pairings', async (req, res) => {
    const { restaurantInfo, dishes, drinks: drinksList } = req.body;
    const API_KEY = process.env.OPENAI_API_KEY;
    if (!API_KEY) return res.status(500).json({ error: 'Missing OpenAI API Key.' });

    const systemPrompt = `Sei un sommelier professionista italiano. Per ogni piatto fornito, crea 2 abbinamenti usando SOLO le bevande dalla lista fornita.
Un abbinamento per "Concordanza" (gusti simili) e uno per "Contrapposizione" (contrasto).
Rispondi SOLO con JSON: {"pairings": [{"dish": "nome piatto", "drinks": [{"name": "nome bevanda", "category": "categoria", "price": "prezzo o null", "description": "3 righe di descrizione in italiano con accenti corretti (è, perché, città, qualità)", "matchType": "Concordanza|Contrapposizione"}, ...]}, ...]}
USA SOLO bevande dalla lista. Non inventare. Processa TUTTI i piatti.`;

    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({
          model: 'gpt-4o',
          messages: [
            { role: 'system', content: systemPrompt },
            {
              role: 'user',
              content: `Ristorante: ${restaurantInfo}\n\nPIATTI: ${JSON.stringify(dishes)}\n\nBEVANDE DISPONIBILI: ${JSON.stringify(drinksList)}`,
            },
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
