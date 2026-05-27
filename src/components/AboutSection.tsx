import { motion, AnimatePresence } from "motion/react";
import { Mail, Wine, Utensils, Zap, Sparkles, MessageSquare, Phone, ChevronLeft, Globe, BrainCircuit, Users, Smartphone, MessageCircle, Scale, Contrast } from "lucide-react";
import { Trans, useTranslation } from "react-i18next";

export type InfoMode = "how-it-works" | "about-us" | "contact";

interface AboutSectionProps {
  mode: InfoMode;
  onBack: () => void;
}

export default function AboutSection({ mode, onBack }: AboutSectionProps) {
  const { t } = useTranslation();
  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="max-w-4xl mx-auto space-y-12 pb-20"
    >
      <button
        onClick={onBack}
        className="flex items-center gap-2 text-brand-accent hover:opacity-80 transition-opacity uppercase text-xs tracking-widest font-bold mb-8"
      >
        <ChevronLeft size={16} />
        {t('about.back')}
      </button>

      {mode === "how-it-works" && <HowItWorksContent />}
      {mode === "about-us" && <AboutUsContent />}
      {mode === "contact" && <ContactContent />}
    </motion.div>
  );
}

function HowItWorksContent() {
  const { t } = useTranslation();
  return (
    <div className="space-y-12">
      <section className="space-y-4">
        <h1 className="text-5xl md:text-7xl font-display uppercase tracking-tight text-brand-accent leading-none font-normal">
          <Trans i18nKey="about.howItWorks.title" components={{ 1: <br />, 2: <span className="text-white" /> }} />
        </h1>
        <p className="text-xl text-white/80 font-light leading-relaxed max-w-2xl">
          {t('about.howItWorks.subtitle')}
        </p>
      </section>

      <section className="space-y-12 pt-8">
        <div className="glass-panel p-8 md:p-12 bg-brand-accent/5 border border-brand-accent/20 rounded-[2rem]">
          <div className="grid md:grid-cols-2 gap-12">
            <div className="space-y-6">
              <div className="flex items-center gap-3 text-brand-accent">
                <img src="/logo-a.svg" alt="" className="w-7 h-7 shrink-0" />
                <h2 className="text-3xl font-display uppercase text-white font-normal tracking-tight">{t('about.howItWorks.molecularBalance.heading')}</h2>
              </div>
              <div className="space-y-4 text-white/80 leading-relaxed">
                <p>
                  <Trans i18nKey="about.howItWorks.molecularBalance.p1" components={{ 1: <strong /> }} />
                </p>
                <p>
                  <Trans i18nKey="about.howItWorks.molecularBalance.p2" components={{ 1: <strong /> }} />
                </p>
              </div>
            </div>

            <div className="space-y-6">
              <div className="bg-white/5 p-6 rounded-2xl border border-white/10">
                <ul className="space-y-6 list-none">
                  <li className="flex gap-4">
                    <div className="flex items-center justify-center shrink-0">
                      <Scale className="text-brand-accent" size={24} />
                    </div>
                    <div>
                      <p className="font-bold text-white uppercase text-xs tracking-wider mb-1">{t('about.howItWorks.concordance.label')}</p>
                      <p className="text-xs text-white/80">{t('about.howItWorks.concordance.description')}</p>
                    </div>
                  </li>
                  <li className="flex gap-4">
                    <div className="flex items-center justify-center shrink-0">
                      <Contrast className="text-brand-accent" size={24} />
                    </div>
                    <div>
                      <p className="font-bold text-white uppercase text-xs tracking-wider mb-1">{t('about.howItWorks.contrast.label')}</p>
                      <p className="text-xs text-white/80">{t('about.howItWorks.contrast.description')}</p>
                    </div>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-12 items-center">
          <div className="space-y-6">
            <div className="flex items-center gap-3 text-brand-accent">
              <Utensils size={24} />
              <h2 className="text-2xl font-display uppercase text-white font-normal tracking-tight">{t('about.howItWorks.professionalOutput.heading')}</h2>
            </div>
            <div className="space-y-4 text-white/80">
              <p>
                <Trans i18nKey="about.howItWorks.professionalOutput.paragraph" components={{ 1: <strong /> }} />
              </p>
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-white/5 rounded-xl border border-white/5">
                  <p className="text-[11px] leading-tight text-white/70">{t('about.howItWorks.professionalOutput.pill1')}</p>
                </div>
                <div className="p-4 bg-white/5 rounded-xl border border-white/5">
                  <p className="text-[11px] leading-tight text-white/70">{t('about.howItWorks.professionalOutput.pill2')}</p>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="flex items-center gap-3 text-brand-accent">
              <Sparkles size={24} />
              <h2 className="text-2xl font-display uppercase text-white font-normal tracking-tight">{t('about.howItWorks.priorityIntelligence.heading')}</h2>
            </div>
            <div className="space-y-4 text-white/80 leading-relaxed">
              <p>
                <Trans i18nKey="about.howItWorks.priorityIntelligence.p1" components={{ 1: <strong /> }} />
              </p>
              <p>{t('about.howItWorks.priorityIntelligence.p2')}</p>
            </div>
          </div>
        </div>
      </section>

      {/* AMBROSIAVINO FUNNEL CALL TO ACTION */}
      <section className="mt-20 p-12 rounded-[2rem] bg-gradient-to-br from-brand-accent/20 to-transparent border border-brand-accent/30 text-center space-y-8">
        <div className="flex justify-center mb-4">
          <img
            src="/logo-ambrosiavino.svg"
            alt="Ambrosiavino"
            className="h-20 md:h-24 w-auto"
          />
        </div>
        <div className="space-y-4 max-w-2xl mx-auto">
          <h2 className="text-3xl md:text-5xl font-display uppercase tracking-tight font-normal">{t('about.howItWorks.cta.title')}</h2>
          <p className="text-lg text-white/80">
            <Trans i18nKey="about.howItWorks.cta.description" components={{ 1: <strong /> }} />
          </p>
        </div>
        <div className="flex flex-col items-center gap-4">
          <a
            href="https://www.ambrosiavino.com"
            target="_blank"
            rel="noopener noreferrer"
            className="btn-primary flex items-center gap-3 px-10 py-5 text-lg group"
          >
            {t('about.howItWorks.cta.button')}
            <img src="/logo-a.svg" alt="" className="w-6 h-6 group-hover:rotate-12 transition-transform" />
          </a>
          <p className="text-xs uppercase tracking-widest opacity-40 font-bold">{t('about.howItWorks.cta.tagline')}</p>
        </div>
      </section>
    </div>
  );
}

