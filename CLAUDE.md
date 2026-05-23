# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> pAIrbuilder — memoria di progetto per Claude Code.
> Letto automaticamente all'apertura della cartella: evita di dover rispiegare il progetto ogni volta. Tenere aggiornato quando l'architettura cambia.
> `README.md` resta il documento di riferimento più dettagliato (setup, schema, API, deploy); questo file è la guida operativa rapida.

## Cos'è pAIrbuilder

Generatore AI di abbinamenti cibo↔bevanda (vino/birra/spirits) per ristoranti. L'utente carica un menu cibo e una carta drink, l'AI estrae i contenuti, l'utente li rivede, l'AI propone gli abbinamenti piatto per piatto con motivazione, il tutto esportabile in PDF. Servizio gratuito per i ristoratori; il valore per BIBI Srl è il dataset aggregato cross-ristorante (visibile via endpoint admin / export Excel).

Owner del progetto: **Enrico** (`enrico@bibisrl.com`, GitHub `enrico1512`), per **BIBI Srl**. **Non è un programmatore**: parla in italiano semplice, evita gergo, esegui tu i comandi e spiega cosa succede. Chiedi conferma solo quando serve davvero una decisione o prima di azioni rischiose.

## Stato del progetto

In sviluppo attivo, verso il lancio pubblico (vedi `TODO_GOLIVE.md`). Live su **https://pairbuilder.onrender.com**. Modalità ospite pienamente funzionante; il login esiste lato backend ed è esposto via `AuthModal`, ma il riuso delle carte salvate per gli utenti loggati è ancora in roadmap. Schema DB completo, popolato con seed demo. i18n IT/EN attivo.

## Stack tecnologico

| Livello | Tecnologia |
|---|---|
| Frontend | React 19 + Vite 6 + TypeScript + Tailwind 4 + react-i18next |
| Backend | Express 4 + tsx (Node 20), server single-file |
| ORM | Drizzle ORM (+ `pg` Pool) |
| Database | PostgreSQL su Neon (cloud) |
| Auth | bcrypt + express-session + connect-pg-simple |
| Security | helmet + express-rate-limit, `trust proxy` |
| AI primario | Google Gemini (`@google/genai`) via proxy server |
| AI fallback | OpenAI (gpt-4o / gpt-4o-mini) via proxy server |
| OCR opzionale | Google Cloud Vision API |
| File parsing | mammoth (DOCX), pdfjs-dist (PDF), xlsx (Excel) |
| Export | jspdf + jspdf-autotable (PDF abbinamenti); xlsx (export admin) |
| Deploy | **Render** (Frankfurt, blueprint `render.yaml`, auto-deploy su `main`) |

## Comandi frequenti

```bash
# Sviluppo
npm run dev               # un solo processo: tsx server.ts → Express + Vite HMR su :3000
npm run build             # build di produzione in dist/
npm run start             # come dev ma pensato per produzione (NODE_ENV=production)
npm run lint              # tsc --noEmit (NON esiste un test runner: "lint" è il check)

# Database (bootstrap su un DB nuovo, in ordine)
npx tsx scripts/apply-sql.ts db/schema.sql
npx tsx scripts/apply-sql.ts db/migrations/0001_preferred_language.sql
npx tsx scripts/apply-sql.ts db/migrations/0002_admin_and_guest_tracking.sql
npx tsx scripts/apply-sql.ts db/seed.sql            # opzionale: ristorante demo
npx drizzle-kit push                                # alternativa: applica schema.ts al DB

# Utility
npx tsx scripts/verify.ts              # conta record per tabella
npx tsx scripts/grant-admin.ts <email> # promuove un utente a platform admin (is_platform_admin)
npx tsx scripts/fix-demo-password.ts   # reset password owner demo

# Verifica veloce di un endpoint
curl -s localhost:3000/api/health | jq
curl -s localhost:3000/api/config-check | jq   # quali chiavi AI sono configurate
```

Non esiste una test suite: la verifica è manuale (`npm run dev` → browser su `localhost:3000`, oppure `curl` sugli endpoint). `npm run lint` (typecheck) è l'unico gate automatico — eseguilo dopo modifiche TS non banali.

## Architettura — il quadro d'insieme

**Tutto il backend vive in un unico file: `server.ts`.** Capirlo è la chiave per orientarsi.

