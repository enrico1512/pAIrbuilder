import { GoogleGenAI, Type } from "@google/genai";
import { performOCR } from "./vision";
import { learningService } from "./learningService";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export interface Dish {
  category: string;
  name: string;
  fullIngredients: string;
}

export type DrinkCategory = 
  | "Vino Rosso" | "Vino Bianco" | "Vino Rosato" | "Bollicine" | "Vino Dolce" 
  | "Birra" | "Birra Artigianale" 
  | "Cocktail" | "Cocktail Analcolico" 
  | "Spirits" | "Whisky" | "Gin" | "Rum" | "Vodka" | "Tequila" | "Grappa" | "Amaro" | "Liquore" | "Digestivo" | "Aperitivo" 
  | "Acqua" | "Soft Drink" | "Succo" | "The" | "Caffe'" | "Altro";

export interface Drink {
  category: string; // Changed from 'type' as union to string for flexibility
  producer: string;
  product: string;
  price?: string;
  isPriority?: boolean;
  vintage?: string;
  alcoholContent?: string;
  volume?: string;
  origin?: string;
}

export interface ExtractionResult {
  dishes: Dish[];
  drinks: Drink[];
}

export interface Pairing {
  dish: string;
  category: string;
  drinks: {
    name: string;
    category: string;
    price?: string;
    description: string;
    matchType: "Contrapposizione" | "Concordanza";
  }[];
}

export function cleanAccents(text: string): string {
  if (!text) return "";
  return text
    .replace(/[àáâãäå]/g, "a'")
    .replace(/[èéêë]/g, "e'")
    .replace(/[ìíîï]/g, "i'")
    .replace(/[òóôõö]/g, "o'")
    .replace(/[ùúûü]/g, "u'")
    .replace(/[ÀÁÂÃÄÅ]/g, "A'")
    .replace(/[ÈÉÊË]/g, "E'")
    .replace(/[ÌÍÎÏ]/g, "I'")
    .replace(/[ÒÓÔÕÖ]/g, "O'")
    .replace(/[ÙÚÛÜ]/g, "U'");
}

async function safeGenerateContent(modelName: string, contents: any, config: any) {
  let attempts = 0;
  const maxAttempts = 4;
  const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

  while (attempts < maxAttempts) {
    try {
      const response = await ai.models.generateContent({
        model: modelName,
        contents,
        config
      });
      return response.text;
    } catch (e: any) {
      attempts++;
      console.error(`Gemini Attempt ${attempts} using ${modelName} failed:`, e);

      const errorMessage = e.message || String(e);
      const isTransient = errorMessage.includes("500") || 
                        errorMessage.includes("INTERNAL") || 
                        errorMessage.includes("overloaded") ||
                        errorMessage.includes("deadline") ||
                        errorMessage.includes("503") ||
                        errorMessage.includes("expired") ||
                        errorMessage.includes("429");
      
      if (isTransient && attempts < maxAttempts) {
        const waitTime = Math.pow(2, attempts) * 1000 + Math.random() * 500;
        console.warn(`Retrying in ${Math.round(waitTime)}ms...`);
        await delay(waitTime);
        continue;
      }
      throw e;
    }
  }
}

/**
 * Utility to run tasks with limited concurrency
 */
async function runWithConcurrency<T>(tasks: (() => Promise<T>)[], maxConcurrent: number): Promise<T[]> {
  const results: T[] = [];
  const executing = new Set<Promise<any>>();

  for (const task of tasks) {
    const p = Promise.resolve().then(() => task());
    results.push(p as any);
    executing.add(p);
    
    const clean = () => executing.delete(p);
    p.then(clean).catch(clean);
    
    if (executing.size >= maxConcurrent) {
      await Promise.race(executing);
    }
  }

  return Promise.all(results);
}

function timeoutPromise<T>(ms: number, promise: Promise<T>): Promise<T> {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), ms)) as Promise<T>
  ]);
}

