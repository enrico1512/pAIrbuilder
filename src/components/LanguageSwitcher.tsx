import { useTranslation } from "react-i18next";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Check, Languages } from "lucide-react";
import { SUPPORTED_LANGUAGES, type SupportedLanguage } from "../i18n";
import { useAuth } from "../lib/auth";

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
          className="flex items-center gap-2 bg-white/5 hover:bg-white/10 px-3 py-2 rounded-full transition-colors border border-white/10 outline-none"
        >
          <Languages size={16} className="text-brand-accent" />
          <span className="text-xs font-bold uppercase tracking-widest">{current}</span>
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
                <span className="text-[10px] font-bold uppercase tracking-widest text-brand-accent w-6">{lng}</span>
                <span>{t('common.language.' + lng)}</span>
              </span>
              {lng === current && <Check size={14} className="text-brand-accent" />}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
