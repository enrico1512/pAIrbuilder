/**
 * Normalizzazione categorie drink — mapping lingua-agnostico.
 *
 * Problema risolto:
 *   L'AI (Gemini/OpenAI) restituisce le categorie dei drink in linguaggio
 *   naturale variabile per lingua: "Vino Rosso" (IT), "Red Wine" (EN),
 *   "Vin Rouge" (FR), oppure varianti tipografiche ("vino rosso", "Vino-Rosso").
 *   Il database invece usa due enum stretti:
 *     drinkCategory = wine | beer | spirit | cocktail | soft | water | hot
 *     wineColor     = red | white | rose | sparkling | dessert | fortified
 *
 *   Senza questa funzione di normalizzazione, salvare i drink estratti
 *   nel DB diventa un campo minato di stringhe sporche. Con multilingua
 *   il problema si moltiplica per 3.
 *
 * Uso tipico:
 *   const norm = normalizeDrinkCategory("Vin Rouge Bordeaux");
 *   // → { category: 'wine', wineColor: 'red', confidence: 'high' }
 *
 *   const drinkRow = {
 *     ...rawDrink,
 *     category: norm.category,
 *     wineColor: norm.wineColor,
 *   };
 */

import type { drinkCategory, wineColor } from '../../db/schema';

// Tipi derivati dagli enum Drizzle (vedi db/schema.ts)
export type DrinkCategoryEnum = (typeof drinkCategory.enumValues)[number];
export type WineColorEnum = (typeof wineColor.enumValues)[number];

export interface NormalizedCategory {
  category: DrinkCategoryEnum;
  /** Valorizzato solo se category === 'wine' */
  wineColor: WineColorEnum | null;
  /** Quanto siamo sicuri del mapping. 'low' = abbiamo tirato a indovinare. */
  confidence: 'high' | 'medium' | 'low';
  /** Stringa originale ricevuta dall'AI, conservata per debug */
  raw: string;
}

/**
 * Dizionario keyword → (category, wineColor).
 * L'ordine NON conta: la lookup è case-insensitive e cerca contains.
 * Ogni entry copre le 3 lingue target IT/EN/FR + varianti comuni.
 */