function repairJson(jsonString: string): any {
  let cleaned = jsonString.trim();
  // Remove markdown blocks
  cleaned = cleaned.replace(/```json\n?|```/g, "").trim();

  const originalCleaned = cleaned;

  try {
    return JSON.parse(cleaned);
  } catch (parseError: any) {
    console.warn("Initial JSON parse failed, attempting repair...", parseError.message);
    
    let repaired = cleaned;

    // 1. Basic cleaning: remove control characters that might break JSON.parse
    repaired = repaired.replace(/[\u0000-\u001F\u007F-\u009F]/g, "");

    // 2. Fix missing commas between properties
    repaired = repaired.replace(/"\s*"\s*([a-zA-Z0-9_]+)\s*":/g, '", "$1":');
    repaired = repaired.replace(/(\d|true|false|null)\s*"\s*([a-zA-Z0-9_]+)\s*":/g, '$1, "$2":');

    // 3. Handle truncated JSON at the end of an object/array
    // If it ends abruptly, try to close the current structure
    if (!repaired.endsWith('}') && !repaired.endsWith(']')) {
      // Find the last complete object "}"
      const lastBrace = repaired.lastIndexOf('}');
      if (lastBrace !== -1) {
        // Try to see if cutting there and closing the array helps
        const attempt = repaired.slice(0, lastBrace + 1).trim();
        try {
          // If we were inside an array named "dishes" or "drinks"
          if (repaired.includes('"dishes": [') || repaired.includes('"drinks": [')) {
            return JSON.parse(attempt + ']}');
          }
          // If it was just an array
          if (repaired.startsWith('[')) {
            return JSON.parse(attempt + ']');
          }
          return JSON.parse(attempt);
        } catch (e) {}
      }
    }

    // 4. Handle unterminated strings at the very end
    const lastQuoteIndex = repaired.lastIndexOf('"');
    const lastBraceIndex = repaired.lastIndexOf('}');
    const lastBracketIndex = repaired.lastIndexOf(']');
    
    if (lastQuoteIndex > lastBraceIndex && lastQuoteIndex > lastBracketIndex) {
      let isEscaped = false;
      let k = lastQuoteIndex - 1;
      while (k >= 0 && repaired[k] === '\\') {
        isEscaped = !isEscaped;
        k--;
      }
      if (!isEscaped) {
        repaired += '"';
      }
    }

    // 5. Remove trailing comma before closure
    repaired = repaired.replace(/,\s*([\}\]])/g, "$1");
    repaired = repaired.replace(/,\s*$/, "");

    // 6. Balance braces and brackets
    const stack: string[] = [];
    let inString = false;
    let escaped = false;
    let finalRepaired = "";

    for (let i = 0; i < repaired.length; i++) {
        const char = repaired[i];
        
        if (escaped) {
            finalRepaired += char;
            escaped = false;
            continue;
        }
        
        if (char === '\\') {
            finalRepaired += char;
            escaped = true;
            continue;
        }

        if (char === '"') {
            const remaining = repaired.slice(i + 1).trim();
            const preceded = finalRepaired.trim();
            const isStructuralEnd = remaining.length === 0 || /^[:,}\]]/.test(remaining);
            if (inString && !isStructuralEnd) {
                finalRepaired += '\\"';
                continue;
            }
            inString = !inString;
            finalRepaired += char;
            continue;
        }

        if (inString && (char === '\n' || char === '\r')) {
            finalRepaired += '\\n';
            continue;
        }

        if (!inString) {
            if (char === '{' || char === '[') {
                stack.push(char);
            } else if (char === '}') {
                if (stack.length > 0 && stack[stack.length - 1] === '{') {
                    stack.pop();
                } else {
                    continue;
                }
            } else if (char === ']') {
                if (stack.length > 0 && stack[stack.length - 1] === '[') {
                    stack.pop();
                } else {
                    continue;
                }
            }
        }
        
        finalRepaired += char;
    }

    if (inString) finalRepaired += '"';

    while (stack.length > 0) {
        const last = stack.pop();
        if (last === '{') finalRepaired += '}';
        else if (last === '[') finalRepaired += ']';
    }

    try {
      return JSON.parse(finalRepaired);
    } catch (e: any) {
      const match = originalCleaned.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
      if (match) {
        try {
          return JSON.parse(match[0]);
        } catch (innerE) {
          throw parseError;
        }
      }
      throw parseError;
    }
  }
}

