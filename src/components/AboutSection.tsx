import { motion, AnimatePresence } from "motion/react";
import { Mail, Wine, Utensils, Zap, Sparkles, MessageSquare, Phone, ChevronLeft, Globe, BrainCircuit, Users, Smartphone, MessageCircle, Scale, Contrast } from "lucide-react";
import { FlashIcon } from "./FlashIcon";

export type InfoMode = "how-it-works" | "about-us" | "contact";

interface AboutSectionProps {
  mode: InfoMode;
  onBack: () => void;
}

export default function AboutSection({ mode, onBack }: AboutSectionProps) {
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
        Torna indietro
      </button>

      {mode === "how-it-works" && <HowItWorksContent />}
      {mode === "about-us" && <AboutUsContent />}
      {mode === "contact" && <ContactContent />}

      <footer className="text-center pt-8 opacity-30 text-[10px] uppercase tracking-[0.4em]">
        © 2024 Dionisus AI Digital Ecosystem
      </footer>
    </motion.div>
  );
}

function HowItWorksContent() {
  return (
    <div className="space-y-12">
      <section className="space-y-4">
        <h1 className="text-5xl md:text-7xl font-display uppercase tracking-tight text-brand-accent leading-none font-normal">
          L'Algoritmo <br /><span className="text-white">Del Gusto</span>
        </h1>
        <p className="text-xl text-white/80 font-light leading-relaxed max-w-2xl">
          PAIRBUILDER non si limita a leggere i dati. Interpreta l'anima del tuo menu per creare connessioni sensoriali che fino a ieri erano riservate ai piu grandi Sommelier.
        </p>
      </section>

      <section className="space-y-12 pt-8">
        <div className="glass-panel p-8 md:p-12 bg-brand-accent/5 border border-brand-accent/20 rounded-[2rem]">
          <div className="grid md:grid-cols-2 gap-12">
            <div className="space-y-6">
              <div className="flex items-center gap-3 text-orange-500">
                <FlashIcon size={24} />
                <h2 className="text-3xl font-display uppercase text-white font-normal tracking-tight">Equilibrio Molecolare</h2>
              </div>
              <div className="space-y-4 text-white/80 leading-relaxed">
                <p>
                  Dionisus AI esegue una <strong>scansione bio-aromatica</strong>. Ogni ingrediente viene scomposto nei suoi descrittori chimici: grassezza, tendenza acida, sapidita, succulenza e persistenza.
                </p>
                <p>
                  Contemporaneamente, analizziamo la tua cantina de-strutturando ogni etichetta in base a corpo, tannino, alcolicita e residuo zuccherino. L'algoritmo non cerca solo un nome simile, ma calcola la <strong>compensazione fisica</strong> tra cibo e vino.
                </p>
              </div>
            </div>

            <div className="space-y-6">
              <div className="bg-white/5 p-6 rounded-2xl border border-white/10">
                <ul className="space-y-6 list-none">
                  <li className="flex gap-4">
                    <div className="flex items-center justify-center shrink-0">
                      <Scale className="text-orange-500" size={24} />
                    </div>
                    <div>
                      <p className="font-bold text-white uppercase text-xs tracking-wider mb-1">CONCORDANZA</p>
                      <p className="text-xs text-white/80">L'AI allinea le intensita. Un piatto strutturato richiede un vino di corpo. Un dessert dolce richiede un vino con piu zucchero.</p>
                    </div>
                  </li>
                  <li className="flex gap-4">
                    <div className="flex items-center justify-center shrink-0">
                      <Contrast className="text-orange-500" size={24} />
                    </div>
                    <div>
                      <p className="font-bold text-white uppercase text-xs tracking-wider mb-1">CONTRASTO</p>
                      <p className="text-xs text-white/80">L'AI pulisce il palato. La sapidita del vino contrasta la grassezza del cibo. L'acidita taglia l'untuosita, resettando le papille ad ogni morso.</p>
                    </div>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-12 items-center">
          <div className="space-y-6">
            <div className="flex items-center gap-3 text-orange-500">
              <Utensils size={24} />
              <h2 className="text-2xl font-display uppercase text-white font-normal tracking-tight">Output Professionale</h2>
            </div>
            <div className="space-y-4 text-white/80">
              <p>
                Dalla teoria alla tavola. Il sistema genera istantaneamente un <strong>documento PDF elegante</strong> pronto per essere presentato ai tuoi ospiti come un inserto speciale della tua carta.
              </p>
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-white/5 rounded-xl border border-white/5">
                  <p className="text-[11px] leading-tight text-white/70">Cambio menu in pochi secondi, non ore.</p>
                </div>
                <div className="p-4 bg-white/5 rounded-xl border border-white/5">
                  <p className="text-[11px] leading-tight text-white/70">Upselling guidato da basi scientifiche.</p>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="flex items-center gap-3 text-orange-500">
              <Sparkles size={24} />
              <h2 className="text-2xl font-display uppercase text-white font-normal tracking-tight">Priority Intelligence</h2>
            </div>
            <div className="space-y-4 text-white/80 leading-relaxed">
              <p>
                I tuoi obiettivi commerciali sono parte del nostro codice. Grazie al sistema <strong>Priority Management</strong>, puoi guidare l'AI.
              </p>
              <p>
                Segnalando le tue bottiglie strategiche (novita, stock o referenze premium), l'algoritmo cerchera per priorita il miglior abbinamento possibile tra queste scelte.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* AMBROSIAVINO FUNNEL CALL TO ACTION */}
      <section className="mt-20 p-12 rounded-[2rem] bg-gradient-to-br from-brand-accent/20 to-transparent border border-brand-accent/30 text-center space-y-8">
        <div className="flex justify-center mb-4">
          <div className="w-20 h-20 bg-white/10 rounded-full p-4 flex items-center justify-center">
            <img 
              src="https://images.unsplash.com/photo-1510812431401-41d2bd2722f3?q=80&w=200&auto=format&fit=crop" 
              alt="Ambrosiavino Logo" 
              className="w-full h-full object-contain filter brightness-0 invert opacity-80"
            />
          </div>
        </div>
        <div className="space-y-4 max-w-2xl mx-auto">
          <h2 className="text-3xl md:text-5xl font-display uppercase tracking-tight font-normal">Vuoi automatizzare l'esperienza?</h2>
          <p className="text-lg text-white/80">
            PAIRBUILDER e lo strumento perfetto per i tuoi abbinamenti stampabili. 
            Ma se desideri una <strong>Carta Vini Digitale</strong> interattiva che venda da sola, scopri Ambrosiavino.
          </p>
        </div>
        <div className="flex flex-col items-center gap-4">
          <a 
            href="https://www.ambrosiavino.com" 
            target="_blank" 
            rel="noopener noreferrer"
            className="btn-primary flex items-center gap-3 px-10 py-5 text-lg group"
          >
            Passa ad Ambrosiavino
            <Globe className="group-hover:rotate-12 transition-transform" />
          </a>
          <p className="text-xs uppercase tracking-widest opacity-40 font-bold">L'evoluzione professionale del tuo beverage design</p>
        </div>
      </section>
    </div>
  );
}