- L'intera app è dentro un'unica `async function startServer()`. Middleware, helper e rotte sono definiti lì dentro (quindi `grep` su `server.ts` per `app.get(` / `app.post(`).
- **Dev vs prod nello stesso file**: in sviluppo monta Vite in middleware mode (`createViteServer({ server:{ middlewareMode:true } })` → `app.use(vite.middlewares)`); in produzione serve `express.static(dist)`. Una catch-all `app.get('*')` fa da fallback SPA. Per questo `npm run dev` è un solo processo, non due.
- **CRUD per fabbrica**: gli endpoint `/api/food-categories|food-items|drinks|contacts|pairings` sono generati da `registerCrud(routeName, table)` (rotte legacy, tutte sotto `requireAuth`).

**Tre livelli di accesso** (middleware in `server.ts`):
- `requireAuth` — utente loggato; inietta il `restaurantId` dalla sessione.
- `requireSession` — loggato **oppure** ospite; usato dagli endpoint `*/bulk`. Vedi sotto.
- `requireAdmin` — solo `users.is_platform_admin = true`; protegge gli endpoint `/api/admin/*`.

**Modello "ospite"** (centrale per il flusso pubblico): un utente anonimo che completa l'onboarding crea via `POST /api/guest/onboarding` un `restaurants` con `is_guest = true` legato alla sua sessione. Così ogni `food_item`/`drink`/`pairing` ha sempre un `restaurant_id`, identico per ospiti e loggati. I contatti del lead (`guest_email`, `guest_phone`) vengono catturati dal form. Gli endpoint `*/bulk` (`/api/dishes/bulk`, `/api/drinks/bulk`, `/api/pairings/bulk`) salvano gli array che arrivano da `MenuReview` per entrambi i casi.

**Pipeline AI** (chiavi sempre e solo server-side, mai nel bundle):
- Primario: il frontend chiama `POST /api/gemini/generate` che fa da proxy a Gemini.
- Fallback: `POST /api/openai/{extract,list-items,menu-scan,menu-extract,pairings}`.
- OCR: `POST /api/vision/ocr` (Google Cloud Vision, opzionale).
- Rate limit: 60 req/min sul proxy AI, 10 req/5min su auth.

**i18n end-to-end** (IT default, EN):
- Frontend: `react-i18next`, locale JSON in `src/i18n/locales/`. Selettore lingua (`LanguageSwitcher`) nell'header; persistenza in `localStorage` (`pairbuilder.lang`) per ospiti, in `users.preferred_language` per loggati.
- `src/i18n/index.ts` fa il **monkey-patch di `window.fetch`**: aggiunge l'header `X-App-Language` a ogni richiesta `/api/*` automaticamente (nessun plumbing per callsite).
- Backend: `server/i18n.ts` legge quella lingua e localizza i messaggi d'errore e i prompt di sistema OpenAI. I `pairings` salvano la `language` con cui sono stati generati (evita display misto se l'utente cambia lingua dopo).
- Convenzione tipografica IT: in MAIUSCOLO niente accenti ("PERCHE FUNZIONA"); in minuscolo sì ("perché").

## Struttura del repository

```
src/                 Frontend React
  components/         AuthModal, MenuUpload, MenuReview, PairingResults,
                      RestaurantOnboarding, LanguageSwitcher, AboutSection, FlashIcon
  lib/                gemini.ts (client AI), fileParser.ts, auth.tsx (AuthContext),
                      pdfFonts.ts, categoryMap.ts, vision.ts, learningService.ts
  i18n/               setup react-i18next + fetch patch + locales/{it,en}.json
server/i18n.ts        Dizionario errori + builder prompt OpenAI per lingua (lato server)
server.ts             Express server unico (auth + guest + bulk + admin + AI proxy + SPA)
db/
  schema.sql          DDL Postgres — fonte di verità SQL
  schema.ts           Schema Drizzle — specchio TS di schema.sql
  migrations/         ALTER TABLE additivi e idempotenti, applicati con apply-sql.ts
  client.ts           Pool pg + istanza Drizzle
  seed.sql            Dati demo
  ADMIN-QUERIES.sql   Query operative per il platform owner
scripts/              apply-sql.ts, verify.ts, grant-admin.ts, fix-demo-password.ts
public/fonts/         Liberation Sans (.b64) per accenti Unicode nei PDF
render.yaml           Blueprint deploy Render
```

## Schema database (11 tabelle)

UUID come PK ovunque. Tutte le tabelle di dominio hanno `restaurant_id` con `ON DELETE CASCADE` (eliminare un ristorante cancella tutto il suo mondo → GDPR-friendly). Dettaglio completo in `db/schema.sql` e `README.md`.