export async function listItemNames(
  pageData: { text?: string; imageBase64?: string; images?: string[]; mimeType?: string },
  allowPizzas: boolean = false
): Promise<{ dishes: string[]; drinks: string[] }> {
  try {
    const prompt = `
      DIONISO DISCOVERY v14 - ULTIMATE EXHAUSTIVE SCAN
      Your mission is to IDENTIFY EVERY SINGLE unique food and beverage item name present in this document.
      
      DRINKS INSTRUCTION: Extract EVERY beverage name: wines (all colors), beers, cocktails, spirits, liqueurs, soft drinks.
      
      DISHES INSTRUCTION: 
      1. Extract EVERY dish name, including desserts, sides, and appetizers. 
      2. CATEGORIZATION: You MUST find at least 2 dishes for every major section (Antipasti, Primi, Secondi, Dessert, etc.). 
      3. PIZZA RULE: ${allowPizzas ? "EXTRACT PIZZAS as a dedicated section." : "DO NOT extract Pizzas. Skip any section or item identified as Pizza."}
      
      CRITICAL RULES:
      1. Return ONLY the item names as a flat list in JSON. 
      2. DO NOT filter anything out ${allowPizzas ? "" : "(except pizzas)"}. If a wine list has 100 entries, you MUST return 100 entries.
      3. SCAN EVERYTHING: Many menus have multiple columns, small text, or items listed in sidebars. Scan until the very last word of the last page.
      4. DO NOT SUMMARIZE. DO NOT USE "...". DO NOT TRUNCATE. If the list is long, continue until finished. NO EXCUSES.
      5. Extract names exactly as written.
      
      OUTPUT FORMAT (JSON ONLY):
      {
        "dishes": ["Dish Name 1", "Dish Name 2", ...],
        "drinks": ["Drink Name 1", "Drink Name 2", ...]
      }

      ${learningService.getLearningPrompt('dishes')}
      ${learningService.getLearningPrompt('drinks')}
    `;

    const parts: any[] = [{ text: prompt }];
    if (pageData.imageBase64) parts.push({ inlineData: { data: pageData.imageBase64, mimeType: "image/jpeg" } });
    if (pageData.images) pageData.images.forEach(img => parts.push({ inlineData: { data: img, mimeType: "image/jpeg" } }));
    if (pageData.text) parts.push({ text: `RAW CONTENT TO SCAN:\n${pageData.text}` });

    const resultText = await safeGenerateContent(
      "gemini-3-flash-preview", 
      [{ parts }],
      {
        temperature: 0,
        maxOutputTokens: 8192,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            dishes: { type: Type.ARRAY, items: { type: Type.STRING } },
            drinks: { type: Type.ARRAY, items: { type: Type.STRING } },
          },
          required: ["dishes", "drinks"],
        },
      }
    );

    const result = repairJson(resultText || "{}");
    return {
      dishes: (Array.isArray(result.dishes) ? result.dishes : []).map(cleanAccents),
      drinks: (Array.isArray(result.drinks) ? result.drinks : []).map(cleanAccents)
    };
  } catch (e) {
    console.error("Discovery failed:", e);
    return { dishes: [], drinks: [] };
  }
}

