# pAIrbuilder — Piano implementazione multilingua (IT / EN / FR)

> Documento di pianificazione redatto da Claude (CTO virtuale) il 2026-05-19, su richiesta di Enrico, dopo analisi diretta del codice. Scenario scelto: **Scenario A** — i menu dei ristoranti restano nella lingua originale; viene tradotta solo l'interfaccia della piattaforma.

---

## ✅ STATO AVANZAMENTO

**Aggiornamento del 19 maggio 2026 — sera**

I 3 prerequisiti tecnici sono **stati completati**:

- ✅ **PRE-3** — Creato `.gitattributes` con `eol=lf`, configurato `core.autocrlf=input`. Resta solo il commit (da fare manualmente da PowerShell — sandbox non ha permessi di scrittura su `.git/index.lock`).
- ✅ **PRE-1** — Embedded font **Liberation Sans** (clone Helvetica con Unicode pieno) tramite `src/lib/pdfFonts.ts` + `public/fonts/*.b64`. Aggiornato `src/components/PairingResults.tsx` per usarlo. Disattivata `cleanAccents` in `gemini.ts` (è ora una identity function pass-through). Aggiornati i prompt Gemini in `gemini.ts` e il prompt OpenAI in `server.ts` per chiedere accenti corretti invece di apostrofi.
- ✅ **PRE-2** — Creato `src/lib/categoryMap.ts` con `normalizeDrinkCategory()` che mappa varianti IT/EN/FR all'enum `drinkCategory` del DB. Esporta anche `isWine()` come sostituto lingua-agnostico di `isWineCategory` di gemini.ts.
- ✅ **Bonus** — Documento `TRADUZIONI-FRASI-DIONISO.md` con le 20 fun phrases tradotte in EN e FR, pronto per essere revisionato e poi integrato nei file JSON i18n.

**Lint TypeScript residuo**: 1 errore pre-esistente in `server.ts:162` su `registerCrud(table: any)` — typing Drizzle, non bloccante a runtime, da sistemare in un cleanup separato di tech-debt.

**Prossimi passi richiesti a Enrico**:
1. Aprire PowerShell nel repo ed eseguire i comandi git riportati in fondo a questo documento (commit baseline + push)
2. Revisionare `TRADUZIONI-FRASI-DIONISO.md` ed eventualmente correggere le frasi che non convincono
3. Quando dai l'OK, partiamo con la Fase 1 dell'i18n vero e proprio

---

## 1. Sintesi in due righe

L'i18n è fattibile in **3–4 giorni di lavoro effettivo** distribuiti su una settimana. **Ma non è la prima cosa da fare adesso**: vanno risolti tre prerequisiti tecnici (1–2 giorni) che renderanno l'i18n molto più semplice e che vanno fatti comunque. Dopo, partire con il multilingua diventa lineare.

---

## 2. Stato di fatto (analisi del codice esistente)

### 2.1 Dimensioni reali del problema

- **Frontend totale**: ~3.800 righe di TSX/TS sotto `src/`
- **6 file** contengono testo italiano hardcoded da estrarre:
  - `src/App.tsx` (792 righe) — il più carico: welcome, frasi divertenti durante l'estrazione, dropdown menu, messaggi di errore, footer
  - `src/components/AboutSection.tsx` (349 righe) — pagine "Chi siamo", "Come funziona", "Contatti" molto ricche di prosa
  - `src/components/MenuReview.tsx` (665 righe) — pagina di revisione/conferma estrazioni
  - `src/components/MenuUpload.tsx` (319 righe) — pagina caricamento file
  - `src/components/PairingResults.tsx` (342 righe) — risultati + export PDF
  - `src/components/RestaurantOnboarding.tsx` (161 righe) — form dati ristorante
