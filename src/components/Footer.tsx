import { useTranslation } from "react-i18next";
import { CheckCircle2 } from "lucide-react";

/**
 * Footer — chrome principale dell'app pAIrbuilder (variante minimal).
 *
 * Design system §4.2 (variante minimal app-style):
 *   - bg-brand-violet-dark (più scuro per distinguersi dall'header)
 *   - Grid 3-col: status AI engine SX | "BEVI DA DIO" centrale (Vina Sans peach) | copyright + legali DX
 *   - Niente lockup grande, niente lang toggle
 *
 * Link legali (privacy + termini) puntano all'hub ambrosiavino.com che è
 * la fonte unica di verità dei testi legali dell'ecosistema (decisione
 * 2026-05-28: niente duplicazione dei documenti GDPR tra i 4 sottodomini).
 *
 * "BEVI DA DIO" centrale segue il trattamento del lockup ecosistema
 * (Vina Sans, text-brand-peach, tracking-tight).
 *
 * Estratto da App.tsx (passata 3, sessione 2026-05-27).
 * Riferimento: AMBROSIA-DESIGN-SYSTEM-v1.md
 */
export interface FooterProps {
  configStatus: {
    visionApiKeyPresent: boolean;
    status: string;
    message: string;
  } | null;
}

export default function Footer({ configStatus }: FooterProps) {
  const { t, i18n } = useTranslation();

  // Lingua corrente i18next → URL legali coerenti hub
  // (it: /privacy + /termini, en: /en/privacy + /en/terms)
  const isItalian = i18n.language?.toLowerCase().startsWith('it');
  const privacyUrl = isItalian
    ? 'https://ambrosiavino.com/privacy'
    : 'https://ambrosiavino.com/en/privacy';
  const termsUrl = isItalian
    ? 'https://ambrosiavino.com/termini'
    : 'https://ambrosiavino.com/en/terms';

  return (
    <footer className="py-6 px-6 md:px-10 border-t border-white/10 grid grid-cols-3 items-center bg-brand-violet-dark">
      {/* SX: status AI engine */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 bg-ambrosia-teal rounded-full animate-pulse shadow-[0_0_8px_rgba(46,188,177,0.5)]"></span>
          <span className="text-[10px] uppercase tracking-widest opacity-70 hidden sm:inline">
            {t("app.footer.aiEngine")}
          </span>
        </div>
        {configStatus && (
          <div className="flex items-center gap-2 group cursor-help relative">
            <CheckCircle2 size={12} className="text-green-500" />
            <span className="text-[9px] uppercase tracking-tighter opacity-50 whitespace-nowrap">
              {t("app.footer.aiModeLabel", { status: configStatus.status })}
            </span>
            <div className="absolute bottom-full left-0 mb-2 invisible group-hover:visible glass-panel p-2 text-[10px] w-64 z-50 pointer-events-none">
              {configStatus.message}
            </div>
          </div>
        )}
      </div>

      {/* CENTRO: "BEVI DA DIO" lockup (coerente con Hub/Experience footer) */}
      <div className="text-center">
        <p className="text-3xl md:text-5xl font-normal tracking-tight text-brand-peach uppercase opacity-90 font-display whitespace-nowrap">
          {t("app.footer.tagline")}
        </p>
      </div>

      {/* DX: legali + copyright */}
      <div className="text-[10px] uppercase tracking-widest text-right flex flex-col items-end gap-1">
        <div className="flex gap-3 opacity-60">
          <a
            href={privacyUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-brand-peach hover:opacity-100 transition-colors"
          >
            {t("app.footer.privacy")}
          </a>
          <span aria-hidden="true">·</span>
          <a
            href={termsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-brand-peach hover:opacity-100 transition-colors"
          >
            {t("app.footer.terms")}
          </a>
        </div>
        <div className="opacity-40">
          {/* Anno dinamico (decisione 2026-05-28): evita di hardcodare il year e
              dover ricordarsi di bumparlo a fine dicembre. */}
          {t("app.footer.copyright", { year: new Date().getFullYear() })}
        </div>
      </div>
    </footer>
  );
}