async function extractItemsBatch(
  pageSources: any[],
  itemNames: string[],
  type: "dishes" | "drinks",
  allowPizzas: boolean = false
): Promise<any[]> {
  if (itemNames.length === 0) return [];

  const drinkCategoriesPrompt = `
    CATEGORIES FOR DRINKS: "Vino Rosso", "Vino Bianco", "Vino Rosato", "Bollicine", "Vino Dolce", "Birra", "Birra Artigianale", "Cocktail", "Cocktail Analcolico", "Spirits", "Whisky", "Gin", "Rum", "Vodka", "Tequila", "Grappa", "Amaro", "Liquore", "Digestivo", "Aperitivo", "Acqua", "Soft Drink", "Succo", "The", "Caffe'", "Altro".
  `;

  const prompt = `
    DIONISO BATCH EXTRACTOR v6 - ULTIMATE PRECISION MODE
    Target Items: ${itemNames.join(", ")}
    
    PRIMARY GOAL: ACCURACY AND COMPLETENESS OVER SPEED. 
    You MUST find and extract EVERY field for EVERY item listed.
    
    TASK: Find these SPECIFIC items in the provided images/text and extract their full details.
    
    SCHEMA FOR DISHES: { category, name, fullIngredients }
    SCHEMA FOR DRINKS: { category, producer, product, price, vintage, volume, origin }
    
    RULES:
    1. Extract ALL the ${itemNames.length} items listed above. DO NOT SKIP ANY.
    2. CATEGORY NAMES (DISHES): Use standard categories like "ANTIPASTI", "PRIMI PIATTI", "SECONDI PIATTI", "DESSERT". DO NOT use "Piatto 1", use the section name from the menu.
    3. PIZZA RULE: ${allowPizzas ? "EXTRACT PIZZAS normally." : "If an item is a PIZZA, skip it."}
    4. BE PRECISE. Use the exact product names/producers found in the sources. Search across ALL columns and pages provided.
    5. ${type === 'drinks' ? drinkCategoriesPrompt : ''}
    6. NO DATA LOSS: If a description exists (ingredients, notes), you MUST capture it fully.
    7. NEVER SUMMARIZE or TRUNCATE. PROCEED ITEM BY ITEM WITH MAXIMUM ATTENTION.

    ${learningService.getLearningPrompt(type)}
  `;

  const parts: any[] = [{ text: prompt }];
  pageSources.forEach(src => {
    if (src.imageBase64) parts.push({ inlineData: { data: src.imageBase64, mimeType: "image/jpeg" } });
    if (src.images) src.images.forEach((img: string) => parts.push({ inlineData: { data: img, mimeType: "image/jpeg" } }));
    if (src.text) parts.push({ text: `SOURCE CONTENT:\n${src.text}` });
  });

  const config = {
    temperature: 0,
    maxOutputTokens: 8192,
    responseMimeType: "application/json",
    responseSchema: {
      type: Type.OBJECT,
      properties: {
        items: {
          type: Type.ARRAY,
          items: type === "dishes" 
            ? {
                type: Type.OBJECT,
                properties: {
                  category: { type: Type.STRING },
                  name: { type: Type.STRING },
                  fullIngredients: { type: Type.STRING },
                },
                required: ["category", "name"]
              }
            : {
                type: Type.OBJECT,
                properties: {
                  category: { type: Type.STRING },
                  producer: { type: Type.STRING },
                  product: { type: Type.STRING },
                  price: { type: Type.STRING },
                  vintage: { type: Type.STRING },
                  volume: { type: Type.STRING },
                  origin: { type: Type.STRING },
                },
                required: ["category", "product"]
              }
        }
      },
      required: ["items"]
    }
  };

  try {
    const apiCall = safeGenerateContent("gemini-3-flash-preview", [{ parts }], config);
    // Increased timeout to 120s to prioritize reading over speed
    const resultText = await timeoutPromise(120000, apiCall).catch(e => {
        console.warn(`Batch timeout (120s) for ${type}:`, e.message);
        return null;
    });

    if (!resultText) return [];
    const result = repairJson(resultText);
    const items = Array.isArray(result.items) ? result.items : [];
    
    return items.map((item: any) => {
      const cleaned: any = {};
      for (const key in item) {
        if (typeof item[key] === 'string') {
          cleaned[key] = cleanAccents(item[key]);
        } else {
          cleaned[key] = item[key];
        }
      }
      return cleaned;
    });
  } catch (e) {
    console.error(`Batch extraction failed for ${type}:`, e);
    return [];
  }
}

