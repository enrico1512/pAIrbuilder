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
- [ ] **Esporre il popup login nel frontend** (oggi è solo backend + componente, non viene mostrato all'utente che entra in modalità ospite)
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

## 5. 📥 Salvataggio documenti caricati (CRITICO per la strategia dati)

> Oggi i file vengono caricati, parsati e l'AI estrae i piatti/drink — ma **i file originali non vengono mai salvati a database**. Senza questo perdiamo il dato grezzo più prezioso (utile per riaddestramento AI, audit, e ricostruzione futura se cambiamo parser).

- [ ] **Nuova tabella `uploaded_documents`** nello schema DB con: `id`, `restaurant_id` (CASCADE), `document_type` (`menu_food`|`drink_card`), `original_filename`, `mime_type`, `file_size_bytes`, `storage_url` (o `file_bytea` se vogliamo tenere tutto su DB), `raw_extracted_text`, `ai_extraction_metadata` (jsonb), `extracted_items_count`, `uploaded_at`, `uploaded_by_user_id`
- [ ] **Scelta storage per i file**: opzioni — (a) Supabase Storage gratuito fino a 1GB, (b) Cloudflare R2 (10GB gratis), (c) bytea direttamente su Postgres Neon (semplice ma costoso oltre certi volumi), (d) Replit Object Storage
- [ ] **Endpoint `POST /api/uploads/menu`** — riceve il file con `multer`, lo salva nello storage scelto, scrive record in `uploaded_documents`, restituisce `document_id`
- [ ] **Endpoint `POST /api/uploads/drink-card`** — idem per carta drink
- [ ] **Endpoint `GET /api/uploads`** — elenca i documenti del ristorante loggato (storico upload)
- [ ] **Endpoint `GET /api/uploads/:id/download`** — scarica il file originale
- [ ] **Collegare il flusso MenuUpload al salvataggio** — oggi parsa in memoria, deve prima salvare e poi parsare partendo dal file salvato
- [ ] **Salvare il testo grezzo estratto** (output OCR/parser) nel campo `raw_extracted_text`
- [ ] **Salvare metadata estrazione AI** (modello usato, token consumati, durata, prompt) nel jsonb `ai_extraction_metadata`
- [ ] **Pagina "Documenti del ristorante"** nel frontend — lista con anteprima, data caricamento, numero piatti/drink estratti, link download

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
- [ ] **CRUD `/api/pairings`** — manca completamente (oggi gli abbinamenti vengono generati ma NON vengono salvati a DB)
- [ ] **Salvataggio abbinamenti generati** (collegare la generazione AI al CRUD)
- [ ] **Caricamento abbinamenti salvati** all'apertura del progetto
- [ ] **Modifica/cancellazione abbinamento manuale**
- [ ] **Audit log AI** — la tabella `ai_requests` esiste, va popolata dal proxy con token e costo

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
- [ ] **Rate limiting** sugli endpoint auth e AI proxy (libreria `express-rate-limit`)
- [ ] **CORS configurato correttamente** per il dominio di produzione
- [ ] **CSRF protection** sui form (se mai useremo cookie cross-site)
- [ ] **Validazione input** con `zod` o `valibot` su tutti gli endpoint (oggi è ad hoc)
- [ ] **Header di sicurezza** (`helmet` middleware: CSP, X-Frame-Options, ecc.)
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
- [ ] **README aggiornato** con istruzioni setup, comandi, deploy (oggi è di 3 righe)
- [ ] **Health check endpoint** `GET /api/health` (utile per monitor uptime)
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
- **Tabella `uploaded_documents` + storage + endpoint upload** (senza questo perdiamo il dato grezzo, è il cuore della strategia)
- **Verifica salvataggio prezzi** (piatti + drink) end-to-end dall'AI al DB
- Esporre il popup login nel frontend
- CRUD `/api/pairings` + salvataggio abbinamenti
- Informativa privacy + termini (raccogliamo dati, è obbligatoria sul serio)
- README aggiornato
- Variabili d'ambiente di produzione su Replit
- Test deploy end-to-end

**🟡 Importanti (da fare subito dopo):**
- Pagina "Documenti del ristorante" (storico upload visibile all'utente)
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

*Ultimo aggiornamento: 19 maggio 2026*
