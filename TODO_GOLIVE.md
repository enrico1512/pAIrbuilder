# pAIrbuilder — Checklist per andare online

> **Come usarla**: le voci con `[x]` sono già completate (verificate nel codice il 19 maggio 2026). Le voci con `[ ]` sono ancora da fare. Quando completi un task, basta che me lo dici e aggiorno io la spunta nel file.

**Stato complessivo: ~75% pronto** — manca il salvataggio dei documenti caricati, il completamento profilo ristorante, alcuni CRUD e i controlli finali di deploy.

## 🎯 Obiettivo strategico del prodotto

pAIrbuilder è offerto **gratuitamente** ai ristoranti. Il valore di ritorno per noi (BIBI Srl) è **il dataset aggregato**: menu, carte vini, prezzi, abbinamenti. Per ogni ristorante dobbiamo conservare TUTTO ciò che viene caricato — file originali compresi — e ogni singolo prezzo estratto. Più dati raccogliamo, più il prodotto vale.

---

## 1. Autenticazione e gestione utente

- [x] Endpoint `POST /api/auth/register` (server.ts r.81-120)
- [x] Endpoint `POST /api/auth/login` (server.ts r.122-143)
- [x] Endpoint `POST /api/auth/logout` (server.ts r.145-147)
- [x] Endpoint `GET /api/auth/me` (server.ts r.149-161)
- [x] Middleware `requireAuth` su endpoint protetti (server.ts r.71-76)
- [x] Form di registrazione nel frontend (`AuthModal.tsx`)
- [x] Form di login nel frontend (`AuthModal.tsx`)
- [x] Sessioni persistite in PostgreSQL (`connect-pg-simple`)
- [x] Hash password con bcrypt
- [x] **Esporre il popup login nel frontend** — `AuthModal.tsx` montato in `App.tsx`, si apre al primo accesso. "Continua come ospite" persistito in `localStorage.pairbuilder.authDismissed`. Dropdown utente con voci condizionali (Accedi/Crea profilo se ospite, Esci se loggato).
- [ ] **Endpoint reset password** (`POST /api/auth/forgot-password`, `POST /api/auth/reset-password`) — la tabella `auth_tokens` esiste ma non c'è la logica
- [ ] **Endpoint verifica email** (`POST /api/auth/verify-email`) — usa la stessa tabella `auth_tokens`
- [ ] **UI "Password dimenticata"** nel `AuthModal`
- [ ] **Invio email transazionali** (servizio: SendGrid / Resend / Mailgun) — serve per reset password e verifica email

---

## 2. Profilo ristorante (anagrafica completa)

- [x] Tabella `restaurants` con tutti i campi (anagrafica, contatti, social, indirizzo, coordinate)
- [x] Onboarding iniziale del ristorante (`RestaurantOnboarding.tsx`)
- [ ] **Pagina "Impostazioni ristorante"** nel frontend per modificare anagrafica dopo la registrazione
- [ ] **Endpoint `PUT /api/restaurants/me`** per aggiornare dati ristorante loggato
- [ ] **Upload logo ristorante** (storage immagine + campo `logo_url`)
- [ ] **Gestione campi social** (Instagram, Facebook, sito web) nell'UI

---

## 3. Contatti interni (chef, sommelier, ecc.)

- [x] Tabella `contacts` nello schema DB
- [x] CRUD backend `/api/contacts` (server.ts r.239)
- [ ] **UI gestione contatti** (lista + form aggiungi/modifica/elimina)
- [ ] **Collegamento contatti al menu** (es. "chef responsabile di questo piatto")

---

## 4. Orari di apertura

- [x] Tabella `opening_hours` nello schema DB
- [ ] **Endpoint CRUD `/api/opening-hours`** — manca completamente
- [ ] **UI gestione orari** (griglia settimanale con apertura/chiusura)

---

## 5. ~~Salvataggio file originali~~ (RIMOSSO 20 mag 2026)

> Decisione di Enrico: **non serve salvare i file PDF/DOCX/Excel originali**. Lo scopo della raccolta dati e' avere gli **item strutturati** (piatti, drink, prezzi, abbinamenti) gia' estratti dall'AI e collegati al ristorante. I file di partenza non hanno valore aggiuntivo, basta l'output strutturato + export Excel per la consultazione.

- Strategia dati attuale: `food_items`, `drinks`, `pairings` (con `restaurant_id`) + export Excel via `/api/admin/export.xlsx`.
- Se in futuro servisse il dato grezzo per re-training AI, va riaperta come task a sé.

---

## 6. Menu cibo

