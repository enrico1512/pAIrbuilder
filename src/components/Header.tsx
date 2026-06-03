import { useTranslation } from "react-i18next";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { ChevronDown, User, Mail, LogOut, Settings } from "lucide-react";
import { useAuth } from "../lib/auth";
import LanguageSwitcher from "./LanguageSwitcher";
import type { InfoMode } from "./AboutSection";
import type { Step, RestaurantData } from "../App";

/**
 * Header — chrome principale dell'app pAIrbuilder.
 *
 * Design system §3.2 (variante minimal app-style):
 *   - h-16 lg:h-20 equivalente (py-6 + grid 3-col)
 *   - bg-brand-violet/80 backdrop-blur-sm, sticky top
 *   - Niente logo né nav-link (l'app è in-context)
 *   - LanguageSwitcher (pill outlined peach) + menu utente dropdown
 *
 * Estratto da App.tsx (passata 3, sessione 2026-05-27).
 * Riferimento: AMBROSIA-DESIGN-SYSTEM-v1.md
 */
export interface HeaderProps {
  restaurantData: RestaurantData;
  step: Step;
  setStep: (s: Step) => void;
  setInfoMode: (mode: InfoMode) => void;
  setPreviousStep: (s: Step) => void;
  openAuthModal: (tab: "login" | "register") => void;
  handleLogout: () => void;
}

export default function Header({
  restaurantData,
  step,
  setStep,
  setInfoMode,
  setPreviousStep,
  openAuthModal,
  handleLogout,
}: HeaderProps) {
  const { t } = useTranslation();
  const auth = useAuth();

  const goToInfo = (mode: InfoMode) => {
    setInfoMode(mode);
    setPreviousStep(step);
    setStep("about");
  };

  // In modalità ospite non esiste un ristorante reale: mostrare un nome
  // placeholder ("L'Osteria") sembrerebbe un dato vero, quindi nascondiamo
  // del tutto il blocco finché non c'è un nome effettivo.
  const restaurantName = restaurantData?.name || auth.restaurant?.name;

  return (
    <header className="grid grid-cols-3 items-center px-6 md:px-10 py-6 border-b border-white/10 z-10 bg-brand-violet/80 backdrop-blur-sm sticky top-0">
      {/* SX: label ristorante (visibile da lg, solo se c'è un ristorante reale) */}
      <div className="flex items-center gap-4">
        {restaurantName && (
          <div className="text-left hidden lg:block">
            <p className="text-[10px] uppercase tracking-widest opacity-60">
              {t("app.header.restaurantLabel")}
            </p>
            <p className="text-sm font-bold truncate max-w-[150px]">
              {restaurantName}
            </p>
          </div>
        )}
      </div>

      {/* CENTRO: riservato (oggi vuoto) */}
      <div className="text-center invisible md:visible opacity-0 pointer-events-none">
        {/* Title removed as requested */}
      </div>

      {/* DX: lang + menu utente */}
      <div className="flex justify-end items-center gap-4">
        <LanguageSwitcher />
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <button className="flex items-center gap-2 bg-white/5 hover:bg-white/10 px-4 py-2 rounded-full transition-colors border border-white/10 outline-none">
              <User size={18} className="text-brand-peach" />
              <span className="text-xs font-bold uppercase tracking-widest hidden sm:inline">
                {t("app.header.menuTrigger")}
              </span>
              <ChevronDown size={14} className="opacity-50" />
            </button>
          </DropdownMenu.Trigger>

          <DropdownMenu.Portal>
            <DropdownMenu.Content
              className="glass-panel min-w-[200px] p-2 mt-2 z-50 animate-in fade-in zoom-in-95 duration-200"
              align="end"
            >
              <DropdownMenu.Item
                onClick={() => goToInfo("about-us")}
                className="flex items-center gap-3 px-4 py-3 text-sm text-white/80 hover:text-white hover:bg-white/5 rounded-lg outline-none cursor-pointer transition-colors"
              >
                <img src="/logo-a.svg" alt="" className="w-4 h-4 shrink-0" />
                <span>{t("app.dropdown.aboutUs")}</span>
              </DropdownMenu.Item>
              <DropdownMenu.Item
                onClick={() => goToInfo("how-it-works")}
                className="flex items-center gap-3 px-4 py-3 text-sm text-white/80 hover:text-white hover:bg-white/5 rounded-lg outline-none cursor-pointer transition-colors"
              >
                <span className="text-brand-peach font-display text-base font-normal tracking-tight leading-none w-4 h-4 flex items-center justify-center shrink-0">
                  AI
                </span>
                <span>{t("app.dropdown.howItWorks")}</span>
              </DropdownMenu.Item>
              <DropdownMenu.Item
                onClick={() => goToInfo("contact")}
                className="flex items-center gap-3 px-4 py-3 text-sm text-white/80 hover:text-white hover:bg-white/5 rounded-lg outline-none cursor-pointer transition-colors"
              >
                <Mail size={16} className="text-brand-peach" />
                <span>{t("app.dropdown.contact")}</span>
              </DropdownMenu.Item>
              {/* Crosslink al hub principale (28 mag 2026, feedback UX Enrico):
                  apre ambrosiavino.com in nuova tab — coerente con il pattern
                  navbar di winelist + experience. */}
              <DropdownMenu.Item asChild>
                <a
                  href="https://ambrosiavino.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 px-4 py-3 text-sm text-white/80 hover:text-white hover:bg-white/5 rounded-lg outline-none cursor-pointer transition-colors"
                >
                  <img src="/logo-a.svg" alt="" className="w-4 h-4 shrink-0" />
                  <span>Ambrosiavino</span>
                </a>
              </DropdownMenu.Item>
              <DropdownMenu.Separator className="h-px bg-white/10 my-2" />
              {auth.user ? (
                <>
                  <div className="px-4 py-2 text-[10px] uppercase tracking-widest text-white/40">
                    {t("auth.menu.loggedAs", {
                      name: auth.restaurant?.name || auth.user.email,
                    })}
                  </div>
                  <DropdownMenu.Item
                    onClick={handleLogout}
                    className="flex items-center gap-3 px-4 py-3 text-sm text-red-400 hover:bg-red-500/10 rounded-lg outline-none cursor-pointer transition-colors mt-1"
                  >
                    <LogOut size={16} />
                    <span>{t("auth.menu.logout")}</span>
                  </DropdownMenu.Item>
                </>
              ) : (
                <>
                  <DropdownMenu.Item
                    onClick={() => openAuthModal("login")}
                    className="flex items-center gap-3 px-4 py-3 text-sm text-white/80 hover:text-white hover:bg-white/5 rounded-lg outline-none cursor-pointer transition-colors"
                  >
                    <User size={16} className="text-brand-peach" />
                    <span>{t("auth.menu.loginEntry")}</span>
                  </DropdownMenu.Item>
                  <DropdownMenu.Item
                    onClick={() => openAuthModal("register")}
                    className="flex items-center gap-3 px-4 py-3 text-sm text-brand-peach hover:bg-brand-peach/10 rounded-lg outline-none cursor-pointer transition-colors"
                  >
                    <Settings size={16} />
                    <span>{t("auth.menu.registerEntry")}</span>
                  </DropdownMenu.Item>
                </>
              )}
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>
    </header>
  );
}