- **Stima stringhe da tradurre**: circa **250–350 voci uniche** (incluse le ~20 "fun phrases" che Dioniso pronuncia durante l'estrazione)

### 2.2 Buona sorpresa: l'AI è già parametrizzata sulla lingua

Leggendo `src/lib/gemini.ts` (riga 764 in poi) ho trovato che `generatePairings()` accetta già un parametro `userContext` con lingua e simbolo valuta, costruito in `App.tsx:101-105` da `navigator.language`. Il prompt che va a Gemini contiene già:

```
User Language: ${lang}
Currency Symbol: ${currency}
...
Language: Force ALL descriptions into the user's language (${lang}).
NEVER use English unless the system language is English.
```

**Cosa significa**: l'AI sa già generare i pairing in francese o inglese se il browser è impostato così. Non bisogna rifare la logica di parametrizzazione, solo collegarla al selettore di lingua manuale.

### 2.3 Sorpresa cattiva: la funzione `cleanAccents` è un bug bloccante per il francese

In `src/lib/gemini.ts:60-73` c'è una funzione che **rimuove tutti gli accenti** dal testo generato dall'AI sostituendoli con apostrofi:

- `"élégance"` → `"e'le'gance"`
- `"château"` → `"cha'teau"`
- `"perché"` → `"perche'"`
- `"città"` → `"citta'"`

Lo stesso accade nel prompt OpenAI (`server.ts:513`): viene esplicitamente chiesto all'AI di usare l'apostrofo invece degli accenti. Questo workaround serve perché **jspdf con font Helvetica non renderizza i caratteri Unicode estesi nei PDF**.

Per il francese — lingua piena di accenti e di parole vinicole tecniche (`cépage`, `vinifié`, `élevé en fût`) — questo è **inaccettabile**. Per l'inglese e l'italiano "moderno" sarebbe anche da rivedere a prescindere.

**È un debito tecnico esistente che il multilingua porta in superficie**, e va risolto.

### 2.4 Mismatch già presente nel database

Lo schema Drizzle (`db/schema.ts:37-39`) definisce le categorie drink in inglese come enum:

```
drinkCategory = ['wine', 'beer', 'spirit', 'cocktail', 'soft', 'water', 'hot']
```

Ma l'AI restituisce categorie in italiano ("Vino Rosso", "Bollicine", "Vino Bianco") che vengono memorizzate come stringhe nel campo `drinks.category` del frontend (un type union TypeScript) — **non passano dall'enum del DB perché ancora non c'è una pipeline di salvataggio dei drink estratti**. Quando quella pipeline verrà implementata, ci sarà un problema di mapping IT→enum-EN. Il multilingua amplifica la cosa: in francese l'AI proverà a scrivere "Vin Rouge", "Bulles", e nessuno di questi corrisponde all'enum.

**Va creata una tabella di mapping** o una funzione di normalizzazione categorie → enum, indipendente dalla lingua dell'AI. Va fatto comunque, il multilingua è solo un acceleratore.

### 2.5 PDF: titolo hardcoded + font con limiti

In `src/components/PairingResults.tsx:61` il titolo del PDF è scritto in italiano:

```ts
doc.text("Menu abbinamenti consigliati", pageWidth / 2, cursorY, ...)
```

E usa `helvetica` come font, che non supporta correttamente tutti gli accenti. Per i PDF multilingua serve embeddare un font Unicode (DejaVu Sans, Inter, Lato) — operazione standard ma da fare una volta sola.

### 2.6 Backend: messaggi di errore in italiano

In `server.ts` ho contato 11 messaggi di errore italiani esposti via API: "Non autenticato", "Credenziali errate", "Mancano campi: ...", "Email già registrata", "Errore lettura/inserimento/aggiornamento/eliminazione", "Registrazione fallita", "Login fallito", "Non trovato", "Utente non trovato", "email e password richiesti".

Sono pochi e ripetitivi — un piccolo helper `i18nError(req, key)` risolve tutto.

### 2.7 Prompt OpenAI (server.ts) hardcoded italiani

Cinque prompt nel server hanno testo italiano forzato:

- `/api/openai/extract` — "Sei un esperto sommelier..."
- `/api/openai/list-items` — "Sei un assistente AI..."
- `/api/openai/menu-scan` — "Sei un esperto di menu di ristoranti italiani..."
- `/api/openai/menu-extract` — "Sei un esperto di menu di ristoranti..."
- `/api/openai/pairings` — "Sei un sommelier professionista italiano..."

Questi vanno parametrizzati come già fatto per Gemini.

### 2.8 Stato repo

Il `git status` mostra 25+ file "modificati" ma è un **falso positivo da fine-riga CRLF/LF** (Windows ↔ Unix). Non c'è lavoro reale in sospeso, si risolve con `git config core.autocrlf input` e `git checkout .`. **Non blocca nulla.**

Nessun branch di feature aperto. Solo `main`. Pulito.

### 2.9 Login UI non ancora esposta

Da CLAUDE.md: "sistema di login presente lato backend ma non ancora esposto nel frontend (verrà attivato con un popup opzionale)". Quando il popup di login sarà costruito introdurrà ~20–30 nuove stringhe (form labels, validation errors, "Password dimenticata?", ecc.).

---

## 3. Prerequisiti tecnici prima del multilingua

Sono tre lavori che vanno fatti **comunque**, e che se fatti prima rendono il multilingua banale. Se fatti dopo, il multilingua va riaperto due volte.

### 3.1 [PRE-1] Risolvere il problema PDF/font Unicode — ~½ giornata

Sostituire `helvetica` con un font Unicode embeddato (consiglio: DejaVu Sans, ~200KB, gratis e libero).

File da toccare: `src/components/PairingResults.tsx`.

Effetto collaterale positivo: si può **rimuovere tutta la logica `cleanAccents`** da `gemini.ts` e dai prompt OpenAI. Il testo dell'AI tornerà a essere pulito (con gli accenti veri), il database conterrà UTF-8 corretto, e i PDF saranno più professionali.

### 3.2 [PRE-2] Normalizzazione categorie drink lingua-agnostica — ~½ giornata

Creare `src/lib/categoryMap.ts` con una funzione `normalizeDrinkCategory(rawFromAI: string): DrinkCategoryEnum` che mappa tutte le varianti linguistiche al singolo enum DB:

- "Vino Rosso" / "Red Wine" / "Vin Rouge" → `wine` + wineColor `red`
- "Bollicine" / "Sparkling" / "Bulles" → `wine` + wineColor `sparkling`
- "Birra" / "Beer" / "Bière" → `beer`
- ecc.

### 3.3 [PRE-3] Fix line-ending repo + commit baseline — ~1 ora

```bash
git config core.autocrlf input
git rm -r --cached .
git reset --hard
git add CLAUDE.md COMANDI-CODE.md WORKFLOW.md
git commit -m "docs: aggiunge file workflow Cowork"
git push origin main
```

Così partiamo per l'i18n da una base pulita.

---

## 4. Piano i18n in 6 fasi

### Fase 1 — Setup infrastruttura (½ giornata)

Installazione librerie:

```bash
npm install i18next react-i18next i18next-browser-languagedetector
```

Creazione struttura:

```
src/
└── i18n/
    ├── index.ts              # configurazione i18next
    ├── locales/
    │   ├── it.json
    │   ├── en.json
    │   └── fr.json
    └── languageMap.ts        # mapping BCP-47 ↔ AI codes
```

`src/main.tsx` viene modificato per importare i18n prima del render. Niente altro tocca il resto del codice.

### Fase 2 — Estrazione stringhe (1,5 giornate)

Lavoro file per file, in quest'ordine (dal più semplice al più complesso, così si vede subito l'effetto):

