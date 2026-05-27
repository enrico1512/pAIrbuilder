import { useTranslation } from "react-i18next";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Check, Languages } from "lucide-react";
import { SUPPORTED_LANGUAGES, type SupportedLanguage } from "../i18n";
import { useAuth } from "../lib/auth";

/**
 * LanguageSwitcher — pill outlined peach, design system §3.3.
 *
 * Stile canonico condiviso con Hub, Experience, Winelist:
 *   - border peach/30 hover peach
 *   - font-display uppercase tracking-[0.25em] text-xs
 *   - text peach/80 hover peach
 *
 * Su pAIrbuilder mantiene il dropdown (Radix) perché supporta multi-lingua,
 * mentre Hub/Experience/Winelist hanno un toggle 2-lingue. Il pattern
 * dropdown è la predisposizione futura quando l'ecosistema avrà FR/DE/ES.
 */
export default function LanguageSwitcher() {
  const { i18n, t } = useTranslation();
  const { user } = useAuth();

  const current = (i18n.resolvedLanguage || i18n.language || 'it').split('-')[0] as SupportedLanguage;

  const change = (lng: SupportedLanguage) => {
    if (lng === current) return;
    void i18n.changeLanguage(lng);
    // If the user is logged in, persist the choice to the DB so it follows
    // them across browsers/devices. Fire-and-forget — UI updates immediately
    // regardless of the network round-trip.
    if (user) {
      void fetch('/api/auth/preferred-language', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ language: lng }),
      }).catch(() => { /* non-blocking */ });
    }
  };

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          aria-label={t('common.language.' + current)}
          className="inline-flex items-center gap-2 border border-brand-peach/30 hover:border-brand-peach px-3 py-1 rounded-full font-display uppercase tracking-[0.25em] text-xs text-brand-peach/80 hover:text-brand-peach transition-colors outline-none"
        >
          <Languages size={14} className="text-brand-peach/80" />
          <span>{current}</span>
        </button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className="glass-panel min-w-[160px] p-2 mt-2 z-50 animate-in fade-in zoom-in-95 duration-200"
          align="end"
        >
          {SUPPORTED_LANGUAGES.map((lng) => (
            <DropdownMenu.Item
              key={lng}
              onClick={() => change(lng)}
              className="flex items-center justify-between gap-3 px-4 py-2 text-sm text-white/80 hover:text-white hover:bg-white/5 rounded-lg outline-none cursor-pointer transition-colors"
            >
              <span className="flex items-center gap-3">
                <span className="font-display text-[10px] font-bold uppercase tracking-[0.25em] text-brand-peach w-6">{lng}</span>
                <span>{t('common.language.' + lng)}</span>
              </span>
              {lng === current && <Check size={14} className="text-brand-peach" />}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