export async function extractMenuData(
  menuData: { text?: string; imageBase64?: string; images?: string[]; mimeType?: string }[],
  drinksData: { text?: string; imageBase64?: string; images?: string[]; mimeType?: string }[],
  hints?: { dishes: string[]; drinks: string[] },
  onProgress?: (totalDishes: number, totalDrinks: number) => void
): Promise<{ dishes: Dish[]; drinks: Drink[] }> {
  
  // 1. Discovery phase (if hints not provided)
  let dishesToBatch = hints?.dishes || [];
  let drinksToBatch = hints?.drinks || [];

  // Analyze drink sources for pizza-enabling keywords
  const allDrinksText = drinksData.map(d => d.text || "").join(" ").toLowerCase();
  const allowPizzas = allDrinksText.includes("birra") || allDrinksText.includes("beer") || allDrinksText.includes("cocktail");

  if (!hints) {
    const allSources = [...menuData, ...drinksData];
    for (const src of allSources) {
      const pageScan = await listItemNames(src, allowPizzas);
      dishesToBatch = [...new Set([...dishesToBatch, ...pageScan.dishes])];
      drinksToBatch = [...new Set([...drinksToBatch, ...pageScan.drinks])];
      if (onProgress) onProgress(dishesToBatch.length, drinksToBatch.length);
    }
  }

  // 2. Batch extraction using parallelism with concurrency limit
  const BATCH_SIZE = 10;
  const allDishes: Dish[] = [];
  const allDrinks: Drink[] = [];

  // All sources combined for extraction to ensure context
  const combinedSources = [...menuData, ...drinksData];

  // Batch tasks (combined dishes and drinks for efficiency)
  const allTasks = [];
  
  // Batch dishes tasks
  for (let i = 0; i < dishesToBatch.length; i += BATCH_SIZE) {
    const batch = dishesToBatch.slice(i, i + BATCH_SIZE);
    allTasks.push(async () => {
      const results = await extractItemsBatch(combinedSources, batch, "dishes", allowPizzas);
      // Basic validation: ensure we don't push empty objects
      const valid = results.filter(r => r && r.name);
      allDishes.push(...valid);
      if (onProgress) onProgress(allDishes.length, allDrinks.length);
      return valid;
    });
  }

  // Batch drinks tasks
  for (let i = 0; i < drinksToBatch.length; i += BATCH_SIZE) {
    const batch = drinksToBatch.slice(i, i + BATCH_SIZE);
    allTasks.push(async () => {
      const results = await extractItemsBatch(combinedSources, batch, "drinks", allowPizzas);
      // Basic validation
      const valid = results.filter(r => r && r.product);
      allDrinks.push(...valid);
      if (onProgress) onProgress(allDishes.length, allDrinks.length);
      return valid;
    });
  }
  
  await runWithConcurrency(allTasks, 2); // Lower concurrency to avoid rate limits and improve quality

  // Deduplicate carefully: allow same product if producer or vintage is different
  const dishMap = new Map();
  allDishes.forEach(d => {
    // Include category in key to avoid colliding dishes in different sections
    const key = `${d.name.toLowerCase().trim()}|${(d.category || "").toLowerCase().trim()}`;
    dishMap.set(key, d);
  });
  
  const drinkMap = new Map();
  allDrinks.forEach((d, i) => {
    // Loosened index to ensure we don't drop items with missing meta
    // Key should be unique enough to keep different vintages/producers of same name
    const prod = (d.product || "").toLowerCase().trim();
    const marc = (d.producer || "").toLowerCase().trim();
    const vent = (d.vintage || "").toLowerCase().trim();
    const key = prod ? `${prod}|${marc}|${vent}|${i}` : `drink-key-${i}`;
    drinkMap.set(key, d);
  });

  return {
    dishes: Array.from(dishMap.values()),
    drinks: Array.from(drinkMap.values())
  };
}


