# DESIGN-AUDIT — pAIrbuilder

> Snapshot del "design system" di fatto già presente nel codice al **26 maggio 2026**.
> Documento prodotto in sola lettura: nessun file del progetto è stato modificato per generarlo.
> Stack rilevato: **React 19 + Vite 6 + Tailwind CSS 4** (con tema definito in CSS tramite `@theme`, non `tailwind.config.js`).

---

## 1. Colori

### 1.1 Palette di brand (sorgente di verità)

Tutto il tema è centralizzato in **`src/index.css`** dentro il blocco `@theme` di Tailwind 4. Non esiste un `tailwind.config.js` con la palette: chi cerca i colori deve guardare qui.

| Token Tailwind | Valore HEX | Uso |
|---|---|---|
| `brand-bg` | `#4628b7` | Viola profondo, sfondo principale dell'app (`bg-brand-bg`). Definito su `body` in `@layer base`. |
| `brand-bg-dark` | `#3e229a` | Variante più scura, usata SOLO per il footer (`bg-brand-bg-dark` in `App.tsx` riga 977). |
| `brand-accent` | `#f8bcb4` | Rosa salmone, colore accento per titoli, bottoni primari, CTA, link, badge. Definito come colore di default per `h1…h6` in `@layer base`. |

Definizione canonica (`src/index.css`, righe 4-10):

```css
@theme {
  --font-sans: "Inter", ui-sans-serif, system-ui, sans-serif;
  --font-display: "Vina Sans", cursive;
  --color-brand-bg: #4628b7;
  --color-brand-bg-dark: #3e229a;
  --color-brand-accent: #f8bcb4;
}
```

### 1.2 Bianco / nero con opacità (sistema di "tinte")

Il progetto non definisce grigi custom: usa il bianco con alpha (sintassi Tailwind `white/N`) come "scala di grigi" sopra lo sfondo viola. Ricorrono — con questa frequenza — gli stessi step ovunque:

| Classe | Significato dichiarato in codice |
|---|---|
| `text-white` | Testo "pieno" (titoli, corpo principale) |
| `text-white/80` | Testo "secondario forte" (sottotitoli, body lungo) |
| `text-white/70` / `/60` | Caption, descrizioni, label sottomenù |
| `text-white/50` / `/40` | Nav-link a riposo, hint, footer copyright |
| `text-white/30` / `opacity-30` | Placeholder input, label di servizio |
| `bg-white/5` | Sfondo "card" della glass-panel, sfondo input, item secondari |
| `bg-white/10` | Hover di card / pillole, riempimento progress bar |
| `border-white/10` | Bordo standard di card, modali, header, footer |
| `border-white/5` / `/20` | Bordo soft / drag-area inattiva |

### 1.3 Colori semantici (di stato)

Non esistono token semantici dedicati: si usano i colori standard di Tailwind. Tutti i punti in cui compaiono:

| Stato | Classi usate | Dove |
|---|---|---|
| Successo / "engine ON" | `bg-green-400`, `text-green-500` | Footer pallino "AI Engine" (App.tsx 980, 986-990) |
| Errore / distruzione | `text-red-300`, `text-red-400`, `bg-red-500/10`, `border-red-500/30` | Banner errori auth, hover delete file, `VerifyEmailPage` failure |
| Highlight pairing "contrast" | `border-pink-400/70`, `rgba(244,114,182,0.4)` | `PairingResults.tsx` 333, 367 — usato per evidenziare match di contrasto |
| Hover "WhatsApp" | `hover:text-green-500` | Solo in `AboutSection.tsx` 318 |

### 1.4 Colori in valore "letterale" (fuori dal tema)

Alcuni RGBA/HEX sono hard-codati. Vanno annotati perché non sono governati dal tema e quindi non si aggiornano se cambia la palette:

| Valore | File:riga | Funzione |
|---|---|---|
| `rgba(74,222,128,0.5)` | `App.tsx:980` | Alone verde sotto il pallino "engine" del footer |
| `rgba(248,188,180,0.5)` | `MenuReview.tsx:264` | Alone rosa (stesso colore di `brand-accent`) sui pallini di review |
| `rgba(244,114,182,0.4)` | `PairingResults.tsx:333,367` | Bordo "match contrasto" |
| `rgba(180,90,255,0.1)` | `MenuUpload.tsx:123,223` | Shadow interno della drag-area attiva (NB: viola RGB, non corrisponde a nessun token del tema) |
| `#d2a86b` (ocra) + tuple `[210,168,107]`, `[220,220,220]`, `[40,40,40]`, `[90,90,90]` | `PairingResults.tsx:91-100` | **Palette separata per l'export PDF** (jsPDF). Il commento nel codice dice "brand-accent ocra dell'app", ma in realtà NON corrisponde al `--color-brand-accent` web (`#f8bcb4`). È una palette PDF a sé stante e va trattata come tale. |

### 1.5 Decorazioni / effetti

- **Glassmorphism**: classe utility `.glass-panel` definita in `src/index.css` riga 21-23 → `bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl`. Usata ovunque per card, dropdown e modali.
- **Selezione testo**: override globale in `App.tsx` riga 620 → `selection:bg-brand-accent selection:text-brand-bg`.
- **Header sticky**: `bg-brand-bg/80 backdrop-blur-sm` (App.tsx 622).

---

## 2. Tipografia

### 2.1 Font family

Due font caricati via Google Fonts in testa a `src/index.css` (riga 1):

```css
@import url('https://fonts.googleapis.com/css2?family=Vina+Sans&family=Inter:wght@400;500;600&display=swap');
```

| Token | Famiglia | Uso |
|---|---|---|
| `font-sans` (default) | **Inter** (pesi 400, 500, 600) — fallback `ui-sans-serif, system-ui, sans-serif` | Body, paragrafi, input, micro-copy. Applicato a `body` in `@layer base`. |
| `font-display` | **Vina Sans** — fallback `cursive` | Tutti gli H1…H6 (applicato automaticamente in `@layer base`), bottoni primari (`.btn-primary`), tagline footer, numeri contatori. |

Vina Sans è una display "condensed-tall" maiuscola: ovunque venga usata, è accompagnata da `uppercase tracking-tight font-normal`.

### 2.2 Stile globale dei titoli

Definito una sola volta in `src/index.css` righe 16-18:

```css
h1, h2, h3, h4, h5, h6 {
  @apply font-display text-brand-accent uppercase tracking-tight font-normal;
}
```

Conseguenza: qualunque `<h1>…<h6>` eredita automaticamente font display, colore rosa accent, maiuscolo, tracking compresso e peso normale. Le varianti di dimensione sono applicate caso per caso con classi Tailwind.

### 2.3 Scala dimensioni effettivamente usata

Censite tutte le occorrenze `text-…` nei componenti:

| Classe | Uso ricorrente |
|---|---|
| `text-9xl` / `text-7xl` | Titolone "pAIrbuilder" in welcome (App.tsx 721) e hero `AboutSection` |
| `text-5xl` | Hero secondaria, tagline footer su desktop (`md:text-5xl`) |
| `text-4xl` | H2 di sezione (extracting, loading, add-drinks, paywall) |
| `text-3xl` | H2 dentro card, titoli AuthModal, contatori grandi |
| `text-2xl` | Sotto-titoli di sezione, CTA "Inizia" |
| `text-xl` | Tagline welcome, bottone primario di default, lead text |
| `text-lg` | Lead text, summary |
| `text-sm` | Corpo testo principale, voci dropdown, label form |
| `text-xs` | Bottoni piccoli, label "uppercase tracking-widest", caption |
| `text-[11px]` | Tab login/register dell'AuthModal |
| `text-[10px]` | Micro-label "UPPERCASE TRACKING-WIDEST" — è la dimensione più usata in assoluto per overline/eyebrow |
| `text-[9px]` | Status AI mode nel footer |

### 2.4 Pesi e tracking

| Combinazione ricorrente | Significato |
|---|---|
| `font-display … uppercase tracking-tight font-normal` | Tutti i titoli e i numeri "display" |
| `text-[10px] uppercase tracking-widest` | "Eyebrow" / micro-label (es. "RISTORANTE", "MENU UPLOADED", "DISHES") — comparirà decine di volte |
| `text-xs font-bold uppercase tracking-widest` | Etichette di bottoni pillola, voci nav |
| `font-light` | Tagline body grande (welcome, hero) |
| `font-medium` / `font-bold` | Risalto su corpo Inter |
| `tracking-[0.2em]` / `tracking-[0.4em]` | Footer mini-label, copyright |