function AboutUsContent() {
  return (
    <div className="space-y-12">
      <section className="space-y-4">
        <h1 className="text-5xl md:text-7xl font-display uppercase tracking-tight text-brand-accent leading-none font-normal">
          Dionisus <br /><span className="text-white">AI Ecosystem</span>
        </h1>
        <p className="text-xl text-white/80 font-light leading-relaxed max-w-2xl">
          Siamo i pionieri dell'Intelligenza Artificiale applicata al mondo del Food & Beverage. Trasformiamo i dati in emozioni e il servizio in eccellenza operativa.
        </p>
      </section>

      <section className="grid md:grid-cols-2 gap-12 pt-8">
        <div className="space-y-6">
          <div className="flex items-center gap-3 text-orange-500">
            <BrainCircuit size={24} />
            <h2 className="text-2xl font-display uppercase text-white font-normal tracking-tight">Oltre il Codice</h2>
          </div>
          <div className="space-y-4 text-white/80 leading-relaxed">
            <p>
              L'ecosistema <strong>Dionisus AI</strong> nasce dalla visione di unire l'antica tradizione dell'accoglienza con le frontiere dell'intelligenza evoluta. Non creiamo semplici software, ma collaboratori digitali che aumentano esponenzialmente le capacita dei professionisti.
            </p>
            <p>
              La missione e abbattere le barriere tra tecnologia e gusto, rendendo l'alta sommelierie accessibile e scalabile per ogni realta della ristorazione moderna.
            </p>
          </div>
        </div>

        <div className="space-y-6">
          <div className="flex items-center gap-3 text-orange-500">
            <Users size={24} />
            <h2 className="text-2xl font-display uppercase text-white font-normal tracking-tight">Il Nostro Team</h2>
          </div>
          <div className="space-y-4 text-white/80 leading-relaxed">
            <p>
              Siamo un gruppo multidisciplinare dove l'<strong>eccellenza enologica</strong> incontra lo <strong>sviluppo software d'avanguardia</strong>. 
            </p>
            <p>
              Il nostro team e composto da <strong>Enologi</strong> e ingegneri specializzati in Artificial Intelligence e Machine Learning, lavorando in sinergia per decodificare il linguaggio del gusto in algoritmi precisi.
            </p>
          </div>
        </div>
      </section>

      <section className="space-y-8 mt-12">
        <div className="flex items-center gap-3 text-orange-500">
          <Globe size={24} />
          <h2 className="text-2xl font-display uppercase text-white font-normal tracking-tight">Digital F&B DNA</h2>
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
                  L'ammiraglia del nostro ecosistema. Molto piu di un menu digitale: <strong>Ambrosiavino</strong> e uno strumento di intelligence che analizza i profili dei clienti e massimizza la rotazione di cantina attraverso algoritmi di raccomandazione predittiva.
                </p>
              </div>
            </div>
            <a 
              href="https://www.ambrosiavino.com" 
              target="_blank" 
              rel="noopener noreferrer" 
              className="inline-flex items-center justify-center gap-2 bg-brand-accent text-brand-bg px-6 py-3 rounded-full text-xs font-bold uppercase tracking-widest hover:scale-105 transition-transform relative z-10"
            >
              Esplora Ambrosiavino.com
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
                  Il nucleo tecnologico dell'ecosistema. <strong>Dionisus.ai</strong> integra analisi di mercato in tempo reale, gestione dei costi intelligenti e strumenti di marketing automation progettati specificamente per scalare il successo della ristorazione moderna.
                </p>
              </div>
            </div>
            <a 
              href="https://www.dionisus.ai" 
              target="_blank" 
              rel="noopener noreferrer" 
              className="inline-flex items-center justify-center gap-2 bg-brand-accent text-brand-bg px-6 py-3 rounded-full text-xs font-bold uppercase tracking-widest hover:scale-105 transition-transform relative z-10"
            >
              Visita Dionisus.ai
            </a>
          </div>
        </div>

        <p className="text-sm text-white/80 max-w-2xl">
          Dionisus AI monitora costantemente i trend globali del F&B per sviluppare strumenti che convertano la complessita dei dati in semplicita d'uso e profitto per il ristoratore.
        </p>
      </section>
    </div>
  );
}