const KEYWORDS: Array<{
  match: string[];
  category: DrinkCategoryEnum;
  wineColor: WineColorEnum | null;
}> = [
  // ── VINI ROSSI ────────────────────────────────────────────────
  {
    match: ['vino rosso', 'red wine', 'vin rouge', 'rosso', 'red', 'rouge'],
    category: 'wine',
    wineColor: 'red',
  },
  // ── VINI BIANCHI ──────────────────────────────────────────────
  {
    match: ['vino bianco', 'white wine', 'vin blanc', 'bianco', 'white', 'blanc'],
    category: 'wine',
    wineColor: 'white',
  },
  // ── VINI ROSATI ───────────────────────────────────────────────
  {
    match: ['vino rosato', 'rose wine', 'vin rose', 'rosato', 'rosé', 'rose', "rose'"],
    category: 'wine',
    wineColor: 'rose',
  },
  // ── BOLLICINE / SPUMANTI ──────────────────────────────────────
  {
    match: [
      'bollicine', 'spumante', 'sparkling', 'champagne', 'prosecco',
      'franciacorta', 'metodo classico', 'cremant', 'crémant', 'cava',
      'bulles', 'bubbles',
    ],
    category: 'wine',
    wineColor: 'sparkling',
  },
  // ── VINI DOLCI / PASSITI ──────────────────────────────────────
  {
    match: [
      'vino dolce', 'dessert wine', 'vin doux', 'passito', 'vin santo',
      'moscato', 'sauternes', 'tokaji', 'dolce', 'doux',
    ],
    category: 'wine',
    wineColor: 'dessert',
  },
  // ── VINI LIQUOROSI ────────────────────────────────────────────
  {
    match: [
      'liquoroso', 'fortified', 'vin fortifié', 'porto', 'port', 'sherry',
      'jerez', 'marsala', 'madeira', 'madère',
    ],
    category: 'wine',
    wineColor: 'fortified',
  },
  // ── VINO GENERICO (fallback dentro "wine") ────────────────────
  {
    match: ['vino', 'wine', 'vin'],
    category: 'wine',
    wineColor: null,
  },
  // ── BIRRE ─────────────────────────────────────────────────────
  {
    match: ['birra', 'beer', 'bière', 'biere', 'ale', 'lager', 'pils', 'ipa', 'stout'],
    category: 'beer',
    wineColor: null,
  },
  // ── DISTILLATI / SPIRITS ──────────────────────────────────────
  {
    match: [
      'spirit', 'spirits', 'distillato', 'distillé', 'whisky', 'whiskey',
      'bourbon', 'gin', 'rum', 'vodka', 'tequila', 'mezcal', 'grappa',
      'cognac', 'armagnac', 'brandy', 'amaro', 'liquore', 'liqueur',
      'digestivo', 'digestif', 'aperitivo', 'apéritif',
    ],
    category: 'spirit',
    wineColor: null,
  },
  // ── COCKTAIL ──────────────────────────────────────────────────
  {
    match: ['cocktail', 'mocktail', 'analcolico', 'non-alcoholic cocktail'],
    category: 'cocktail',
    wineColor: null,
  },
  // ── BIBITE / SOFT DRINK ───────────────────────────────────────
  {
    match: [
      'soft drink', 'soft', 'bibita', 'soda', 'succo', 'juice', 'jus',
      'limonata', 'lemonade', 'aranciata',
    ],
    category: 'soft',
    wineColor: null,
  },
  // ── ACQUA ─────────────────────────────────────────────────────
  {
    match: ['acqua', 'water', 'eau', 'mineral', 'frizzante', 'naturale'],
    category: 'water',
    wineColor: null,
  },
  // ── CALDE (caffè, tè) ─────────────────────────────────────────
  {
    match: ['caffe', 'caffè', 'coffee', 'café', 'espresso', 'cappuccino', 'tè', 'the', 'tea', 'thé', 'infuso'],
    category: 'hot',
    wineColor: null,
  },
];

/**
 * Normalizza una stringa "raw" della categoria drink (es. quella restituita
 * dall'AI) in (category, wineColor) coerenti con gli enum del DB.
 *
 * Strategia:
 *   1. Lowercase + trim
 *   2. Cerca la prima keyword più specifica che matcha (le voci più sopra
 *      nel dizionario vincono — i colori vino prima del "vino generico")
 *   3. Se nessun match, ripiega su 'spirit' con confidence 'low'
 *      (è il default storicamente più frequente per voci ambigue)
 */
export function normalizeDrinkCategory(raw: string | null | undefined): NormalizedCategory {
  const rawStr = (raw || '').toString();
  const needle = rawStr.toLowerCase().trim();

  if (!needle) {
    return { category: 'spirit', wineColor: null, confidence: 'low', raw: rawStr };
  }

  for (const entry of KEYWORDS) {
    for (const keyword of entry.match) {
      if (needle.includes(keyword)) {
        // Match esatto sull'intera stringa = high; substring = medium.
        const confidence: NormalizedCategory['confidence'] =
          needle === keyword ? 'high' : 'medium';
        return {
          category: entry.category,
          wineColor: entry.wineColor,
          confidence,
          raw: rawStr,
        };
      }
    }
  }

  return { category: 'spirit', wineColor: null, confidence: 'low', raw: rawStr };
}

/**
 * Helper booleano per sapere se una categoria raw rappresenta un vino,
 * senza istanziare l'intero risultato di normalizeDrinkCategory.
 *
 * Sostituisce la vecchia isWineCategory di gemini.ts in modo lingua-agnostico.
 */
export function isWine(raw: string | null | undefined): boolean {
  return normalizeDrinkCategory(raw).category === 'wine';
}