---

## 3. Spaziature e margini

Nessuna scala custom: il progetto sfrutta direttamente la scala Tailwind di default (`0.25rem` per step).

### 3.1 Padding orizzontale dei container

- **Layout pagina**: `px-6 md:px-10` su header, main content e footer (App.tsx 622, 711, 977). È il "respiro laterale" canonico dell'app.
- **Card / glass-panel**: `p-4` (mini), `p-6` (standard), `p-8` (grande), `p-10`/`p-12`/`p-14` (hero card di onboarding/paywall, raggiungono `md:p-14`).
- **Bottoni primari**: `px-8 py-3` (default in `.btn-primary`), override frequente a `px-10 py-4` o `px-12 py-4` per le CTA grandi.
- **Pillole / chip**: `px-3 py-1.5` o `px-4 py-2` con `rounded-full`.
- **Input form**: `px-4 py-3`.
- **Header e footer**: padding verticale `py-6`.

### 3.2 Gap e spacing

- **Gap orizzontale fra item della stessa riga**: `gap-2` / `gap-3` / `gap-4` (icona+label, bottoni della stessa toolbar).
- **Grid hero / cards**: `gap-6`, `gap-12` per separare colonne narrative.
- **Spacing verticale dei contenuti di sezione**: `space-y-2` (testi consecutivi), `space-y-4` (label+input), `space-y-6` / `space-y-8` (blocchi narrativi), `space-y-12` (sezioni hero di `AboutSection`).
- **Margini "top" tipici**: `mt-1` / `mt-2` (micro-label), `mt-6` / `mt-8` / `mt-10` (separare CTA da contenuto), `mt-20` (sezione CTA finale in AboutSection).
- **Bordi divisori**: invece di margin si usa `border-t border-white/10` + padding, p.es. `pt-8 border-t border-white/10` e `pt-10 border-t border-white/5`.

### 3.3 Border radius

| Classe | Uso |
|---|---|
| `rounded-sm` | Bottone primario (`.btn-primary`) — è l'unico elemento "spigoloso" del sistema |
| `rounded-lg` | Item dropdown, banner di errore/success, input |
| `rounded-xl` | Card semi-grandi, info box |
| `rounded-2xl` | `.glass-panel` di default |
| `rounded-[2rem]` | Card "hero" di `AboutSection` |
| `rounded-full` | Pillole, switch tab, badge, pallini status |

### 3.4 Larghezze max ricorrenti

- `max-w-md` (AuthModal), `max-w-2xl`/`max-w-3xl`/`max-w-4xl` per sezioni narrative.
- `max-w-[150px]` per troncare il nome ristorante nell'header.

---

## 4. Header e Footer

**Tutta la chrome dell'app è dentro `src/App.tsx`** — non esistono componenti `Header.tsx` / `Footer.tsx` separati. Se si volesse estrarli, servirebbe un refactoring esplicito.

### 4.1 Header (`App.tsx` righe 622-707)

```html
<header class="grid grid-cols-3 items-center px-6 md:px-10 py-6
               border-b border-white/10 z-10
               bg-brand-bg/80 backdrop-blur-sm sticky top-0">
```

Struttura a **3 colonne (`grid-cols-3`)**:

1. **Colonna sinistra** — label "RISTORANTE" (`text-[10px] uppercase tracking-widest opacity-60`) + nome ristorante (`text-sm font-bold`), visibile solo da `lg:` in su.
2. **Colonna centrale** — riservata al titolo, attualmente **vuota e invisibile** (`invisible md:visible opacity-0 pointer-events-none`, con commento `{/* Title removed as requested */}`).
3. **Colonna destra** — flex con `gap-4`:
   - `<LanguageSwitcher />` — pillola con icona globo + codice lingua corrente, usa Radix `DropdownMenu` per cambiare lingua (`src/components/LanguageSwitcher.tsx`).
   - Menu utente — `Radix DropdownMenu` con trigger a pillola (`bg-white/5 rounded-full px-4 py-2 border border-white/10`), icona `User` + label "MENU" + chevron.