- [x] Upload file menu (PDF, DOCX, Excel, immagine) — `MenuUpload.tsx`
- [x] Parser file (mammoth, pdfjs-dist, xlsx) — `src/lib/fileParser.ts`
- [x] OCR via Google Vision per immagini — endpoint `/api/vision/ocr`
- [x] Estrazione AI dei piatti dal menu — proxy Gemini + OpenAI
- [x] Revisione manuale piatti estratti (`MenuReview.tsx`)
- [x] CRUD `/api/food-items` e `/api/food-categories`
- [x] Tabelle `food_categories` e `food_items` con allergeni, flavor_profile, **prezzo (`price_cents`)**, flag veg/vegan/glutenfree
- [ ] **Verificare che il frontend salvi davvero il prezzo** estratto dall'AI nel CRUD (oggi il campo esiste a DB ma va controllato che venga passato dall'estrazione → review → salva)
- [ ] **Forzare l'AI a estrarre il prezzo** nel prompt di estrazione (se manca, marcarlo `null` ma non scartare il piatto)
- [ ] **Editor singolo piatto** (modifica allergeni, profilo aromatico, prezzo dopo l'estrazione AI)
- [ ] **Vista listino prezzi** del ristorante (esportabile)

---

## 7. Carta drink (vini, birre, spirits, cocktail)

- [x] Upload carta drink — stesso flusso `MenuUpload.tsx`
- [x] Estrazione AI dei drink
- [x] CRUD `/api/drinks`
- [x] Tabella `drinks` con campi specifici vino (`wine_color`, `grape_varieties`, `vintage`)
- [x] Tabella `drinks` con **prezzo al calice (`price_glass_cents`)** e **prezzo bottiglia (`price_bottle_cents`)**
- [x] Check constraint: `wine_color` solo se `category='wine'`
- [ ] **Verificare che il frontend salvi entrambi i prezzi** (calice + bottiglia) quando estratti
- [ ] **Forzare l'AI a estrarre gradazione, annata, vitigno, denominazione** se presenti nella carta
- [ ] **Editor singolo drink** (modifica annata, vitigno, abbinamento consigliato)
- [ ] **Filtri visualizzazione drink** (per categoria, prezzo, colore vino)
- [ ] **Vista carta vini completa** del ristorante (esportabile)

---

## 8. Abbinamenti AI (pairing)

- [x] Tabella `pairings` con `score`, `rationale`, `source`, `model`
- [x] Vincolo UNIQUE su `(food_item_id, drink_id)`
- [x] Endpoint proxy AI per generare abbinamenti (`/api/openai/pairings`, `/api/gemini/generate`)
- [x] Componente `PairingResults.tsx` per visualizzare gli abbinamenti
- [x] Export PDF con `jspdf` + `jspdf-autotable`
- [x] **Endpoint `POST /api/pairings/bulk`** — risolve dishName/drinkName → id via lookup nel restaurant scope, INSERT con UNIQUE skip
- [x] **Salvataggio abbinamenti generati** — il frontend in `App.tsx::handleReviewConfirm` salva via fetch dopo la generazione AI (sia per loggati che ospiti)
- [ ] **Caricamento abbinamenti salvati** all'apertura del progetto (step B per utenti loggati: ritrovare le carte)
- [ ] **Modifica/cancellazione abbinamento manuale**
- [ ] **Audit log AI** — la tabella `ai_requests` esiste, va popolata dal proxy con token e costo

---

## 8bis. Tracking dati guest + admin platform (per la strategia dati BIBI)

- [x] Migration 0002: `users.is_platform_admin`, `restaurants.is_guest/guest_email/guest_phone`, `pairings.language` (applicata a Neon, mirrored in schema.sql + schema.ts)
- [x] `POST /api/guest/onboarding` — crea un restaurant `is_guest=true` legato alla sessione Express anonima
- [x] `POST /api/dishes/bulk`, `/api/drinks/bulk`, `/api/pairings/bulk` — endpoint bulk save che funzionano sia per loggati sia per ospiti (helper `requireSession` + `sessionRestaurantId`)
- [x] `GET /api/admin/restaurants`, `/api/admin/restaurants/:slug/full`, `/api/admin/stats` — endpoint protetti da `requireAdmin` (richiede `users.is_platform_admin=TRUE`)
- [x] Script `tsx scripts/grant-admin.ts <email>` — promuove un utente a platform admin
- [x] `db/ADMIN-QUERIES.sql` — query SQL d'esempio per consultazione diretta su Neon
- [x] Frontend: il form di onboarding ospite chiama `/api/guest/onboarding` non bloccante; `handleReviewConfirm` salva dishes+drinks e poi pairings (sia per ospiti che per loggati)

---

## 9. Database

- [x] Schema PostgreSQL completo (`db/schema.sql`)
- [x] Schema Drizzle TypeScript allineato (`db/schema.ts`)
- [x] 11 tabelle previste tutte presenti
- [x] UUID come PK ovunque
- [x] Vincoli `ON DELETE CASCADE` su `restaurant_id` (GDPR-friendly)
- [x] Seed demo funzionante (`db/seed.sql`)
- [x] Database Neon configurato e popolato
- [x] Script utility (`apply-sql.ts`, `verify.ts`, `fix-demo-password.ts`)
- [ ] **Backup automatico Neon** (verificare che sia attivo nel piano Neon)
- [ ] **Test integrità referenziale** dopo eliminazione ristorante (cascade test)
- [ ] **Indici sulle query più frequenti** (es. `food_items(restaurant_id)`, `pairings(restaurant_id, food_item_id)`)

---

## 10. Sicurezza

- [x] Password hashate con bcrypt (rounds configurabili)
- [x] Chiavi API solo lato server (proxy)
- [x] Sessioni HTTPOnly cookie
- [x] **Rate limiting** sugli endpoint auth (10 req / 5 min) e AI proxy (60 req / min) + cap globale 300/min. `express-rate-limit` con `trust proxy=1` per IP corretto dietro Render LB.
- [ ] **CORS configurato correttamente** per il dominio di produzione
- [ ] **CSRF protection** sui form (se mai useremo cookie cross-site)
- [ ] **Validazione input** con `zod` o `valibot` su tutti gli endpoint (oggi è ad hoc)
- [x] **Header di sicurezza** (`helmet` middleware: X-Content-Type-Options, X-Frame-Options DENY, Strict-Transport-Security, ecc.). CSP disabilitata: andra' configurata quando il dominio finale e' fissato (`pairbuilder.ambrosiavino.com`).
- [ ] **Audit chiavi nel repo** — confermare che `.env` non sia mai stato committato (controllare `git log`)
- [ ] **Cookie `Secure` e `SameSite=Lax`** in produzione

---

## 11. Configurazione & Deploy

- [x] File `.env.example` completo
- [x] File `.replit` configurato
- [x] Script `npm run dev` e `npm run build` funzionanti
- [x] Variabile `PORT` dinamica (no hardcoded)
- [x] Repository su GitHub (`enrico1512/pAIrbuilder`)
- [x] Replit collegato al repo per deploy
- [x] **README aggiornato** con istruzioni setup, comandi, deploy, schema DB, API, i18n, sicurezza, licenza.
- [x] **Health check endpoint** `GET /api/health` — liveness leggero, niente DB; usato da Render via `healthCheckPath` in render.yaml.
- [ ] **Variabili d'ambiente di produzione configurate su Replit** (Secrets):
  - `DATABASE_URL`
  - `SESSION_SECRET` (deve essere lungo e casuale)
  - `GEMINI_API_KEY`
  - `OPENAI_API_KEY`
  - `GOOGLE_CLOUD_VISION_API_KEY`
  - `NODE_ENV=production`
- [ ] **Dominio custom** (es. `pairbuilder.bibisrl.com`) collegato a Replit Deployments
- [ ] **HTTPS certificato** (automatico con Replit Deployments)
- [ ] **Test deploy completo end-to-end** su URL pubblico

---

## 12. UX & contenuti pubblici

- [x] Sezione "About" (`AboutSection.tsx`)
- [x] Modalità ospite funzionante
- [ ] **Landing page chiara** con call-to-action "Registra il tuo ristorante"
- [ ] **Pagina pricing / piani** (se previsto)
- [ ] **Pagina contatti / supporto**
- [ ] **Termini di servizio**
- [ ] **Informativa privacy (GDPR)** — obbligatoria, raccogli dati personali
- [ ] **Cookie banner** se usi cookie non strettamente necessari
- [ ] **Favicon e meta tag SEO** (`<title>`, `<meta description>`, OpenGraph)

---

## 13. Monitoring & osservabilità

- [ ] **Logging strutturato** (oggi è solo `console.log` con prefisso)
- [ ] **Error tracking** (Sentry / LogRocket / simile)
- [ ] **Analytics** (Plausible / Umami / Google Analytics)
- [ ] **Monitor uptime** (UptimeRobot / Better Stack)
- [ ] **Dashboard costi AI** (track del campo `cost` in `ai_requests`)

---

## 14. Test prima del go-live (smoke test)

- [ ] Registra un nuovo ristorante dal sito di produzione
- [ ] Conferma email (quando attiveremo la verifica)
- [ ] Login e logout
- [ ] Upload menu PDF di esempio → **verifica che il file resti scaricabile dallo storico documenti**
- [ ] Estrazione AI dei piatti → **verifica che i prezzi vengano salvati a DB**
- [ ] Upload carta vini → **verifica che il file resti scaricabile**
- [ ] Estrazione drink → **verifica prezzo calice + bottiglia salvati**
- [ ] Generazione abbinamenti
- [ ] Export PDF degli abbinamenti
- [ ] Modifica profilo ristorante
- [ ] Logout, login con utente diverso, verifica che NON veda i dati dell'altro ristorante (test isolamento multi-tenant)
- [ ] Reset password
- [ ] Cancellazione account (verifica CASCADE)

---

## Priorità suggerite per il go-live

**🔴 Bloccanti (senza queste non si va online):**
- ~~Verifica salvataggio prezzi (piatti + drink) end-to-end~~ ✅
- ~~Esporre il popup login nel frontend~~ ✅
- ~~CRUD `/api/pairings` + salvataggio abbinamenti~~ ✅ (via bulk endpoints)
- ~~README aggiornato~~ ✅
- Informativa privacy + termini (raccogliamo dati, è obbligatoria sul serio)
- Variabili d'ambiente di produzione su Render (in particolare `APP_URL` al momento della migrazione dominio)
- Test deploy end-to-end con caricamento menu reale

**🟡 Importanti (da fare subito dopo):**
- **Migrazione dominio a `pairbuilder.ambrosiavino.com`**: quando il record CNAME punta a Render e il dominio custom e' verificato, aggiornare nella dashboard Render → Environment la variabile `APP_URL` da `https://pairbuilder.onrender.com` a `https://pairbuilder.ambrosiavino.com`. Eventuale CSP futura andra' configurata con quel dominio.
- Reset password (endpoint + UI)
- Pagina impostazioni ristorante
- CRUD `/api/opening-hours`
- Rate limiting + helmet
- Health check endpoint
- Audit log AI requests popolato (tabella `ai_requests` con token + costo)

**🟢 Migliorabili (post-lancio):**
- Verifica email
- Logo ristorante
- Editor singolo piatto/drink
- Monitoring & analytics
- Dominio custom

---

## 📌 Lavori in corso (sessione del 20 maggio sera, da riprendere)

**Test di estrazione AI in corso su PDF Garzadori** (`test-files/menu.pdf` 33 piatti + `test-files/drinks.pdf` 216 referenze di cui ~109 vini secondo ChatGPT).

### Fix di codice già fatti (working tree, NON committati)

| File | Modifica |
|---|---|
| `.gitignore` | esclude `.claude/` e `test-files/` |
| `server.ts` | flag `DEBUG_AI`, helper `aiLog`, alias `/export`, helper `openaiFetchWithRetry`, gestione 429 daily-vs-minute su Gemini, 2 nuovi endpoint `/api/anthropic/menu-scan` e `/api/anthropic/menu-extract`, `max_tokens: 16384` su menu-scan OpenAI |
| `server/i18n.ts` | prompt OpenAI vincola lingua source (regola "NEVER translate") |
| `src/lib/gemini.ts` | helper `chooseImagesForAi` (no immagini se testo PDF ≥ 1500 char, cap a 12), rimosso filtro `isWineCategory` premature, fallback chain Gemini→OpenAI→Anthropic nei callOpenAI* |
| `.env.example` | doc su `ANTHROPIC_API_KEY` |
| `.env` | DEBUG_AI=1 + chiave Anthropic (locale, mai committata). **Da ruotare**: la chiave attuale è stata incollata in chat. |
| `package.json` | nuova dep `@anthropic-ai/sdk` |

### Commit locale già pronto (NON pushato, in attesa di GitHub Desktop)

```
14a7f0f feat(admin): alias breve /export per il download Excel
```

### Risultati test progressivi

| Test | Drink trovati (scan) | Vini estratti (review) | Tempo |
|---|---|---|---|
| 1 — baseline | 129 | 11 | ~5 min |
| 2 — dopo retry/no-translate/no-images | 129 | 11 (fix UI filtro applicato dopo) | lento |
| 3 — `max_tokens: 16384` | **153** | **56** | in corso |
| 4 — con Anthropic fallback (chain a 3) | **da testare** | atteso ~109 (numero ChatGPT) | da misurare |

### Prossimi step (in ordine)

1. **Riavvio dev server** con tutte le modifiche attive + chiave Anthropic
2. **Test 4**: hard refresh browser, rifare upload, contare vini in review
3. Se ~109 vini → la chain a 3 funziona, si procede col **caching PDF**
4. **Caching PDF→risultato AI** (~45 min): nuova tabella `ai_extractions_cache` (SHA-256 PK, JSONB result, hit_count). Frontend calcola hash file, GET cache prima dell'estrazione, POST cache dopo. Coerente col modello freemium (1° upload free, dal 2° serve account paid).
5. Eventuale **refactoring AI gateway** (OpenRouter come unico provider) per semplificare la gestione delle chiavi/fatture
6. **Sblocco API limits prima del go-live**: Gemini Pay-as-you-go + OpenAI Tier 2+ (vedi memoria `pairbuilder_api_limits.md`)
7. Ruotare la chiave Anthropic in `.env`

---

*Ultimo aggiornamento: 20 maggio 2026 sera*