- `restaurants` — anagrafica + contatti/social/indirizzo/coordinate. `is_guest`, `guest_email`, `guest_phone` per le sessioni anonime.
- `users` — login (bcrypt), ruoli (`owner|manager|staff`), `is_platform_admin`, `preferred_language`.
- `sessions` — sessioni Express persistite (connect-pg-simple).
- `auth_tokens` — reset password / verifica email (struttura pronta, logica WIP).
- `food_categories` / `food_items` — piatti con `ingredients`, `allergens[]`, `price_cents`, flag dietary, `flavor_profile` (jsonb), livello piccante.
- `drinks` — wine/beer/spirit/cocktail/soft; campi vino `wine_color`/`grape_varieties[]`/`vintage`, prezzi `price_bottle_cents`/`price_glass_cents`, `flavor_profile` jsonb. Check constraint: `wine_color` valorizzabile solo se `category='wine'`.
- `contacts`, `opening_hours`.
- `pairings` — abbinamento piatto↔drink con `score`, `rationale`, `language`, `model`, `source` (`ai|manual`). `UNIQUE (food_item_id, drink_id)`.
- `ai_requests` — audit chiamate AI (token, costo); struttura pronta, popolamento WIP.

## Variabili d'ambiente

In locale in `.env` (vedi `.env.example`); su Render nella dashboard → Environment. Obbligatorie: `DATABASE_URL`, `SESSION_SECRET`, e in produzione `GEMINI_API_KEY` + `OPENAI_API_KEY`. Altre: `DATABASE_SSL` (default `true`), `BCRYPT_ROUNDS` (12), `GOOGLE_CLOUD_VISION_API_KEY` (OCR opzionale), `PORT` (3000 locale, iniettata da Render), `APP_URL`, `NODE_ENV`, `DISABLE_HMR`, `DEBUG_AI=1` (log payload AI).

## Deploy e workflow

**Produzione = Render** (non più Replit). Render legge `render.yaml` come blueprint e fa **auto-deploy a ogni push su `main`** (`npm install && npm run build` → `npm start`, healthcheck `/api/health`, region Frankfurt). Le env vars stanno nella dashboard Render.

Workflow tipico:
1. Modifica in locale partendo da `main` aggiornato, su un branch `feat/...`.
2. Testa con `npm run dev` su `localhost:3000` (più `curl` sugli endpoint toccati).
3. `npm run lint` se hai cambiato TS in modo non banale.
4. Commit, push del branch, merge in `main` (`--no-ff`), push di `main` → Render fa il redeploy da solo.

> `.replit`, `WORKFLOW.md` e `COMANDI-CODE.md` descrivono il vecchio flusso "Replit come vetrina": è **legacy**. La produzione oggi è Render. Gli slash command `/test`, `/deploy`, `/sync`, `/db-reset` citati lì sono documentati ma non implementati come comandi reali — non darli per scontati.

## Convenzioni di codice

- **Mai** chiavi API nel frontend: tutte le chiamate AI passano dai proxy `/api/{gemini,openai,vision}/*`.
- **Mai** leggere/scrivere dati di un ristorante senza passare per `requireAuth`/`requireSession`/`requireAdmin`, che iniettano/validano il `restaurantId`.
- Porte: sempre `Number(process.env.PORT) || 3000`, mai hardcoded.
- **Migrazioni DB**: si scrivono a mano come ALTER TABLE **idempotenti** (`ADD COLUMN IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`) in `db/migrations/00XX_*.sql`, si applicano con `apply-sql.ts`, e si riflettono **a mano** sia in `db/schema.sql` (fonte di verità SQL) sia in `db/schema.ts`. `drizzle-kit` è configurato ma la pratica corrente è la migrazione SQL scritta a mano: tieni allineati i tre file.
- Log: `console.log` con prefisso `[Nome modulo]` (es. `[Gemini Proxy]`).

## Cose da NON fare

- ❌ `git push --force` / `git reset --hard` su `main` senza motivo dichiarato e backup su branch.
- ❌ `DROP TABLE`/`TRUNCATE` su tabelle con dati reali (lavora su seed/demo).
- ❌ Migrazioni non idempotenti o che non aggiornano anche `schema.sql` + `schema.ts`.
- ❌ Sovrascrivere `.env` con valori vuoti; committare `.env` (resta in `.gitignore`).
- ❌ Esporre chiavi API nel bundle frontend.
- ❌ Modificare il codice in parallelo da più strumenti AI (un solo strumento alla volta tocca il codice).

## Credenziali utente demo (seed)

- Email: `owner@trattoriademo.it` · Password: `password123`
- Restaurant ID: `11111111-1111-1111-1111-111111111111`