Voci del dropdown utente:

- **About us** (icona `BrainCircuit`) → cambia `infoMode` a `about-us` e step a `about`.
- **How it works** (icona `FlashIcon`, l'SVG custom in `src/components/FlashIcon.tsx`) → idem con `how-it-works`.
- **Contact** (icona `Mail`) → idem con `contact`.
- Separatore.
- Se loggato: label "Logged as {nome}" + voce **Logout** rossa.
- Se non loggato: voce **Login** + voce **Register** (in colore accent).

L'header NON contiene logo: il brand "pAIrbuilder" appare solo nella schermata welcome come hero.

### 4.2 Footer (`App.tsx` righe 977-1011)

```html
<footer class="py-6 px-6 md:px-10 border-t border-white/10
               grid grid-cols-3 items-center
               bg-brand-bg-dark">
```

Anche qui, struttura a **3 colonne**:

1. **Colonna sinistra** — status engine:
   - Pallino verde animato (`w-2 h-2 bg-green-400 rounded-full animate-pulse`) + label "AI ENGINE" (`text-[10px] uppercase tracking-widest opacity-70`), label nascosta sotto `sm:`.
   - Riga sotto: piccola checkmark verde (`CheckCircle2` size 12, sempre verde) + status testuale `"AI MODE: {Full|Standard|Basic}"` (`text-[9px] uppercase tracking-tighter opacity-50`), con tooltip glass-panel che appare in hover.
2. **Colonna centrale** — tagline:
   - Riga di payoff in font display, dimensione molto grande (`text-3xl md:text-5xl font-display uppercase text-brand-accent opacity-90`) e `tracking-tighter whitespace-nowrap`. Il contenuto è i18n (`app.footer.tagline`).
3. **Colonna destra** — copyright `text-[10px] opacity-40 uppercase tracking-widest text-right`.

**Link presenti nel footer**: nessuno. Tutti i link esterni sono dentro `AboutSection.tsx` (Contact tab):

- `mailto:hello@pairbuilder.com`
- `mailto:hello@ambrosiavino.com`
- `https://wa.me/393282694406` (WhatsApp)
- E in `Paywall.tsx`: `https://winelist.ambrosiavino.com`

### 4.3 Footer "minore" in AboutSection

`AboutSection.tsx` riga 34-36 ha un suo footer interno alla sezione info:

```html
<footer class="text-center pt-8 opacity-30 text-[10px] uppercase tracking-[0.4em]">
  {t('about.footer')}
</footer>
```

Non è il footer globale: è una piccola firma in fondo alle pagine About / Contact / How-it-works.

---

## 5. Componenti condivisi esistenti

### 5.1 Componenti di pagina/flow (in `src/components/`)

Tutti scoperti tramite `App.tsx` e il routing in `src/main.tsx`:

| File | Ruolo |
|---|---|
| `AboutSection.tsx` | Tre tab interne (`how-it-works` / `about-us` / `contact`) renderizzate in base al prop `mode`. Hero + card + footer-firma. Export `type InfoMode`. |
| `AuthModal.tsx` | Modal login/register/forgot-password, glass-panel con tab pill, sotto-componente locale `<Field />` per gli input. Integra `<TurnstileWidget />`. |
| `FlashIcon.tsx` | Icona SVG di brand (cerchio + due triangoli + onda). Prop `size`, default 24. Usata come "logo concept" in dropdown menu, in `add-drinks` e in `AboutSection`. |
| `LanguageSwitcher.tsx` | Pillola dropdown Radix per cambiare lingua, persiste sul DB se utente loggato. |
| `MenuReview.tsx` | Schermata di revisione piatti/drink estratti, con paginazione e edit inline. |
| `MenuUpload.tsx` | Doppia drag-area (menu cibo + carta drink), gestione drag-over, lista file con remove. |
| `PairingResults.tsx` | Visualizzazione abbinamenti + export PDF via jspdf (usa palette PDF separata). |
| `Paywall.tsx` | Schermata di blocco a pagamento. Card glass con CTA Register / Login + link a Winelist. |
| `ResetPasswordPage.tsx` | Pagina standalone (route `/reset-password`), montata fuori da `App` in `main.tsx`. |
| `RestaurantOnboarding.tsx` | Form di registrazione ristorante guest (nome, tipo, email, telefono, logo). |
| `TurnstileWidget.tsx` | Wrapper di Cloudflare Turnstile per AuthModal. |
| `VerifyEmailPage.tsx` | Pagina standalone (route `/verify-email`), con due stati success/error. |

### 5.2 Utility CSS riusabili

Definite in `src/index.css` righe 21-35. **Sono il "vero" design system condiviso**: ogni volta che si vede uno di questi nomi è una scelta di design intenzionale.

| Classe | Compone |
|---|---|
| `.glass-panel` | `bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl` — pannello vetro standard |
| `.btn-primary` | `px-8 py-3 bg-brand-accent text-brand-bg font-display text-xl rounded-sm transition-all hover:brightness-110 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed uppercase` — l'unico bottone primario "ufficiale" |
| `.nav-link` | `text-white/50 hover:text-white transition-colors cursor-pointer text-sm font-medium tracking-widest uppercase py-1 px-2` |
| `.nav-link-active` | `text-white border-b-2 border-brand-accent` |

> Nota: `.nav-link` / `.nav-link-active` sono definite ma **non risultano effettivamente referenziate** nei componenti — probabilmente residuo di una nav-bar che non è stata implementata o è stata rimossa.

### 5.3 Componente form locale (NON esportato)

`AuthModal.tsx` definisce localmente un `<Field />` (righe 330-349) che è l'unico pattern di input stile-coerente del progetto: label uppercase mini + icona + input glass. Vale la pena **promuoverlo a componente condiviso** se si vuole un design system formale: oggi se ne sente la mancanza in `RestaurantOnboarding`, `ResetPasswordPage` e `VerifyEmailPage`, che reimplementano lo stile a mano.

### 5.4 Pattern di "bottone secondario" (informale)

Non esiste un `.btn-secondary`: in più punti compare la combinazione

```html
class="glass-panel px-8 py-4 hover:bg-white/10 transition-colors
       uppercase text-sm font-bold tracking-widest border-white/10"
```

(es. App.tsx 929, Paywall.tsx 49). Sarebbe il candidato naturale per essere estratto in `.btn-secondary`.

### 5.5 Libreria icone

Tutte le icone vengono da **`lucide-react`** (declarato in `package.json`, versione `^0.546.0`). L'unica icona custom è `FlashIcon` (SVG inline in `src/components/FlashIcon.tsx`).

### 5.6 Animazioni

`motion/react` (Framer Motion v12) per transizioni di sezione (`AnimatePresence`, `motion.section`, `motion.div`). Pattern ricorrenti:

- Entry pagine: `initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }}`.
- Modal: `initial={{ opacity: 0, scale: 0.95, y: 20 }}` con `transition={{ duration: 0.2 }}`.
- Backdrop modal: solo fade.

---

## Sintesi / debiti di design rilevati durante l'audit

1. **Un solo token per i grigi**: il bianco-con-alpha funziona ma non è scalabile su sfondo non-viola; oggi il tema è di fatto monocromatico viola+rosa.
2. **Palette PDF disaccoppiata**: `PairingResults.tsx` usa un'ocra `#d2a86b` che il commento dichiara erroneamente "brand-accent dell'app". Decidere se uniformare al rosa o documentare la divergenza.
3. **`.nav-link` / `.nav-link-active` non usati**: codice morto in `index.css`.
4. **Header e Footer non sono componenti**: vivono inline in `App.tsx` con ~110 righe ciascuno. Estrarli ridurrebbe `App.tsx` da 1016 righe a ~800.
5. **Pattern `<Field />` non esportato**: ogni form reimplementa l'input glass — fonte di drift se cambia lo stile.
6. **`.btn-secondary` informale**: stessa stringa di classi copiata in più punti senza utility centralizzata.
7. **Nessun `tailwind.config.js`**: il tema è in `@theme {}` (Tailwind 4) e in pure utility class. Tutte le custom property sono solo `--color-*` e `--font-*`; non ci sono spaziature, ombre o radius custom dichiarati.