function ContactContent() {
  return (
    <div className="space-y-12">
      <section className="space-y-4">
        <h1 className="text-5xl md:text-7xl font-display uppercase tracking-tight text-white leading-none font-normal">
          Let's <br /><span className="text-brand-accent">Talk</span>
        </h1>
        <p className="text-xl text-white/80 font-light leading-relaxed max-w-2xl">
          Hai domande tecniche o vuoi integrare le nostre tecnologie nel tuo ristorante? Siamo qui per questo.
        </p>
      </section>

      <section className="glass-panel p-12 space-y-8 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-80 bg-brand-accent/5 blur-3xl rounded-full -mr-40 -mt-40"></div>
        
        <div className="grid md:grid-cols-2 gap-12 relative z-10">
          <div className="space-y-8">
            <div className="space-y-4">
              <h2 className="text-2xl font-display uppercase font-normal tracking-tight">Sede Centrale</h2>
              <p className="text-white/80 leading-relaxed">
                Il cuore pulsante di Dionisus AI. <br />
                Innovazione Italiana per il mercato globale.
              </p>
            </div>
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="text-orange-500">
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
                <div className="text-orange-500">
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
              <div><MessageSquare size={32} className="text-orange-500" /></div>
              <div>
                <p className="text-xs uppercase opacity-40 font-bold">Feedback</p>
                <p className="text-sm">I tuoi suggerimenti guidano la nostra AI</p>
              </div>
            </div>
            <div className="flex items-center gap-4 border-b border-white/5 pb-6">
              <div><BrainCircuit size={32} className="text-orange-500" /></div>
              <div>
                <p className="text-xs uppercase opacity-40 font-bold">Sviluppo</p>
                <p className="text-sm">Custom API per grandi gruppi F&B</p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