export async function analyzeDrinksWithMenu(
  dishes: Dish[],
  drinks: Drink[]
): Promise<{ stats: string[]; strategy: string }> {
  // 1. Calculate stats client-side
  const total = drinks.length;
  if (total === 0) return { stats: [], strategy: "" };

  const categories = drinks.reduce((acc: any, d) => {
    const cat = d.category || "Altro";
    acc[cat] = (acc[cat] || 0) + 1;
    return acc;
  }, {});

  const prices = drinks
    .map(d => parseFloat(d.price?.replace(/[^0-9.]/g, "") || "0"))
    .filter(p => p > 0);
  
  const avgPrice = prices.length > 0 
    ? (prices.reduce((a, b) => a + b, 0) / prices.length).toFixed(0) 
    : "N/A";

  // Get top 3 categories by percentage
  const topCategories = Object.entries(categories)
    .sort((a: any, b: any) => b[1] - a[1])
    .slice(0, 3)
    .map(([cat, count]: [string, any]) => {
      const pct = Math.round((count / total) * 100);
      return `${pct}% ${cat}`;
    });

  const stats = [
    ...topCategories,
    `Fascia media bottiglia: ${avgPrice}€`
  ];

  // 2. AI Strategic Consideration
  const prompt = `
    DIONISO STRATEGIST v2 - AI SOMMELIER
    Analizza brevemente (max 250 caratteri) la carta dei vini e dei piatti forniti.
    Parla come Dioniso, un esperto AI Sommelier.
    Fornisci una "Considerazione Strategica" che aiuti il ristoratore a capire come valorizzare la cantina rispetto al menu.
    
    REGOLE:
    1. Lingua: Italiano.
    2. NO ACCENTI (usa l'apostofro, es. perche', e', sara').
    3. Sii professionale, autorevole e focalizzato sul business (margini, rotazione).
    4. Inizia con una visione d'insieme della struttura dei drinks rispetto ai piatti.
    5. NON usare mai il grassetto (**) nel testo.
  `;

  const data = `PIATTI: ${dishes.map(d => d.name).join(", ")}\nDRINKS: ${drinks.map(d => `${d.producer} ${d.product} (${d.category})`).join(", ")}`;

  try {
    const text = await safeGenerateContent(
      "gemini-3-flash-preview", 
      [{ parts: [{ text: prompt }, { text: data }] }],
      { temperature: 0.5, maxOutputTokens: 150 }
    );
    
    // Clean potential accidental accents from AI
    const cleanAccents = (t: string) => {
      return t
        .replace(/[àáâãäå]/g, "a'")
        .replace(/[èéêë]/g, "e'")
        .replace(/[ìíîï]/g, "i'")
        .replace(/[òóôõö]/g, "o'")
        .replace(/[ùúûü]/g, "u'")
        .replace(/[ÀÁÂÃÄÅ]/g, "A'")
        .replace(/[ÈÉÊË]/g, "E'")
        .replace(/[ÌÍÎÏ]/g, "I'")
        .replace(/[ÒÓÔÕÖ]/g, "O'")
        .replace(/[ÙÚÛÜ]/g, "U'");
    };

    return {
      stats,
      strategy: cleanAccents(text || "Analisi non disponibile.")
    };
  } catch (e) {
    console.error("Analysis failed:", e);
    const mainCat = topCategories[0]?.split('% ')[1] || 'prodotti';
    const fallbackStrategy = cleanAccents(`Dioniso rileva una forte presenza di ${mainCat}. Questa selezione si presta a sostenere la complessita' dei piatti in menu, offrendo l'opportunita' di spingere etichette con maggiore margine e migliorare la rotazione del magazzino.`);
    return { 
      stats, 
      strategy: fallbackStrategy
    };
  }
}