1. `RestaurantOnboarding.tsx` (~20 stringhe, 1h)
2. `MenuUpload.tsx` (~30 stringhe, 1h)
3. `MenuReview.tsx` (~60 stringhe, 2h)
4. `PairingResults.tsx` (~50 stringhe + etichette PDF, 2h)
5. `App.tsx` (~80 stringhe incl. fun phrases, 3h)
6. `AboutSection.tsx` (~100 stringhe testo lungo, 2h)

Per ogni file: sostituzione di `"testo italiano"` con `t('namespace.key')`, popolamento dei tre JSON. Convenzione namespace: `onboarding.title`, `upload.button.next`, `pairing.matchType.contrast`, ecc.

Le **20 fun phrases di Dioniso** sono il pezzo più creativo da tradurre — vanno fatte da te o da chi ha sensibilità linguistica, non lasciate a Claude. In francese si possono sostituire con frasi che usino "Dionysos" e riferimenti enogastronomici francofoni (Bordeaux, Provence, sommellerie).

### Fase 3 — Selettore lingua + persistenza (½ giornata)

Componente `<LanguageSwitcher />` nell'header (vicino al dropdown utente già esistente in `App.tsx:447`). Bandierine 🇮🇹 🇬🇧 🇫🇷 oppure codici "IT/EN/FR" testuali (preferisco i codici, più sobri).

Persistenza:
- Logica: se l'utente è loggato → salva in `users.preferred_language` (DB); se ospite → salva in `localStorage`
- Detection iniziale: `i18next-browser-languagedetector` legge `navigator.language`

### Fase 4 — Backend i18n (½ giornata)

Modifiche a `server.ts`:

- Helper `getLang(req)` che legge `req.session.preferredLanguage || req.headers['accept-language']`
- Dictionary in `server/i18n.ts` con messaggi di errore tradotti
- Tutti i `res.status(...).json({ error: '...' })` diventano `res.status(...).json({ error: t(getLang(req), 'errors.notAuth') })`
- Stessa cosa per i 5 prompt OpenAI: il system prompt diventa funzione `buildSystemPrompt(lang, role)` che prende lingua

