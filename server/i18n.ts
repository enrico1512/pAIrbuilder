import type { Request } from 'express';

export const SUPPORTED = ['it', 'en'] as const;
export type Lang = (typeof SUPPORTED)[number];

const supportedSet = new Set<string>(SUPPORTED);

export function getLang(req: Request): Lang {
  const hdr = (req.headers['x-app-language'] as string | undefined)?.toLowerCase().slice(0, 2);
  if (hdr && supportedSet.has(hdr)) return hdr as Lang;
  const acc = (req.headers['accept-language'] as string | undefined)?.toLowerCase().slice(0, 2);
  if (acc && supportedSet.has(acc)) return acc as Lang;
  return 'it';
}

type Dict = Record<Lang, string>;

const errors: Record<string, Dict> = {
  notAuth: { it: 'Non autenticato', en: 'Not authenticated' },
  missingFields: { it: 'Mancano campi: {{fields}}', en: 'Missing fields: {{fields}}' },
  registrationFailed: { it: 'Registrazione fallita', en: 'Registration failed' },
  emailPasswordRequired: { it: 'email e password richiesti', en: 'email and password required' },
  invalidCredentials: { it: 'Credenziali errate', en: 'Invalid credentials' },
  loginFailed: { it: 'Login fallito', en: 'Login failed' },
  userNotFound: { it: 'Utente non trovato', en: 'User not found' },
  readFailed: { it: 'Errore lettura', en: 'Read failed' },
  insertFailed: { it: 'Errore inserimento', en: 'Insert failed' },
  updateFailed: { it: 'Errore aggiornamento', en: 'Update failed' },
  deleteFailed: { it: 'Errore eliminazione', en: 'Delete failed' },
  notFound: { it: 'Non trovato', en: 'Not found' },
  missingGeminiKey: {
    it: 'Chiave API Gemini mancante sul server.',
    en: 'Missing Gemini API Key on server.',
  },
  missingVisionKey: {
    it: 'Chiave API Vision mancante sul server.',
    en: 'Missing Vision API Key on server.',
  },
  missingOpenAIKey: {
    it: 'Chiave API OpenAI mancante sul server.',
    en: 'Missing OpenAI API Key on server.',
  },
};

export function tError(
  lang: Lang,
  key: keyof typeof errors,
  vars?: Record<string, string | number>,
): string {
  const entry = errors[key];
  let str = entry?.[lang] || entry?.it || String(key);
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      str = str.replace(`{{${k}}}`, String(v));
    }
  }
  return str;
}

// ---------- OpenAI system prompts ----------
// Each builder returns the system prompt in the user's language. Heuristics
// embedded in the prompts (e.g. "ignore beers/cocktails" for menu-scan)
// remain identical across languages — only the framing sentence changes.

export function extractSystemPrompt(lang: Lang): string {
  return lang === 'en'
    ? 'You are an expert sommelier and menu digitizer. Always reply with valid JSON.'
    : 'Sei un esperto sommelier e digitalizzatore di menu. Rispondi sempre in formato JSON valido.';
}

export function listItemsSystemPrompt(lang: Lang): string {
  return lang === 'en'
    ? 'You are an AI assistant specialized in detecting items in restaurant menus. Reply in JSON.'
    : 'Sei un assistente AI specializzato nel rilevamento di voci in menu di ristoranti. Rispondi in JSON.';
}

export function menuScanSystemPrompt(lang: Lang, allowPizzas: boolean): string {
  if (lang === 'en') {
    return `You are an expert on restaurant menus. Your task is to identify EVERY food item and EVERY DRINK in the text or images provided.
RULES:
- Extract ALL dishes (antipasti, first courses, main courses, sides, desserts${allowPizzas ? ', pizzas' : ''}).
- Extract ALL drinks of any category for the "drinks" list: wines (red, white, rosé, sparkling/spumante/champagne/prosecco/franciacorta, sweet/passito/moscato, fortified marsala/port), beers (lager/IPA/stout/artisanal), cocktails (alcoholic + alcohol-free), spirits/distillati (whisky, gin, rum, vodka, tequila, grappa, brandy, cognac), liqueurs, amari, digestives, aperitifs (aperol, campari, vermouth, limoncello, sambuca), soft drinks, juices, water, coffee, tea. Sections titled "Birre", "Cocktail", "Distillati", "Spiriti", "Soft Drink", "Bibite", "Amari", "Caffetteria" are ALL in-scope — DO NOT skip them.
${allowPizzas ? '' : '- DO NOT extract pizzas.\n'}- Return ONLY the names, exactly as written in the menu.
- Reply ONLY with valid JSON in the format: {"dishes": ["name1", "name2", ...], "drinks": ["name1", "name2", ...]}
- DO NOT add prices, descriptions, or other fields. Only names as strings.
- If multiple images are provided, analyze ALL of them.`;
  }
  return `Sei un esperto di menu di ristoranti. Il tuo compito è identificare OGNI voce di cibo e OGNI BEVANDA presente nel testo o nelle immagini fornite.
REGOLE:
- Estrai TUTTI i piatti (antipasti, primi, secondi, contorni, dessert${allowPizzas ? ', pizze' : ''}).
- Estrai TUTTE le bevande di qualsiasi categoria per la lista "drinks": vini (rossi, bianchi, rosati, bollicine/spumanti/champagne/prosecco/franciacorta, dolci/passiti/moscato, liquorosi marsala/porto), birre (lager/IPA/stout/artigianali), cocktail (alcolici + analcolici), spirits/distillati (whisky, gin, rum, vodka, tequila, grappa, brandy, cognac), liquori, amari, digestivi, aperitivi (aperol, campari, vermouth, limoncello, sambuca), soft drink, succhi, acqua, caffè, tè. Le sezioni "Birre", "Cocktail", "Distillati", "Spiriti", "Soft Drink", "Bibite", "Amari", "Caffetteria" sono TUTTE da estrarre — NON saltarle.
${allowPizzas ? '' : '- NON estrarre pizze.\n'}- Restituisci SOLO i nomi, esattamente come scritti nel menu.
- Rispondi SOLO con JSON valido nel formato: {"dishes": ["nome1", "nome2", ...], "drinks": ["nome1", "nome2", ...]}
- NON aggiungere prezzi, descrizioni o altri campi. Solo nomi come stringhe.
- Se ci sono più immagini, analizzale TUTTE.`;
}

