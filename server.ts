import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import session from 'express-session';
import connectPg from 'connect-pg-simple';
import bcrypt from 'bcrypt';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import { and, eq } from 'drizzle-orm';
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
const PORT = parseInt(process.env.PORT || '3000', 10);

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
    res.json({
      visionApiKeyPresent: hasVision,
      openaiApiKeyPresent: hasOpenAI,
      status: hasVision && hasOpenAI ? 'Ready' : 'Partial Configuration',
      message: `${hasVision ? 'OK Vision' : 'NO Vision'} | ${hasOpenAI ? 'OK OpenAI' : 'NO OpenAI'}`,
    });
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
        return res.status(response.status).json({
          error: data.error?.message || 'Google Vision API error',
          code: response.status,
          details: data.error?.details || null,
        });
      }
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
