import { useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { ChevronDown, Lock, ExternalLink } from "lucide-react";

interface PaywallProps {
  onRegister: () => void;
  onLogin: () => void;
}

const WINELIST_URL = "https://winelist.ambrosiavino.com";

export default function Paywall({ onRegister, onLogin }: PaywallProps) {
  const { t } = useTranslation();
  const [discoverOpen, setDiscoverOpen] = useState(false);

  const discoverItems = [
    t("paywall.discover.items.price"),
    t("paywall.discover.items.savedProfiles"),
    t("paywall.discover.items.analysis"),
    t("paywall.discover.items.history"),
    t("paywall.discover.items.support"),
  ];

  return (
    <section className="max-w-3xl mx-auto py-12 animate-in fade-in duration-300">
      <div className="glass-panel p-10 md:p-14 space-y-8 text-center border-brand-accent/30 bg-brand-accent/5">
        <div className="mx-auto w-20 h-20 rounded-full bg-brand-accent/10 border border-brand-accent/30 flex items-center justify-center">
          <Lock size={32} className="text-brand-accent" />
        </div>

        <div className="space-y-4">
          <h2 className="text-4xl md:text-5xl font-display uppercase tracking-tight font-normal">
            {t("paywall.title")}
          </h2>
          <p className="text-lg text-white/80 max-w-xl mx-auto">
            {t("paywall.subtitle")}
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-4 justify-center pt-2">
          <button
            onClick={onRegister}
            className="btn-primary text-base px-10 py-4"
          >
            {t("paywall.cta.register")}
          </button>
          <button
            onClick={onLogin}
            className="glass-panel px-10 py-4 hover:bg-white/10 transition-colors uppercase text-sm font-bold tracking-widest border-white/10"
          >
            {t("paywall.cta.login")}
          </button>
        </div>

        <div className="pt-2">
          <button
            onClick={() => setDiscoverOpen((v) => !v)}
            className="inline-flex items-center gap-2 text-brand-accent hover:underline text-xs font-bold uppercase tracking-widest"
            aria-expanded={discoverOpen}
          >
            {t("paywall.discoverMore")}
            <ChevronDown
              size={14}
              className={`transition-transform duration-300 ${discoverOpen ? "rotate-180" : ""}`}
            />
          </button>

          {discoverOpen && (
            <div className="mt-6 p-6 rounded-xl bg-white/5 border border-white/10 text-left space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
              <p className="text-xs uppercase tracking-widest text-brand-accent font-bold">
                {t("paywall.discover.heading")}
              </p>
              <ul className="space-y-3 text-sm text-white/80">
                {discoverItems.map((item, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="text-brand-accent mt-1">•</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      <div className="mt-10 text-center space-y-2 px-4">
        <p className="text-sm text-white/60">{t("paywall.ecosystem.lead")}</p>
        <p className="text-sm text-white/80">
          <Trans
            i18nKey="paywall.ecosystem.tryLine"
            components={{
              1: (
                <a
                  href={WINELIST_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-brand-accent font-bold hover:underline"
                >
                  Winelist
                  <ExternalLink size={12} />
                </a>
              ),
            }}
          />
        </p>
      </div>
    </section>
  );
}