export function menuScanFallbackUserText(lang: Lang): string {
  return lang === 'en'
    ? 'Extract all items from the menu in the provided images.'
    : 'Estrai tutte le voci dal menu dalle immagini fornite.';
}

export function menuExtractSystemPrompt(lang: Lang, isDrinks: boolean, itemCount: number): string {
  const schema = isDrinks
    ? `{"category": "Vino Rosso|Vino Bianco|Vino Rosato|Bollicine|Vino Dolce|Birra|Birra Artigianale|Cocktail|Cocktail Analcolico|Whisky|Gin|Rum|Vodka|Tequila|Grappa|Spirits|Amaro|Liquore|Digestivo|Aperitivo|Acqua|Soft Drink|Succo|The|Caffe'|Altro", "producer": "...", "product": "...", "price": "...", "vintage": "...", "origin": "..."}`
    : `{"category": "ANTIPASTI|PRIMI|SECONDI|DESSERT|...", "name": "...", "fullIngredients": "...", "price": "..."}`;

  if (lang === 'en') {
    return `You are an expert on restaurant menus. Extract the details of the listed items from the menu's text/images.
Reply ONLY with JSON: {"items": [${schema}, ...]}
${isDrinks ? 'ALL DRINKS in-scope: wines, beers, cocktails, spirits/distillati, liqueurs, amari, digestives, aperitifs, soft drinks, juices, water, coffee, tea. Assign the most specific category from the allowed list. Vintage applies to wines only; leave empty for other categories.\n' : ''}Extract ALL ${itemCount} listed items. DO NOT skip any item. Analyze all provided images.`;
  }
  return `Sei un esperto di menu di ristoranti. Estrai i dettagli delle voci indicate dal testo/immagini del menu.
Rispondi SOLO con JSON: {"items": [${schema}, ...]}
${isDrinks ? 'TUTTE LE BEVANDE in-scope: vini, birre, cocktail, spirits/distillati, liquori, amari, digestivi, aperitivi, soft drink, succhi, acqua, caffè, tè. Assegna la categoria più specifica dalla lista ammessa. L\'annata si applica solo ai vini; lascia vuota per le altre categorie.\n' : ''}Estrai TUTTE le ${itemCount} voci indicate. NON saltare nessuna voce. Analizza tutte le immagini fornite.`;
}

export function menuExtractUserPrefix(lang: Lang, itemNames: string[]): string {
  return lang === 'en'
    ? `Items to extract: ${itemNames.join(', ')}\n\nCONTENT:\n`
    : `Voci da estrarre: ${itemNames.join(', ')}\n\nCONTENUTO:\n`;
}

export function pairingsSystemPrompt(lang: Lang): string {
  if (lang === 'en') {
    return `You are a professional sommelier. For each dish provided, create 2 pairings using ONLY the drinks from the supplied list.
One pairing for "Concordance" (similar flavors) and one for "Contrast".
Reply ONLY with JSON: {"pairings": [{"dish": "dish name", "drinks": [{"name": "drink name", "category": "category", "price": "price or null", "description": "3 lines of description in English with proper punctuation and accents (château, élevé, perché, à la, etc.)", "matchType": "Concordanza|Contrapposizione"}, ...]}, ...]}
Use ONLY drinks from the list. Do not invent. Process ALL dishes. matchType values must remain in Italian ("Concordanza" / "Contrapposizione") for downstream compatibility.`;
  }
  return `Sei un sommelier professionista italiano. Per ogni piatto fornito, crea 2 abbinamenti usando SOLO le bevande dalla lista fornita.
Un abbinamento per "Concordanza" (gusti simili) e uno per "Contrapposizione" (contrasto).
Rispondi SOLO con JSON: {"pairings": [{"dish": "nome piatto", "drinks": [{"name": "nome bevanda", "category": "categoria", "price": "prezzo o null", "description": "3 righe di descrizione in italiano con accenti corretti (è, perché, città, qualità)", "matchType": "Concordanza|Contrapposizione"}, ...]}, ...]}
USA SOLO bevande dalla lista. Non inventare. Processa TUTTI i piatti.`;
}

export function pairingsUserPrefix(lang: Lang, restaurantInfo: string): string {
  return lang === 'en'
    ? `Restaurant: ${restaurantInfo}\n\nDISHES: `
    : `Ristorante: ${restaurantInfo}\n\nPIATTI: `;
}
