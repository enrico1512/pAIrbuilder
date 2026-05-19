import type { SupportedLanguage } from './index';

const BCP47_BY_LANG: Record<SupportedLanguage, string> = {
  it: 'it-IT',
  en: 'en-US',
};

const CURRENCY_BY_LANG: Record<SupportedLanguage, string> = {
  it: '€',
  en: '$',
};

export function toBcp47(lang: string): string {
  const short = lang.split('-')[0].toLowerCase() as SupportedLanguage;
  return BCP47_BY_LANG[short] ?? 'it-IT';
}

export function currencyFor(lang: string): string {
  const short = lang.split('-')[0].toLowerCase() as SupportedLanguage;
  return CURRENCY_BY_LANG[short] ?? '€';
}
