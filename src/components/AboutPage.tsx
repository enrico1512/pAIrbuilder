import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../lib/auth";
import Header from "./Header";
import Footer from "./Footer";
import AboutSection, { type InfoMode } from "./AboutSection";
import AuthModal from "./AuthModal";

/**
 * AboutPage — pagina pubblica standalone che renderizza AboutSection
 * fuori dal flusso app (welcome → restaurant → upload → ...).
 *
 * Usata dalle route pubbliche di pAIrbuilder per esporre i contenuti
 * informativi come pagine indipendenti, SEO-friendly e linkabili:
 *   /come-funziona  (IT)  /how-it-works  (EN)  → mode="how-it-works"
 *   /chi-siamo      (IT)  /about-us      (EN)  → mode="about-us"
 *   /contatti       (IT)  /contact       (EN)  → mode="contact"
 *
 * Riusa lo stesso <AboutSection /> del menu utente in-app: una sola
 * fonte di copy (i18n locales), zero duplicazione.
 *
 * Riferimento: AMBROSIA-DESIGN-SYSTEM-v1.md sez. 9.1 step 5 (Opzione A).
 */
export interface AboutPageProps {
  mode: InfoMode;
}

// Slug map per navigare tra le 3 info pages mantenendo la lingua corrente.
// Quando l'utente clicca "About us / How it works / Contact" dal menu utente
// in Header, navighiamo via URL (page reload) invece di cambiare state
// (perché in standalone non esiste lo "step" dell'app).
function slugForMode(mode: InfoMode, lang: string): string {
  const isIT = lang.startsWith("it");
  if (isIT) {
    return mode === "how-it-works"
      ? "/come-funziona"
      : mode === "about-us"
        ? "/chi-siamo"
        : "/contatti";
  }
  return mode === "how-it-works"
    ? "/how-it-works"
    : mode === "about-us"
      ? "/about-us"
      : "/contact";
}

// Lingua coerente con il path: atterrando su un URL EN, forziamo i18n a EN
// (e viceversa per IT). Sovrascrive il LanguageDetector di i18next che legge
// solo da localStorage/navigator (vedi src/i18n/index.ts).
function syncLangFromPath(pathname: string, current: string, change: (lng: string) => void) {
  const isEnPath = pathname === "/how-it-works" || pathname === "/about-us" || pathname === "/contact";
  const isItPath = pathname === "/come-funziona" || pathname === "/chi-siamo" || pathname === "/contatti";
  const target = isEnPath ? "en" : isItPath ? "it" : null;
  if (target && !current.startsWith(target)) {
    void change(target);
  }
}

export default function AboutPage({ mode }: AboutPageProps) {
  const { i18n } = useTranslation();
  const auth = useAuth();
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authModalTab, setAuthModalTab] = useState<"login" | "register">("register");

  useEffect(() => {
    syncLangFromPath(
      window.location.pathname,
      i18n.language || "it",
      (lng) => { void i18n.changeLanguage(lng); }
    );
    // mode non rilevante: il sync va fatto al mount in base all'URL.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openAuthModal = (tab: "login" | "register") => {
    setAuthModalTab(tab);
    setAuthModalOpen(true);
  };

  const handleLogout = async () => {
    try {
      await auth.logout();
    } catch { /* no-op */ }
    window.location.href = "/";
  };

  // Navigazione tra info pages via URL: il menu utente di Header chiama
  // setInfoMode(newMode). In standalone non c'è uno "step" da cambiare,
  // ridirigiamo all'URL corrispondente.
  const navigateToInfo = (newMode: InfoMode) => {
    const target = slugForMode(newMode, i18n.language || "it");
    if (window.location.pathname !== target) {
      window.location.href = target;
    }
  };

  // setStep("welcome") dal menu utente o da onBack → torna alla home dell'app.
  const goHome = () => {
    window.location.href = "/";
  };

  return (
    <div className="min-h-screen flex flex-col overflow-x-hidden bg-brand-violet text-white selection:bg-brand-peach selection:text-brand-violet">
      <Header
        restaurantData={null}
        step="about"
        setStep={(s) => { if (s !== "about") goHome(); }}
        setInfoMode={navigateToInfo}
        setPreviousStep={() => { /* no-op in standalone */ }}
        openAuthModal={openAuthModal}
        handleLogout={handleLogout}
      />

      <main className="flex-1 px-6 md:px-10 py-12 overflow-y-auto">
        <AboutSection mode={mode} onBack={goHome} />
      </main>

      <Footer configStatus={null} />

      <AuthModal
        open={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        initialTab={authModalTab}
      />
    </div>
  );
}