### Fase 5 — Migration DB (½ giornata)

Aggiungere campi:

```ts
// db/schema.ts — modifiche
users: {
  ...
  preferredLanguage: char('preferred_language', { length: 2 }).default('it'),
}

restaurants: {
  ...
  defaultLanguage: char('default_language', { length: 2 }).default('it'),
}
```

Generare migration con `drizzle-kit generate`, applicarla con `drizzle-kit push`.

Per gli ospiti (non loggati) si usa `localStorage`, niente DB.

### Fase 6 — Testing + revisione traduzioni (1 giornata)

- Smoke test manuale sui tre flussi (IT/EN/FR) end-to-end
- Test PDF: generare uno con caratteri accentati francesi (`château`, `élevé`) e verificare resa
- Review traduzioni: idealmente una persona madrelingua per EN e FR rilegge i JSON. Se non disponibile, almeno una passata con un correttore automatico
- Test che il selettore lingua aggiorni anche i pairing AI già generati (devono essere rigenerati o etichettati con la lingua di generazione)

---

## 5. File da toccare — checklist completa

| File | Cosa fare | Tempo |
|---|---|---|
| `package.json` | Aggiungere 3 dipendenze i18n | 1 min |
| `src/i18n/index.ts` (nuovo) | Configurazione i18next | 15 min |
| `src/i18n/locales/it.json` (nuovo) | Tutte le stringhe italiane | 1,5h |
| `src/i18n/locales/en.json` (nuovo) | Traduzione inglese | 2h |
| `src/i18n/locales/fr.json` (nuovo) | Traduzione francese | 2,5h |
| `src/main.tsx` | Import i18n | 5 min |
| `src/components/LanguageSwitcher.tsx` (nuovo) | Selettore lingua | 30 min |
| `src/App.tsx` | Sostituire stringhe + integrare selettore | 3h |
| `src/components/AboutSection.tsx` | Sostituire stringhe | 2h |
| `src/components/MenuReview.tsx` | Sostituire stringhe | 2h |
| `src/components/MenuUpload.tsx` | Sostituire stringhe | 1h |
| `src/components/PairingResults.tsx` | Stringhe + PDF labels + font | 2,5h |
| `src/components/RestaurantOnboarding.tsx` | Sostituire stringhe | 1h |
| `src/lib/gemini.ts` | Rimuovere `cleanAccents`, parametrizzare prompt | 1h |
| `server.ts` | Helper i18n + traduzione errori + prompt OpenAI | 2h |
| `server/i18n.ts` (nuovo) | Dizionario errori backend | 30 min |
| `db/schema.ts` | Aggiungere `preferred_language` e `default_language` | 15 min |
| `db/schema.sql` | Stessa modifica in SQL | 15 min |
| Migration drizzle | Generata da CLI | 5 min |

**Totale**: ~22 ore di lavoro effettivo = **3 giornate piene**, da spalmare su una settimana per dare margine a test e revisioni traduzioni.

---

## 6. Quando farlo — la mia raccomandazione

### Sequenza consigliata

```
SETTIMANA 1 (PREREQUISITI):
├── Giorno 1 mattina:  [PRE-3] Fix line-ending + commit baseline
├── Giorno 1 pomeriggio: [PRE-1] Font Unicode PDF + rimozione cleanAccents
├── Giorno 2 mattina:  [PRE-2] Normalizzazione categorie drink
└── Giorno 2 pomeriggio: Test che tutto funzioni come prima (regressione)

SETTIMANA 2 (I18N CORE):
├── Giorno 1: Fase 1 + Fase 2 (parziale: 3 componenti)
├── Giorno 2: Fase 2 (resto) + Fase 3
├── Giorno 3: Fase 4 + Fase 5
└── Giorno 4 (mezza): Fase 6 — test e revisione

SETTIMANA 3:
└── Revisione madrelingua EN/FR + correzioni
```

### Perché farlo *adesso* e non dopo

1. **Il codice è ancora gestibile** (~3.800 righe). A 8.000 righe il costo raddoppia.
2. **Il login frontend deve ancora essere costruito** — se l'i18n c'è già, il login nascerà bilingua dal primo giorno. Se aspettiamo, va tradotto un'altra volta.
3. **Il marketing del sito sta per partire** secondo CLAUDE.md ("In sviluppo attivo"): partire monolingua e poi cambiare confonde gli early user e impatta SEO.
4. **Le frasi di Dioniso sono divertenti e specifiche** — vanno scritte con cura. Adesso che sono 20, è gestibile; se diventano 60 è un lavoro creativo dispendioso.

