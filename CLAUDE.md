# pAIrbuilder — memoria di progetto per Claude Code

> Questo file viene letto automaticamente da Claude Code all'apertura della cartella.
> Serve a evitare che ti debba spiegare il progetto ogni volta da capo.
> Mantienilo aggiornato quando l'architettura cambia.

## Cos'è pAIrbuilder

Generatore AI di abbinamenti vino/birra/spirits per ristoranti. L'utente carica un menu cibo e una carta drink, l'AI propone gli abbinamenti ottimali piatto per piatto, esportabili in PDF.

Owner del progetto: **Enrico** (`enrico@bibisrl.com`, GitHub `enrico1512`). **NON è un programmatore**: parla in italiano semplice, evita gergo, esegui tu i comandi, chiedi conferma solo quando serve davvero una decisione.

## Stato del progetto

In sviluppo attivo. Modalità ospite funziona; sistema di login presente lato backend ma non ancora esposto nel frontend (verrà attivato con un popup opzionale). Schema DB completo e popolato con seed demo.

## Stack tecnologico

| Livello | Tecnologia |
|---|---|
| Frontend | React 19 + Vite 6 + TypeScript + Tailwind 4 |
| Backend | Express 4 + tsx |
| ORM | Drizzle ORM |
| Database | PostgreSQL su Neon (cloud) |
| Auth | bcrypt + express-session + connect-pg-simple |
| AI gateway | OpenRouter (1 chiave, modello prefissato es. `anthropic/claude-sonnet-4.5`) |
| AI primario | Anthropic Claude Sonnet (output 64k, batching server-side) |
| AI fallback | OpenAI GPT-4o → Gemini 2.0 Flash |
| OCR opzionale | Google Cloud Vision API |
| File parsing | mammoth (DOCX), pdfjs-dist (PDF), xlsx (Excel) |
| Export | jspdf, jspdf-autotable |

## Architettura a 4 ambienti

```
TUO PC (dev)  ──push──>  GITHUB  ──pull──>  REPLIT (produzione)
     │                                            │
     └────────── NEON DB (condiviso) ─────────────┘
```

- **PC** = officina di sviluppo. Tutte le modifiche partono da qui.
- **GitHub** (`enrico1512/pAIrbuilder`) = source of truth.
- **Replit** = "vetrina" pubblica. Si aggiorna via `git pull`.
- **Neon** = unico database condiviso. Modifiche ai dati sono istantanee per entrambi gli ambienti.

**Regola operativa fondamentale**: un solo strumento AI alla volta tocca il codice. Se Enrico ha aperto Replit Agent in parallelo, fermati e chiedigli di chiuderlo prima di procedere.

## Struttura del repository

```
Pairbuilder/
├── src/                      Frontend React
│   ├── components/           AboutSection, MenuUpload, MenuReview,
│   │                         PairingResults, RestaurantOnboarding, ...
│   └── lib/                  fileParser.ts, gemini.ts, vision.ts,
│                             learningService.ts
├── db/                       Backend database
│   ├── schema.sql            DDL Postgres (fonte di verità SQL)
│   ├── schema.ts             Schema Drizzle (specchio TS)
│   ├── client.ts             Pool Postgres + istanza Drizzle
│   ├── seed.sql              Dati demo (1 ristorante, 3 piatti, 3 drink)
│   └── README.md             Documentazione DB
├── scripts/                  Utility CLI
│   ├── apply-sql.ts          Riapplica schema/seed
│   ├── fix-demo-password.ts  Reset password utente demo
│   └── verify.ts             Conta record nelle tabelle
├── server.ts                 Express server unico (auth + CRUD + AI proxy)
├── drizzle.config.ts         Config drizzle-kit
├── package.json
├── .env.example              Variabili da configurare in .env
└── .replit                   Config Replit
```

## Schema database (11 tabelle)

`restaurants` → anagrafica + contatti + social + indirizzo + coordinate.
`users` → login ristoranti, bcrypt, ruoli (`owner|manager|staff`).
`sessions` → sessioni Express persistite (connect-pg-simple).
`auth_tokens` → reset password / verifica email.
`food_categories` → categorie menu cibo per ristorante.
`food_items` → piatti con allergeni (`text[]`), `flavor_profile` (jsonb), prezzo, flag vegetariano/vegano/glutenfree, livello piccante.
`drinks` → vini/birre/spirits/cocktail/soft. Campi specifici vino: `wine_color`, `grape_varieties`, `vintage`. `flavor_profile` jsonb per pairing.
`contacts` → referenti interni (chef, sommelier...).
`opening_hours` → orari apertura.
`pairings` → abbinamenti piatto↔drink con `score`, `rationale`, `source` (`ai|manual`), `model`.
`ai_requests` → audit chiamate AI con token e costo.

**Vincoli importanti:**
- Tutte le tabelle di dominio hanno `restaurant_id` con `ON DELETE CASCADE` → eliminare un ristorante cancella tutto il suo mondo (GDPR-friendly).
- UUID come PK ovunque (non SERIAL).
- `pairings` ha `UNIQUE (food_item_id, drink_id)` → un solo abbinamento per coppia.
- Check constraint su `drinks`: `wine_color` può essere valorizzato solo se `category = 'wine'`.

## Endpoint backend chiave

**Auth** (richiede `requireAuth` per gli endpoint protetti):
- `POST /api/auth/register` — registrazione ristorante + utente owner
- `POST /api/auth/login` — login
- `POST /api/auth/logout` — logout
- `GET /api/auth/me` — info sessione corrente