function AboutUsContent() {
  const { t } = useTranslation();
  return (
    <div className="space-y-12">
      <section className="space-y-4">
        <h1 className="text-5xl md:text-7xl font-display uppercase tracking-tight text-brand-accent leading-none font-normal">
          <Trans i18nKey="about.aboutUs.title" components={{ 1: <br />, 2: <span className="text-white" /> }} />
        </h1>
        <p className="text-xl text-white/80 font-light leading-relaxed max-w-2xl">
          {t('about.aboutUs.subtitle')}
        </p>
      </section>

      <section className="grid md:grid-cols-2 gap-12 pt-8">
        <div className="space-y-6">
          <div className="flex items-center gap-3 text-brand-accent">
            <BrainCircuit size={24} />
            <h2 className="text-2xl font-display uppercase text-white font-normal tracking-tight">{t('about.aboutUs.beyondCode.heading')}</h2>
          </div>
          <div className="space-y-4 text-white/80 leading-relaxed">
            <p>
              <Trans i18nKey="about.aboutUs.beyondCode.p1" components={{ 1: <strong /> }} />
            </p>
            <p>{t('about.aboutUs.beyondCode.p2')}</p>
          </div>
        </div>

        <div className="space-y-6">
          <div className="flex items-center gap-3 text-brand-accent">
            <Users size={24} />
            <h2 className="text-2xl font-display uppercase text-white font-normal tracking-tight">{t('about.aboutUs.team.heading')}</h2>
          </div>
          <div className="space-y-4 text-white/80 leading-relaxed">
            <p>
              <Trans i18nKey="about.aboutUs.team.p1" components={{ 1: <strong />, 3: <strong /> }} />
            </p>
            <p>
              <Trans i18nKey="about.aboutUs.team.p2" components={{ 1: <strong /> }} />
            </p>
          </div>
        </div>
      </section>

      <section className="space-y-8 mt-12">
        <div className="flex items-center gap-3 text-brand-accent">
          <Globe size={24} />
          <h2 className="text-2xl font-display uppercase text-white font-normal tracking-tight">{t('about.aboutUs.ecosystem.heading')}</h2>
        </div>

        <div className="grid md:grid-cols-2 gap-8">
          {/* Ambrosiavino Card */}
          <div className="glass-panel p-8 space-y-6 border-l-4 border-l-brand-accent bg-brand-accent/5 relative overflow-hidden flex flex-col">
            <div className="absolute -right-4 -top-4 w-24 h-24 opacity-10 rotate-12">
              <img
                src="https://images.unsplash.com/photo-1510812431401-41d2bd2722f3?q=80&w=200&auto=format&fit=crop"
                alt="Ambrosia Icon"
                className="w-full h-full object-contain filter brightness-0 invert"
              />
            </div>
            <div className="space-y-4 relative z-10 flex-grow">
              <div className="space-y-2">
                <h3 className="font-display text-2xl uppercase tracking-tight text-brand-accent font-normal">Ambrosiavino</h3>
                <p className="text-sm text-white/90 leading-relaxed">
                  <Trans i18nKey="about.aboutUs.ecosystem.ambrosiavinoDescription" components={{ 1: <strong /> }} />
                </p>
              </div>
            </div>
            <a
              href="https://www.ambrosiavino.com"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 bg-brand-accent text-brand-bg px-6 py-3 rounded-full text-xs font-bold uppercase tracking-widest hover:scale-105 transition-transform relative z-10"
            >
              {t('about.aboutUs.ecosystem.ambrosiavinoLink')}
            </a>
          </div>

          {/* Dionisus AI Card */}
          <div className="glass-panel p-8 space-y-6 border-l-4 border-l-brand-accent bg-brand-accent/5 relative overflow-hidden flex flex-col">
            <div className="absolute -right-4 -top-4 w-24 h-24 opacity-10 rotate-12 text-white">
              <BrainCircuit size={80} />
            </div>
            <div className="space-y-4 relative z-10 flex-grow">
              <div className="space-y-2">
                <h3 className="font-display text-2xl uppercase tracking-tight text-brand-accent font-normal">Dionisus.ai</h3>
                <p className="text-sm text-white/90 leading-relaxed">
                  <Trans i18nKey="about.aboutUs.ecosystem.dionisusDescription" components={{ 1: <strong /> }} />
                </p>
              </div>
            </div>
            <a
              href="https://www.dionisus.ai"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 bg-brand-accent text-brand-bg px-6 py-3 rounded-full text-xs font-bold uppercase tracking-widest hover:scale-105 transition-transform relative z-10"
            >
              {t('about.aboutUs.ecosystem.dionisusLink')}
            </a>
          </div>
        </div>

        <p className="text-sm text-white/80 max-w-2xl">{t('about.aboutUs.ecosystem.footer')}</p>
      </section>
    </div>
  );
}

