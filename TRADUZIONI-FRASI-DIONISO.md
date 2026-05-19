# Frasi di Dioniso — traduzioni EN/FR (bozza)

> Bozza di traduzione delle 20 fun phrases che animano la schermata di estrazione.
> Originale in `src/App.tsx` righe 49–81. Da rivedere e approvare prima di
> integrare nei file `en.json` e `fr.json` durante la Fase 2 dell'i18n.
>
> Approccio creativo: in inglese il personaggio è "Dionysus" (forma classica
> attestata in inglese letterario), in francese "Dionysos" (forma standard
> francese). In francese aggiungo qualche riferimento al lessico della
> sommellerie francofona (terroir, cépage, robe, nez) dove l'italiano usava
> termini italiani. Tono giocoso preservato.

---

## 🍽️ FOOD PHRASES

### Counting phase — Dioniso sta contando i piatti

| IT (originale) | EN | FR |
|---|---|---|
| Dioniso sta dando un'occhiata veloce ai tuoi piatti... | Dionysus is taking a quick peek at your dishes... | Dionysos jette un coup d'œil rapide sur vos plats... |
| Scansiono gli antipasti... un attimo di pazienza! | Scanning the appetizers... just a moment! | Je scanne les entrées... un instant, s'il vous plaît ! |
| Analisi dei primi piatti in corso... | Analyzing the first courses... | Analyse des entrées principales en cours... |
| Cerco segnali di delizie gourmet nel tuo menu... | Searching for gourmet delights in your menu... | Je traque les délices gastronomiques dans votre menu... |
| Dioniso sta leggendo la lista dei piatti... | Dionysus is reading through the dish list... | Dionysos parcourt la liste des plats... |

### Extracting phase — Dioniso sta digitalizzando i piatti

| IT (originale) | EN | FR |
|---|---|---|
| Dioniso sta assaggiando virtualmente ogni ingrediente... | Dionysus is virtually tasting every ingredient... | Dionysos goûte virtuellement chaque ingrédient... |
| Sto preparando la cucina digitale per l'estrazione... | Firing up the digital kitchen for extraction... | J'allume les fourneaux numériques pour l'extraction... |
| Analisi sensoriale dei dettagli in corso... | Sensory analysis of every detail underway... | Analyse sensorielle des détails en cours... |
| Sto trascrivendo le tue ricette nel database dell'Olimpo... | Transcribing your recipes into the Olympus database... | Je transcris vos recettes dans la base de données de l'Olympe... |
| Un attimo, sto capendo la personalità di ogni piatto... | One moment — I'm getting to know the soul of each dish... | Un instant, je saisis la personnalité de chaque plat... |

---

## 🍷 DRINK PHRASES

### Counting phase — Dioniso sta contando i drink

| IT (originale) | EN | FR |
|---|---|---|
| Dioniso sta sfogliando la tua cantina digitale... | Dionysus is browsing your digital cellar... | Dionysos feuillette votre cave numérique... |
| Controllo i vitigni presenti nella tua lista... | Checking which grape varieties grace your list... | Je vérifie les cépages présents dans votre carte... |
| Leggo etichette e regioni vinicole... | Reading labels and wine regions... | Je déchiffre étiquettes et terroirs... |
| Identifico bollicine e rossi d'annata... | Spotting fine bubbles and vintage reds... | Je repère les bulles et les rouges de garde... |
| Dioniso sta contando le tue bottiglie migliori... | Dionysus is counting your finest bottles... | Dionysos compte vos plus belles bouteilles... |

### Extracting phase — Dioniso sta digitalizzando i drink

| IT (originale) | EN | FR |
|---|---|---|
| Stappo virtualmente le informazioni più preziose... | Virtually uncorking the most precious details... | Je débouche virtuellement les informations les plus précieuses... |
| L'AI sta decantando i dettagli tecnici dei tuoi vini... | The AI is decanting the technical notes of your wines... | L'IA décante les détails techniques de vos vins... |
| Sto mettendo in fresco le bottiglie per l'abbinamento... | Chilling the bottles for the perfect pairing... | Je mets les bouteilles au frais pour l'accord parfait... |
| Analisi dei terroir e dei produttori in corso... | Analyzing terroirs and producers... | Analyse des terroirs et des vignerons en cours... |
| Un attimo, sto capendo il corpo e l'anima dei tuoi drink... | One moment — I'm sensing the body and soul of your drinks... | Un instant, je saisis le corps et l'âme de vos cuvées... |

---

## Note sulle scelte di traduzione

**Inglese**
- "Dioniso" → "Dionysus" (forma classica latina/inglese, non "Dionysos" che è più tecnico)
- "Olimpo" → "Olympus"
- "annata" → "vintage" / "of vintage"
- Tono: leggermente più colloquiale che in italiano, evita il latinismo "AIS" e simili

**Francese**
- "Dioniso" → "Dionysos" (standard fr per il dio greco)
- "vitigni" → "cépages" (termine tecnico francese standard, conosciuto da tutti i sommelier)
- "terroir" lasciato in francese (è universale, anche in IT/EN si usa)
- "vini" → "cuvées" in un punto, per variazione e per richiamare il lessico della sommellerie
- "primi piatti" → "entrées principales" (perché in Francia "entrée" è il primo, il piatto principale è "plat principal" — ho usato una forma intermedia)
- Uso di lessico tecnico francese: "robe" (colore del vino), "nez" (profumo), "de garde" (da invecchiamento)

**Cosa fare se non ti convincono**
- Sostituiscile direttamente in questo file e segnamelo
- Oppure dimmi quali specifiche e te ne propongo 2–3 alternative
- L'integrazione nei file JSON i18n avverrà comunque solo durante la Fase 2,
  c'è tempo per ritocchi

---

## Tradotto anche: titolo extraction screen

In `App.tsx:587-589` ci sono altre due stringhe brevi che accompagnano queste frasi:

| IT | EN | FR |
|---|---|---|
| Scansionando... | Scanning... | Scan en cours... |
| Estraendo... | Extracting... | Extraction en cours... |
| Individuo piatti e vini | Detecting dishes and wines | Détection des plats et des vins |
| Conversione in digitale | Converting to digital | Conversion en numérique |
| Pagina X di Y | Page X of Y | Page X sur Y |
| Piatti | Dishes | Plats |
| Drinks | Drinks | Boissons |

---

*Generato il 19 maggio 2026 — Claude (CTO virtuale di pAIrbuilder)*