export async function generatePairings(
  restaurantInfo: string,
  dishes: Dish[],
  drinks: Drink[],
  userContext: string = "it-IT|€"
): Promise<Pairing[]> {
  if (dishes.length === 0 || drinks.length === 0) return [];

  const [lang, currency] = userContext.split('|');
  const BATCH_SIZE = 7; // Smaller batches for higher reliability
  const allPairings: Pairing[] = [];

  const drinkData = JSON.stringify(drinks.map(d => ({
    ...d,
    product: d.isPriority ? `*** PRIORITY: ${d.product} ***` : d.product
  })));

  const batches = [];
  for (let i = 0; i < dishes.length; i += BATCH_SIZE) {
    batches.push(dishes.slice(i, i + BATCH_SIZE));
  }

  const pairingTasks = batches.map((batch, batchIndex) => async () => {
    const prompt = `
      SOMMELIER AI v19 - PROFESSIONAL ITALIAN SOMMELIER
      Restaurant: ${restaurantInfo}
      User Language: ${lang}
      Currency Symbol: ${currency}
      Batch: ${batchIndex + 1} of ${batches.length}
      
      Task: Create exactly TWO perfect wine pairings for EVERY single dish in the provided batch.
      
      PAIRING LOGIC:
      1. For each dish, provide 1 pairing by "Concordanza" (Congruence) and 1 by "Contrapposizione" (Contrast).
      2. Use ONLY the provided drinks list. Give priority to drinks that seem most appropriate or prestigious.
      3. CRITICAL: You MUST process EVERY SINGLE DISH in THIS batch (${batch.length} dishes). Do NOT skip any.
      4. You MUST use ONLY drinks from the provided DRINKS LIST. Never invent drinks not in the list. If no suitable drink exists, use the closest available one.
      5. Each description MUST be exactly 3 lines long.
      6. Language: Force ALL descriptions into the user's language (${lang}). NEVER use English unless the system language is English.
      7. STYLE RULE (CRITICAL): Eliminate all accented characters from descriptions (e.g., use 'e\'' instead of 'è', 'perche\'' instead of 'perché', 'citta\'' instead of 'città'). 
      8. Tone: Academic but evocative (AIS style), mention dish ingredients, use a tone that makes the guest dream.
      
      Return a JSON array of: { dish, drinks: [{ name, category, price, description, matchType }] }
    `;

    const batchData = `DISHES IN THIS BATCH: ${JSON.stringify(batch)}\nDRINKS LIST: ${drinkData}`;

    try {
      const text = await safeGenerateContent(
        "gemini-3-flash-preview",
        [{ parts: [{ text: prompt }, { text: batchData }] }],
        {
          temperature: 0.1,
          maxOutputTokens: 8192,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                dish: { type: Type.STRING },
                drinks: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      name: { type: Type.STRING },
                      category: { type: Type.STRING },
                      price: { type: Type.STRING },
                      description: { type: Type.STRING },
                      matchType: { type: Type.STRING },
                    },
                    required: ["name", "category", "description", "matchType"],
                    additionalProperties: false,
                  },
                },
              },
              required: ["dish", "drinks"],
              additionalProperties: false,
            },
          },
        }
      );
      
      if (!text) return [];
      const result = repairJson(text);
      const pairings = Array.isArray(result) ? result : [];
      return pairings.map((p: any) => ({
        ...p,
        dish: cleanAccents(p.dish),
        drinks: (p.drinks || []).map((d: any) => ({
          ...d,
          name: cleanAccents(d.name),
          category: cleanAccents(d.category),
          description: cleanAccents(d.description)
        }))
      }));
    } catch (e) {
      console.error(`Gemini Pairing Error in batch ${batchIndex + 1}:`, e);
      return [];
    }
  });

  const results = await runWithConcurrency(pairingTasks, 2);
  
  results.flat().forEach((p: any) => {
    if (p && p.dish && p.drinks) {
      allPairings.push(p);
    }
  });

  return allPairings;
}


