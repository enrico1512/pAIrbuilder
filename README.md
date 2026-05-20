# pAIrbuilder

> Generatore AI di abbinamenti cibo-bevanda per ristoranti. L'utente carica il menu cibo e la carta drink, l'AI propone gli abbinamenti ottimali piatto per piatto, esportabili in PDF.

Live: **https://pairbuilder.onrender.com** (in futuro `pairbuilder.ambrosiavino.com`).

Owner: **BIBI Srl** — Enrico (`enrico@bibisrl.com`, GitHub [`enrico1512`](https://github.com/enrico1512)).

---

## Cos'è e a chi serve

pAIrbuilder è uno strumento **gratuito** rivolto ai ristoratori. Il flusso utente:

1. Inserisce le info del proprio locale (nome, tipo di cucina, contatti).
2. Carica il menu del cibo e la carta drink (PDF, immagine, DOCX, Excel).
3. L'AI estrae piatti e drink con dettagli (categoria, ingredienti, prezzo, annata, ecc.).
4. L'utente rivede/corregge l'estrazione.
5. L'AI genera abbinamenti piatto ↔ drink con motivazione.
6. L'utente scarica un PDF pronto da presentare ai clienti.

Per chi utilizza la piattaforma il servizio è uguale **sia come ospite sia come utente registrato**: l'unica differenza è che gli utenti loggati ritrovano le carte caricate al rientro (feature in roadmap).

Il valore di ritorno per BIBI Srl è il **dataset aggregato cross-ristorante** (menu, prezzi, abbinamenti) consultabile via endpoint admin o Excel export.

---

## Stack tecnologico

| Livello | Tecnologia |
|---|---|
| Frontend | React 19 + Vite 6 + TypeScript + Tailwind 4 + react-i18next |
| Backend | Express 4 + tsx (Node 20) |
| ORM | Drizzle ORM |
| Database | PostgreSQL su Neon (cloud) |
| Auth | bcrypt + express-session + connect-pg-simple |
| Security | helmet + express-rate-limit |
| AI primario | Google Gemini (`@google/genai`) via proxy server |
| AI fallback | OpenAI (gpt-4o, gpt-4o-mini) |
| OCR opzionale | Google Cloud Vision API |
| File parsing | mammoth (DOCX), pdfjs-dist (PDF), xlsx (Excel) |
| Export | jspdf, jspdf-autotable (PDF abbinamenti); xlsx (export admin) |
| Deploy | Render (Frankfurt, blueprint via `render.yaml`) |

---

## Setup locale

### Prerequisiti

- Node.js 20+
- Accesso a un database PostgreSQL 14+ (consigliato Neon free tier)
- Chiavi API: Google Gemini, OpenAI, opzionalmente Google Cloud Vision

### Installazione

```bash
git clone https://github.com/enrico1512/pAIrbuilder.git
cd pAIrbuilder
npm install
cp .env.example .env
# editare .env riempiendo DATABASE_URL, SESSION_SECRET, GEMINI_API_KEY, OPENAI_API_KEY
```

### Bootstrap database

```bash
# Applica schema base
npx tsx scripts/apply-sql.ts db/schema.sql

# Applica le migration in ordine
npx tsx scripts/apply-sql.ts db/migrations/0001_preferred_language.sql
npx tsx scripts/apply-sql.ts db/migrations/0002_admin_and_guest_tracking.sql

# (opzionale) seed di un ristorante demo
npx tsx scripts/apply-sql.ts db/seed.sql
```

### Avvio dev server

```bash
npm run dev          # express + vite HMR su http://localhost:3000
```

### Comandi utili

```bash
npm run build                          # build di produzione (dist/)
npm run lint                           # tsc --noEmit
npx tsx scripts/verify.ts              # conta record per tabella
npx tsx scripts/grant-admin.ts <email> # promuove un utente a platform admin
```

---

## Variabili d'ambiente

Vedi `.env.example`. In locale stanno in `.env`; su Render nei "Environment" della dashboard.

| Variabile | Obbligatoria | Descrizione |
|---|---|---|
| `DATABASE_URL` | sì | Connection string Postgres (Neon o equivalente) |
| `DATABASE_SSL` | no | `true` (default) o `false` se DB locale senza TLS |
| `SESSION_SECRET` | sì | Stringa lunga casuale per firmare i cookie di sessione |
| `BCRYPT_ROUNDS` | no | Default 12 |
| `GEMINI_API_KEY` | sì in prod | Chiave Google AI Studio |
| `OPENAI_API_KEY` | sì in prod | Chiave OpenAI Platform |
| `GOOGLE_CLOUD_VISION_API_KEY` | no | OCR avanzato per menu fotografati |
| `PORT` | no | Default 3000 locale, iniettata da Render in prod |
| `APP_URL` | no | URL pubblico (es. `https://pairbuilder.ambrosiavino.com`) — usato per link assoluti |
| `NODE_ENV` | no | `production` in deploy, `development` (default) in locale |

---

## Struttura del repository

```
Pairbuilder/
├── src/                              Frontend React
│   ├── components/                   AuthModal, MenuUpload, MenuReview,
│   │                                 PairingResults, RestaurantOnboarding,
│   │                                 LanguageSwitcher, AboutSection, ...
│   ├── lib/                          gemini.ts (AI client), fileParser.ts,
│   │                                 auth.tsx (AuthContext), pdfFonts.ts,
│   │                                 categoryMap.ts, learningService.ts
│   └── i18n/                         react-i18next setup + locales IT/EN
├── server/                           Backend utility
│   └── i18n.ts                       Dizionario errori + prompt builder OpenAI per lingua
├── server.ts                         Express server unico (auth + CRUD + AI proxy + admin)
├── db/
│   ├── schema.sql                    DDL Postgres (fonte di verita' SQL)
│   ├── schema.ts                     Schema Drizzle (specchio TS)
│   ├── migrations/                   ALTER TABLE additive, idempotenti
│   ├── client.ts                     Pool Postgres + istanza Drizzle
│   ├── seed.sql                      Dati demo (1 ristorante, 3 piatti, 3 drink)
│   ├── ADMIN-QUERIES.sql             Query SQL operative per platform owner
│   └── README.md                     Documentazione DB
├── scripts/                          Utility CLI tsx
│   ├── apply-sql.ts                  Esegue uno script SQL arbitrario
│   ├── verify.ts                     Conta record per tabella
│   ├── fix-demo-password.ts          Reset password owner demo
│   └── grant-admin.ts                Promuove un utente a platform admin
├── public/fonts/                     Liberation Sans (per accenti Unicode in PDF)
├── render.yaml                       Blueprint deploy Render
├── drizzle.config.ts                 Config drizzle-kit
├── package.json
├── .env.example
├── CLAUDE.md                         Note interne per Claude Code (sviluppo)
├── TODO_GOLIVE.md                    Checklist verso il deploy pubblico
└── README.md                         Questo file
```

---

## Schema database

11 tabelle con `restaurant_id` come asse principale e `ON DELETE CASCADE` ovunque (GDPR-friendly). UUID come PK.

| Tabella | Cosa contiene |
|---|---|
| `restaurants` | Anagrafica ristorante. Flag `is_guest` per sessioni anonime; `guest_email`/`guest_phone` catturati dal form di onboarding |
| `users` | Login ristoranti (bcrypt). Flag `is_platform_admin` per l'owner. `preferred_language` per il selettore lingua |
| `sessions` | Sessioni Express persistite (connect-pg-simple) |
| `auth_tokens` | Token reset password / verifica email (struttura pronta, logica WIP) |
| `food_categories` | Sezioni del menu cibo |
| `food_items` | Piatti con `ingredients`, `allergens[]`, `price_cents`, flag dietary, `flavor_profile` jsonb |
| `drinks` | Vini/birre/spirits/cocktail/soft. `wine_color`, `grape_varieties[]`, `vintage`, `price_bottle_cents`, `price_glass_cents` |
| `contacts` | Referenti interni (chef, sommelier) |
| `opening_hours` | Orari di apertura |
| `pairings` | Abbinamento piatto↔drink. `rationale` (descrizione AI), `language`, `model`, `source` (`ai\|manual`) |
| `ai_requests` | Audit chiamate AI (token, costo) — struttura pronta, popolamento WIP |

Vedi `db/schema.sql` per la DDL completa.

---

## API principali

**Auth** (`requireAuth` su endpoint protetti):
- `POST /api/auth/register` — registrazione ristorante + utente owner
- `POST /api/auth/login` — login (rate-limit 10/5min)
- `POST /api/auth/logout` — logout
- `GET /api/auth/me` — info sessione corrente
- `PUT /api/auth/preferred-language` — aggiorna lingua utente loggato

**Guest tracking**:
- `POST /api/guest/onboarding` — crea restaurant `is_guest=true` legato alla sessione anonima

**Bulk save** (sia loggati sia ospiti via `requireSession`):
- `POST /api/dishes/bulk` — array dishes da MenuReview
- `POST /api/drinks/bulk` — array drinks
- `POST /api/pairings/bulk` — array pairings con `language` e `model`

**AI proxy** (rate-limit 60/min):
- `POST /api/gemini/generate`
- `POST /api/vision/ocr`
- `POST /api/openai/{extract,list-items,menu-scan,menu-extract,pairings}`

**Admin** (`requireAdmin` → `users.is_platform_admin=true`):
- `GET /api/admin/restaurants` — lista ristoranti con counts e contatti
- `GET /api/admin/restaurants/:slug/full` — dettaglio (dishes + drinks + pairings)
- `GET /api/admin/stats` — KPI globali piattaforma
- `GET /api/admin/export.xlsx` — workbook Excel con 4 sheet (Ristoranti / Piatti / Drinks / Abbinamenti)

**CRUD** (legacy, `requireAuth`):
- `/api/food-categories`, `/api/food-items`, `/api/drinks`, `/api/contacts`, `/api/pairings`

**Operational**:
- `GET /api/health` — liveness check (usato da Render)
- `GET /api/config-check` — diagnostica chiavi AI configurate

---

## Internazionalizzazione (i18n)

Lingue supportate al momento: **italiano** (default), **inglese**.

- Frontend: `react-i18next` + locales JSON in `src/i18n/locales/`. Selettore lingua nell'header (pill "IT/EN"). Persistenza in `localStorage` per ospiti, in `users.preferred_language` per i loggati.
- Backend: gli endpoint leggono la lingua dal header custom `X-App-Language` (fallback `Accept-Language` → `it`). I 5 prompt OpenAI sono parametrizzati per lingua via `server/i18n.ts`.
- Il fetch wrapper in `src/i18n/index.ts` aggiunge automaticamente `X-App-Language` a ogni richiesta verso `/api/*`.
- PDF abbinamenti localizzato (titolo, footer, firma, nome file).
- Convenzione tipografica IT: in MAIUSCOLO niente accenti (es. "PERCHE FUNZIONA" non "PERCHÉ FUNZIONA"); in minuscolo invece sì ("perché").

---

## Deploy su Render

Il deploy è automatico via blueprint `render.yaml`:

1. Push su `main` → Render rileva il push, esegue `npm install && npm run build` → riavvia il servizio.
2. Le migration DB sono **idempotenti** (ALTER TABLE ADD COLUMN IF NOT EXISTS). Si applicano a mano via `npx tsx scripts/apply-sql.ts db/migrations/00XX_*.sql` prima del primo deploy che le richiede.
3. Le env vars sono configurate nella dashboard Render → Environment.
4. Healthcheck: `/api/health`.

Locale → produzione:

```bash
git checkout main
git pull
# fai le tue modifiche su un branch feat/qualcosa
git checkout -b feat/x
# ... lavora ...
git push -u origin feat/x
git checkout main && git merge --no-ff feat/x -m "Merge ..."
git push origin main          # Render redeploy parte qui
```

---

## Sicurezza

- Tutte le chiavi AI restano server-side (proxy via `/api/{gemini,openai,vision}/*`).
- Cookie di sessione `HttpOnly + Secure + SameSite=Lax`, persistiti in `sessions` (durata 30 giorni).
- `app.set('trust proxy', 1)` per leggere `X-Forwarded-For` dietro il loadbalancer Render.
- bcrypt 12 rounds per le password.
- helmet attivo (HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy). CSP **disabilitata** in attesa che il dominio finale sia fissato.
- Rate limiting su auth (10 req / 5 min) e AI proxy (60 req / min).

---

## Cosa manca prima del lancio pubblico

Vedi `TODO_GOLIVE.md`. In sintesi:

- **Bloccanti**: informativa privacy + termini, test end-to-end con menu reali, configurazione env su Render.
- **Importanti**: reset password (richiede mail provider), pagina impostazioni ristorante, CRUD opening_hours.
- **Post-lancio**: monitoring/analytics, verifica email, editor singolo piatto/drink, login social.

---

## License

Proprietario — BIBI Srl. Non distribuito sotto licenza open source. Per richieste di utilizzo contattare `enrico@bibisrl.com`.
