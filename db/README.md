# pAIrbuilder — Database

Schema PostgreSQL per pAIrbuilder. Copre:

- Account ristoranti con login (`restaurants`, `users`, `sessions`, `auth_tokens`)
- Anagrafica completa, contatti, orari (`contacts`, `opening_hours`)
- Menu cibo (`food_categories`, `food_items`)
- Menu drink — vini, birre, spirits, cocktail, soft — (`drinks`)
- Abbinamenti AI persistiti (`pairings`)
- Audit chiamate AI (`ai_requests`)

## File

| File | A cosa serve |
|------|--------------|
| `schema.sql` | DDL puro, importabile su qualsiasi Postgres 14+ |
| `schema.ts` | Stesso schema in Drizzle ORM (type-safe TypeScript) |
| `client.ts` | Pool Postgres + istanza Drizzle pronta all'uso |
| `seed.sql` | Dati demo: 1 ristorante, 3 piatti, 3 drink, 2 contatti |
| `../drizzle.config.ts` | Config drizzle-kit per generare migrations |

## Setup (passo per passo)

### 1. Provisioning del database

Hai tre opzioni veloci:

- **Replit**: dalla sidebar → *Tools* → *Database* → *Create a Database* (PostgreSQL). Replit setta automaticamente `DATABASE_URL`.
- **Neon** (consigliato fuori da Replit): https://neon.tech, crea un progetto, copia la connection string.
- **Locale**: `postgres://postgres:postgres@localhost:5432/pairbuilder`.

### 2. Variabili d'ambiente

Copia `.env.example` in `.env` e compila:

```bash
cp .env.example .env
```

Almeno `DATABASE_URL` e `SESSION_SECRET`.

### 3. Installa le dipendenze mancanti

Lo stack attuale non ha ancora DB/ORM/auth. Aggiungi:

```bash
npm install drizzle-orm pg bcrypt express-session connect-pg-simple
npm install -D drizzle-kit @types/pg @types/bcrypt @types/express-session
```

### 4. Crea le tabelle

**Opzione A — SQL diretto (più veloce, zero dipendenze):**

```bash
psql "$DATABASE_URL" -f db/schema.sql
psql "$DATABASE_URL" -f db/seed.sql   # opzionale
```

**Opzione B — Drizzle migrations (consigliato per il futuro):**

```bash
npx drizzle-kit generate    # genera SQL da schema.ts in db/migrations/
npx drizzle-kit migrate     # applica le migrazioni
```

### 5. Usa il client Drizzle nel codice

```ts
import { db } from './db/client';
import { restaurants, foodItems } from './db/schema';
import { eq } from 'drizzle-orm';

// Lista piatti di un ristorante
const items = await db
  .select()
  .from(foodItems)
  .where(eq(foodItems.restaurantId, myRestaurantId));
```

## Scelte di design (e perché)

- **UUID come PK** — niente collisioni se in futuro federi più istanze, e non esponi sequenze numeriche pubblicamente.
- **`citext` per email** — confronto case-insensitive senza dover normalizzare a mano.
- **`text[]` per allergeni / vitigni** — leggero, indicizzabile, niente tabella pivot per liste piccole.
- **`jsonb` per `flavor_profile`** — lascia spazio al motore AI senza migrazioni per ogni nuovo descrittore.
- **Multi-tenant scoperto da `restaurant_id`** — ogni tabella di dominio ha la FK, perché un'app SaaS multi-ristorante è la direzione naturale.
- **`pairings` con UNIQUE (food_item_id, drink_id)** — evita duplicati e permette di sovrascrivere lo score quando l'AI rigenera.
- **`ai_requests`** — logga prompt, tokens e costo: utile per fatturazione e debug dei pairing strani.
- **`ON DELETE CASCADE` dai ristoranti** — chiudere un account elimina dati a cascata in modo prevedibile (GDPR-friendly).
- **Trigger `set_updated_at`** — niente logica timestamp lato app.

## Prossimi passi suggeriti

1. **Auth endpoint** in `server.ts`: `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout`, `POST /api/auth/reset-password`.
2. **Middleware sessione** con `express-session` + `connect-pg-simple` (tabella `sessions` già pronta).
3. **CRUD menu** scoped per `restaurant_id` derivato dalla sessione.
4. **Endpoint pairing**: `POST /api/pairings/generate` → chiama Gemini/OpenAI → salva in `pairings` + log in `ai_requests`.
5. **Migrare il file `pairbuilder (4).zip`** nel repo: va rimosso da git (anti-pattern) e i sorgenti estratti.