**Config / debug:**
- `GET /api/config-check` — verifica quali chiavi AI sono configurate

**AI proxy (chiavi server-side, mai esposte al browser):**
- `POST /api/gemini/generate` — proxy Gemini
- `POST /api/vision/ocr` — OCR via Google Vision
- `POST /api/openai/extract`, `/list-items`, `/menu-scan`, `/menu-extract`, `/pairings` — fallback OpenAI

**CRUD** (tutti scoped per `restaurant_id` dell'utente loggato):
- `/api/food-categories`, `/api/food-items`, `/api/drinks`, `/api/contacts`, `/api/pairings`

## Variabili d'ambiente

Vedi `.env.example`. In locale stanno in `.env`; su Replit nei Secrets.

- `DATABASE_URL` — connection string Neon (obbligatoria)
- `SESSION_SECRET` — stringa lunga casuale (obbligatoria)
- `BCRYPT_ROUNDS` — default 12
- `OPENROUTER_API_KEY` — chiave gateway aziendale BIBI Srl. Se settata, copre tutti e 3 i provider AI (Anthropic, OpenAI, Gemini) via OpenRouter. È il modo consigliato in produzione.
- `GEMINI_API_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY` — chiavi dirette per provider singolo (usate SOLO se `OPENROUTER_API_KEY` non è settata, es. dev locale con account personali).
- `GOOGLE_CLOUD_VISION_API_KEY` — opzionale, OCR avanzato
- `PORT` — default 3000 locale, iniettato da Replit in produzione
- `APP_URL` — vuoto in locale, iniettato da Replit
- `NODE_ENV`, `DISABLE_HMR` — flag di sviluppo

## Comandi frequenti

```bash
# Sviluppo
npm run dev               # avvia server Express + Vite (porta 3000)
npm run build             # build di produzione
npm run lint              # tsc --noEmit

# Database
npx drizzle-kit push      # applica schema.ts al DB (preferito)
psql "$DATABASE_URL" -f db/schema.sql   # alternativa con SQL puro
psql "$DATABASE_URL" -f db/seed.sql     # carica dati demo

# Utility
tsx scripts/verify.ts             # conta record per tabella
tsx scripts/fix-demo-password.ts  # reset password owner demo
tsx scripts/apply-sql.ts <file>   # esegue uno script SQL arbitrario

# Git / deploy
git add . && git commit -m "..."
git push origin main      # poi su Replit Shell: git pull origin main
```

## Account nel DB

**Account operativo di Enrico** (usare questo per i test su menu/drink reali):
- Email: `enrico.patrizio@ambrosiavino.com`
- Ristorante: `Ambrosia Vino`
- `is_platform_admin = TRUE`
- Password: la conosce solo Enrico — non chiederla, non scriverla in file.

**Utente demo seed** (usare solo se serve un sandbox pulito):
- Email: `owner@trattoriademo.it`
- Password: `password123` (resettabile con `tsx scripts/fix-demo-password.ts`)
- Restaurant ID: `11111111-1111-1111-1111-111111111111`
- `is_platform_admin = TRUE`

Per elencare gli utenti DB in qualsiasi momento: `tsx scripts/check-admins.ts`.

## Convenzioni di codice

- **Mai** mettere chiavi API nel frontend. Tutte le chiamate AI passano per proxy server (`/api/gemini/*`, `/api/openai/*`).
- **Mai** leggere/scrivere dati di un ristorante senza passare per il middleware `requireAuth` che inietta `req.user.restaurantId`.
- Per le porte usare sempre `Number(process.env.PORT) || 3000`, mai hardcoded — su Replit la porta è dinamica.
- File di log/debug: stampare su `console.log` con prefisso `[Nome modulo]` (es. `[Gemini Proxy]`).
- Migrations: usare `drizzle-kit generate` quando si modifica `schema.ts`, non scrivere SQL a mano in `schema.sql`.

## Workflow tipico per nuove feature

1. Enrico descrive la feature in Cowork (chat) → si decide l'approccio
2. Cowork prepara un "messaggione" per Claude Code con specifiche tecniche
3. Claude Code implementa in locale, testa con `npm run dev` su `localhost:3000`
4. Verifica con `curl` o nel browser
5. Commit + push su GitHub
6. Su Replit Shell: `git pull origin main && npm install && Ctrl+C il server e relancia npm run dev`
7. Verifica produzione

## Cose da NON fare

- ❌ `git push --force` su `main` senza dichiarare il motivo
- ❌ `git reset --hard` senza prima fare backup di sicurezza con un branch
- ❌ `DROP TABLE` o `TRUNCATE` su tabelle con dati reali (sempre seed/demo prima)
- ❌ Sovrascrivere `.env` con valori vuoti
- ❌ Committare `.env` (deve restare in `.gitignore`)
- ❌ Modificare codice in parallelo da PC e da Replit Agent (causa divergenze pagate care)
- ❌ Esporre chiavi API nel bundle frontend

## Storia del progetto (per contesto)

- Progetto nato su Replit come SPA React + Gemini direttamente dal browser
- Sviluppato in parallelo con Replit Agent (UI/proxy AI) e Claude Code (auth/DB)
- I due rami unificati in un merge complesso il 18 maggio 2026 (commit `ea8c2c3`)
- Da allora: una sola fonte (PC con Claude Code), Replit solo per il deploy
