import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import it from './locales/it.json';
import en from './locales/en.json';

export const SUPPORTED_LANGUAGES = ['it', 'en'] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      it: { translation: it },
      en: { translation: en },
    },
    fallbackLng: 'it',
    supportedLngs: SUPPORTED_LANGUAGES as unknown as string[],
    nonExplicitSupportedLngs: true,
    interpolation: { escapeValue: false },
    detection: {
      // Ordine 28 mag 2026: cookie cross-subdomain ambrosia-lang ha priorità
      // su localStorage. Il cookie è scritto da QUALSIASI sito Ambrosia
      // (hub, winelist, experience, pAIrbuilder) → cambiare lingua su uno
      // riflette ovunque alla prossima visita.
      order: ['cookie', 'localStorage', 'navigator', 'htmlTag'],
      lookupCookie: 'ambrosia-lang',
      lookupLocalStorage: 'pairbuilder.lang',
      caches: ['cookie', 'localStorage'],
      // Domain con leading dot = condiviso tra tutti i subdomain
      // ambrosiavino.com. In locale (host non ambrosiavino) il browser
      // ignora l'attribute e cookie resta sull'host corrente — innocuo.
      cookieDomain: '.ambrosiavino.com',
      cookieMinutes: 60 * 24 * 365, // 1 anno
      cookieOptions: { path: '/', sameSite: 'lax' as const },
    },
    returnNull: false,
  });

// Attach the active i18n language to every /api request via X-App-Language.
// Server reads it (server/i18n.ts → getLang) to localize error messages and
// OpenAI system prompts. Idempotent — once installed, all fetches reflect
// language changes at runtime without any per-callsite plumbing.
if (typeof window !== 'undefined' && !(window as any).__pairbuilderFetchPatched) {
  (window as any).__pairbuilderFetchPatched = true;
  const originalFetch = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init: RequestInit = {}) => {
    let url = '';
    if (typeof input === 'string') url = input;
    else if (input instanceof URL) url = input.toString();
    else url = (input as Request).url || '';
    const isApi = url.startsWith('/api/') || url.includes('://') === false && url.startsWith('/api');
    if (!isApi) return originalFetch(input, init);
    const headers = new Headers(init.headers || (input instanceof Request ? input.headers : undefined));
    if (!headers.has('X-App-Language')) {
      const lang = (i18n.resolvedLanguage || i18n.language || 'it').split('-')[0];
      headers.set('X-App-Language', lang);
    }
    return originalFetch(input, { ...init, headers });
  };
}

export default i18n;