### Perché NON farlo prima dei prerequisiti

- Senza il fix PDF/font, il francese in PDF sarà illeggibile (apostrofi al posto degli accenti = sembra rotto)
- Senza la normalizzazione categorie, ogni nuova lingua AI aggiunge ambiguità al DB
- Il problema delle fini-riga rallenterebbe ogni commit della migrazione

---

## 7. Rischi e mitigazioni

| Rischio | Probabilità | Impatto | Mitigazione |
|---|---|---|---|
| Traduzioni FR/EN imprecise senza madrelingua | Alta | Medio | Revisione con strumento + chiedere a un conoscente sommelier francese/inglese di leggere il file `fr.json` |
| Regressioni durante l'estrazione stringhe | Media | Medio | Procedere file per file, testando ogni step su `localhost:3000` prima di passare al successivo |
| Tempi sottostimati per la prosa di `AboutSection` | Media | Basso | È testo marketing, può essere rivisto post-launch |
| Pairing già salvati nel DB in italiano restano italiani | Alta | Basso | Aggiungere campo `pairings.language` per tracciare la lingua di generazione, eventualmente rigenerare on-demand |
| Replit Agent in parallelo che diverge | Bassa | Alto | Regola operativa di CLAUDE.md già rispettata: un solo strumento alla volta tocca il codice |

---

## 8. Cose esplicitamente *fuori scope* (per ora)

- **Traduzione automatica AI dei menu** (Scenario B di pianificazione) — confermato: si rimanda
- **URL routing per lingua** (`/it/`, `/en/`, `/fr/`) — non serve, il sito non ha SEO multilingua attiva
- **Email transazionali tradotte** (registrazione, reset password) — solo quando saranno effettivamente implementate, oggi non ci sono ancora
- **Localizzazione date/numeri/valute** — già pronta via `navigator.language` e `Intl.NumberFormat`, andrà collegata al selettore
- **Lingue oltre IT/EN/FR** — non aggiungiamo spagnolo/tedesco ora, ma l'infrastruttura li accoglierà con un solo file JSON in più

---

## 9. Prossima azione che ti chiedo

Per partire, mi servono **due decisioni** da te:

1. **Procediamo nell'ordine raccomandato** (prima i 3 prerequisiti, poi i18n) oppure **partiamo subito dall'i18n** accettando di buttare giù un PDF con apostrofi anche in francese per le prime settimane?
2. **Le 20 fun phrases di Dioniso** in inglese e francese le scrivi tu (qualche ora di lavoro creativo) oppure faccio una prima bozza io da farti rivedere?

Quando rispondi, apro un secondo documento `IMPLEMENTAZIONE-MULTILINGUA.md` con le specifiche tecniche granulari (prompt esatti, esempi di JSON, snippet di codice) e iniziamo dalla prima task.

---

## 10. Comandi git da eseguire da PowerShell

Apri PowerShell nella cartella del progetto e copia-incolla questi comandi uno alla volta:

```powershell
cd C:\Users\ENRICO\Documents\Claude\Projects\Pairbuilder

# Configurazione una-tantum per gestire correttamente i fine-riga
git config core.autocrlf input

# Verifica stato prima del commit
git status

# Aggiunge tutti i file nuovi e modificati
git add .gitattributes
git add CLAUDE.md COMANDI-CODE.md WORKFLOW.md
git add PIANO-MULTILINGUA.md TRADUZIONI-FRASI-DIONISO.md
git add src/lib/pdfFonts.ts src/lib/categoryMap.ts
git add public/fonts/
git add src/lib/gemini.ts src/components/PairingResults.tsx server.ts

# Commit con messaggio descrittivo
git commit -m "feat: prerequisiti multilingua - font Unicode PDF, categoryMap, gitattributes"

# Push su GitHub (poi su Replit fai git pull origin main)
git push origin main
```

Se vedi errori in `git status` su file che NON sono in elenco sopra (es. `index.html`, `tsconfig.json`, ecc.), sono solo cambi di fine-riga generati dall'attivazione di `.gitattributes`. Aggiungili pure con `git add .` prima del commit — entreranno nel commit di normalizzazione una volta sola e poi non li vedrai mai più.

---

*Documento generato il 19 maggio 2026 — Claude (CTO virtuale di pAIrbuilder)*