function ContactContent() {
  const { t } = useTranslation();
  return (
    <div className="space-y-12">
      <section className="space-y-4">
        <h1 className="text-5xl md:text-7xl font-display uppercase tracking-tight text-white leading-none font-normal">
          <Trans i18nKey="about.contact.title" components={{ 1: <br />, 2: <span className="text-brand-accent" /> }} />
        </h1>
        <p className="text-xl text-white/80 font-light leading-relaxed max-w-2xl">
          {t('about.contact.subtitle')}
        </p>
      </section>

      <section className="glass-panel p-12 space-y-8 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-80 bg-brand-accent/5 blur-3xl rounded-full -mr-40 -mt-40"></div>

        <div className="grid md:grid-cols-2 gap-12 relative z-10">
          <div className="space-y-8">
            <div className="space-y-4">
              <h2 className="text-2xl font-display uppercase font-normal tracking-tight">{t('about.contact.hq.heading')}</h2>
              <p className="text-white/80 leading-relaxed">
                <Trans i18nKey="about.contact.hq.description" components={{ 1: <br /> }} />
              </p>
            </div>
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="text-brand-accent">
                  <Mail size={32} />
                </div>
                <div className="flex flex-col">
                  <a href="mailto:hello@pairbuilder.com" className="text-xl font-medium hover:text-brand-accent transition-colors">
                    hello@pairbuilder.com
                  </a>
                  <a href="mailto:hello@ambrosiavino.com" className="text-sm opacity-60 hover:text-brand-accent transition-colors">
                    hello@ambrosiavino.com
                  </a>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-brand-accent">
                  <MessageCircle size={32} />
                </div>
                <a href="https://wa.me/393282694406" target="_blank" rel="noopener noreferrer" className="text-xl font-medium hover:text-green-500 transition-colors">
                  WhatsApp
                </a>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="flex items-center gap-4 border-b border-white/5 pb-6">
              <div><MessageSquare size={32} className="text-brand-accent" /></div>
              <div>
                <p className="text-xs uppercase opacity-40 font-bold">{t('about.contact.feedback.label')}</p>
                <p className="text-sm">{t('about.contact.feedback.description')}</p>
              </div>
            </div>
            <div className="flex items-center gap-4 border-b border-white/5 pb-6">
              <div><BrainCircuit size={32} className="text-brand-accent" /></div>
              <div>
                <p className="text-xs uppercase opacity-40 font-bold">{t('about.contact.development.label')}</p>
                <p className="text-sm">{t('about.contact.development.description')}</p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
