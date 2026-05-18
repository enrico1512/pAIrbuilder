import { motion, AnimatePresence } from "motion/react";
import { Wine, Beer, Martini, Coffee, GlassWater, ChevronRight, LayoutGrid, List, Share2, Printer, Copy, Check, Scale, Contrast, CheckSquare, Square, ArrowRight, ArrowLeft } from "lucide-react";
import { FlashIcon } from "./FlashIcon";
import { useState, useMemo } from "react";
import type { Pairing } from "../lib/gemini";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

interface PairingResultsProps {
  pairings: Pairing[];
  restaurant: { name: string; type: string; email: string; phone: string; logo: string | null } | null;
  onReset: () => void;
}

const TypeIcon = ({ category }: { category: string }) => {
  const cat = category.toLowerCase();
  if (cat.includes("vino") || cat.includes("bollicine")) return <Wine size={18} className="text-brand-accent" />;
  if (cat.includes("birra")) return <Beer size={18} className="text-brand-accent" />;
  if (cat.includes("cocktail")) return <Martini size={18} className="text-brand-accent" />;
  if (cat.includes("spirits") || cat.includes("whisky") || cat.includes("rum") || cat.includes("gin")) return <GlassWater size={18} className="text-brand-accent" />;
  return <Coffee size={18} className="text-brand-accent" />;
};

export default function PairingResults({ pairings, restaurant, onReset }: PairingResultsProps) {
  const [activeDishIndex, setActiveDishIndex] = useState(0);
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set(pairings.map((_, i) => i)));
  const [view, setView] = useState<'dashboard' | 'recap'>('dashboard');
  
  const activePairing = pairings[activeDishIndex];

  const toggleSelection = (index: number) => {
    const newSet = new Set(selectedIndices);
    if (newSet.has(index)) newSet.delete(index);
    else newSet.add(index);
    setSelectedIndices(newSet);
  };

  const toggleSelectAll = () => {
    if (selectedIndices.size === pairings.length) {
      setSelectedIndices(new Set());
    } else {
      setSelectedIndices(new Set(pairings.map((_, i) => i)));
    }
  };

  const selectedPairings = useMemo(() => 
    pairings.filter((_, i) => selectedIndices.has(i)),
  [pairings, selectedIndices]);

  const handlePrint = () => {
    const doc = new jsPDF() as any;
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 20;
    let cursorY = 30;

    // --- Centered Title ---
    doc.setFont("helvetica", "bold");
    doc.setFontSize(20);
    doc.setTextColor(0);
    doc.text("Menu abbinamenti consigliati", pageWidth / 2, cursorY, { align: "center" });
    cursorY += 8;

    doc.setDrawColor(200, 160, 100);
    doc.setLineWidth(0.5);
    doc.line(margin, cursorY, pageWidth - margin, cursorY);
    cursorY += 10;

    // --- Selected Pairings ---
    selectedPairings.forEach((pairing) => {
      if (cursorY > pageHeight - 40) {
        doc.addPage();
        cursorY = 20;
      }

      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(140, 100, 40);
      doc.text(pairing.dish.toUpperCase(), margin, cursorY);
      cursorY += 6;

      const body = pairing.drinks.map(d => [
        d.name,
        d.matchType,
        d.description
      ]);

      autoTable(doc, {
        body,
        startY: cursorY,
        margin: { left: margin },
        theme: "plain",
        styles: { fontSize: 8, cellPadding: 2 },
        columnStyles: {
          0: { fontStyle: "bold", cellWidth: 40 },
          1: { cellWidth: 30, fontStyle: "italic", textColor: [150, 150, 150] },
          2: { cellWidth: pageWidth - margin * 2 - 70 }
        }
      });

      cursorY = (doc as any).lastAutoTable.finalY + 10;
    });

    // --- Footer ---
    const totalPages = doc.internal.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setFontSize(7);
      doc.setTextColor(150);
      doc.text(`Pagina ${i} di ${totalPages}`, pageWidth - margin - 15, pageHeight - 10);
      doc.text("Generato con Dioniso Sommelier AI", margin, pageHeight - 10);
    }

    doc.save("Menu_abbinamenti_consigliati.pdf");
  };

  if (!activePairing && view === 'dashboard') return null;

  return (
    <div className="min-h-[600px] -mt-8 -mx-10 h-[calc(100vh-160px)] relative overflow-hidden">
      <AnimatePresence mode="wait">
        {view === 'dashboard' ? (
          <motion.div
            key="dashboard"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="flex flex-col md:flex-row h-full"
          >
            {/* Sidebar Navigation */}
            <aside className="w-full md:w-1/2 border-r border-white/10 p-8 flex flex-col bg-brand-bg/50 overflow-y-auto no-print">
              {/* Instructional header */}
              <div className="mb-6 bg-brand-accent/10 border border-brand-accent/25 rounded-xl p-4">
                <div className="flex items-start gap-3">
                  <FlashIcon size={18} className="text-brand-accent mt-0.5 shrink-0" />
                  <div>
                    <p className="text-white text-[11px] font-bold uppercase tracking-wide mb-1">Abbinamenti pronti!</p>
                    <p className="text-white/60 text-[10px] leading-relaxed">
                      Seleziona i piatti da includere nel menu finale, poi clicca <span className="text-brand-accent font-bold">Procedi al Recap</span> in fondo alla lista.
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex justify-between items-center mb-4">
                <h2 className="text-brand-accent text-xs uppercase tracking-[0.2em] font-bold">Piatti Abbinati</h2>
                <button 
                  onClick={toggleSelectAll}
                  className="text-[10px] uppercase font-bold text-white/40 hover:text-brand-accent transition-colors flex items-center gap-1"
                >
                  {selectedIndices.size === pairings.length ? 'Deseleziona' : 'Seleziona tutti'}
                </button>
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 flex-1 content-start">
                {pairings.map((pairing, i) => (
                  <div 
                    key={i}
                    className={`flex items-start gap-3 p-4 rounded-xl cursor-pointer transition-all border ${
                      activeDishIndex === i 
                      ? 'bg-white/10 border-brand-accent/50 shadow-lg' 
                      : 'border-transparent hover:bg-white/5 opacity-60 hover:opacity-100'
                    }`}
                    onClick={() => setActiveDishIndex(i)}
                  >
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleSelection(i);
                      }}
                      className={`shrink-0 mt-0.5 transition-colors ${selectedIndices.has(i) ? 'text-brand-accent' : 'text-white/20'}`}
                    >
                      {selectedIndices.has(i) ? <CheckSquare size={18} /> : <Square size={18} />}
                    </button>
                    <div className="flex-1 min-w-0">
                      <p className="text-[9px] opacity-40 uppercase tracking-widest font-bold truncate mb-1">
                        {pairing.category || `Piatto ${i + 1}`}
                      </p>
                      <p className="font-bold text-sm leading-snug text-white">{pairing.dish}</p>
                    </div>
                  </div>
                ))}
              </div>
              
              <div className="mt-8 space-y-4">
                <button 
                  disabled={selectedIndices.size === 0}
                  onClick={() => setView('recap')}
                  className="w-full py-3 bg-brand-accent text-brand-bg rounded-xl font-bold uppercase text-[10px] tracking-widest flex items-center justify-center gap-2 hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-20 disabled:grayscale disabled:scale-100"
                >
                  Procedi al Recap ({selectedIndices.size})
                  <ArrowRight size={14} />
                </button>
                <button onClick={onReset} className="w-full text-[10px] uppercase tracking-widest font-bold opacity-30 hover:opacity-100 transition-opacity">
                  Ricomincia Match
                </button>
              </div>
            </aside>

            {/* Main Content */}
            <section className="flex-1 p-6 md:p-10 flex flex-col overflow-y-auto bg-brand-bg-dark">
              <div className="mb-8">
                <h2 className="text-4xl md:text-5xl font-normal text-white uppercase mb-2 leading-none font-display tracking-tight text-balance">{activePairing.dish}</h2>
                <div className="flex items-center gap-2 text-brand-accent italic text-lg opacity-80 mt-4">
                  <FlashIcon size={20} className="text-brand-accent" />
                  <span>Abbinamenti consigliati da Dioniso</span>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-8 pb-12">
                {/* Concordanza */}
                <div className="space-y-6">
                  <div className="flex items-center gap-3 border-b border-brand-accent/20 pb-4">
                    <Scale className="text-brand-accent" size={20} />
                    <h3 className="text-base font-display uppercase tracking-wider text-brand-accent">Concordanza</h3>
                  </div>
                  {activePairing.drinks.filter(d => d.matchType === 'Concordanza').map((drink, j) => (
                    <motion.div
                      key={`conc-${j}`}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="bg-white/5 border border-white/10 p-6 rounded-2xl flex flex-col gap-4"
                    >
                      <div className="flex justify-between items-start">
                        <div className="flex items-center gap-2">
                          <TypeIcon category={drink.category} />
                          <span className="text-[10px] bg-brand-accent/20 text-brand-accent px-2 py-0.5 rounded font-bold uppercase">
                            {drink.category}
                          </span>
                        </div>
                        {drink.price && <span className="text-[10px] font-mono opacity-50">{drink.price}</span>}
                      </div>
                      <h4 className="text-2xl font-display font-normal text-white uppercase leading-none tracking-tight text-balance">{drink.name}</h4>
                      <p className="text-xs text-white/70 italic border-l border-brand-accent/30 pl-4 py-1 leading-relaxed">
                        {drink.description}
                      </p>
                    </motion.div>
                  ))}
                </div>

                {/* Contrasto */}
                <div className="space-y-6">
                  <div className="flex items-center gap-3 border-b border-brand-accent/20 pb-4">
                    <Contrast className="text-brand-accent" size={20} />
                    <h3 className="text-base font-display uppercase tracking-wider text-brand-accent">Contrasto</h3>
                  </div>
                  {activePairing.drinks.filter(d => d.matchType === 'Contrapposizione').map((drink, j) => (
                    <motion.div
                      key={`cont-${j}`}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="bg-white/5 border border-white/10 p-6 rounded-2xl flex flex-col gap-4"
                    >
                      <div className="flex justify-between items-start">
                        <div className="flex items-center gap-2">
                          <TypeIcon category={drink.category} />
                          <span className="text-[10px] bg-brand-accent/20 text-brand-accent px-2 py-0.5 rounded font-bold uppercase">
                            {drink.category}
                          </span>
                        </div>
                        {drink.price && <span className="text-[10px] font-mono opacity-50">{drink.price}</span>}
                      </div>
                      <h4 className="text-2xl font-display font-normal text-white uppercase leading-none tracking-tight text-balance">{drink.name}</h4>
                      <p className="text-xs text-white/70 italic border-l border-brand-accent/30 pl-4 py-1 leading-relaxed">
                        {drink.description}
                      </p>
                    </motion.div>
                  ))}
                </div>
              </div>
            </section>
          </motion.div>
        ) : (
          <motion.div
            key="recap"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="flex flex-col h-full bg-brand-bg-dark"
          >
            {/* Header Recap */}
            <div className="p-8 border-b border-white/10 flex justify-between items-center bg-brand-bg/50">
              <div className="flex items-center gap-4">
                <button 
                  onClick={() => setView('dashboard')}
                  className="p-2 hover:bg-white/10 rounded-full transition-colors text-white/40 hover:text-white"
                >
                  <ArrowLeft size={24} />
                </button>
                <div>
                  <h2 className="text-2xl font-display uppercase tracking-tight text-white mb-1">Recap Abbinamenti</h2>
                  <p className="text-[10px] uppercase tracking-widest text-brand-accent font-bold">
                    {selectedPairings.length} piatti selezionati per il menu finale
                  </p>
                </div>
              </div>
              <button 
                onClick={handlePrint}
                className="px-6 py-3 bg-brand-accent text-brand-bg rounded-full font-bold uppercase text-[10px] tracking-widest flex items-center gap-2 hover:scale-105 transition-all shadow-xl shadow-brand-accent/20"
              >
                <Printer size={16} />
                Stampa Menu in PDF
              </button>
            </div>

            {/* Content Recap */}
            <div className="flex-1 overflow-y-auto p-10">
              <div className="max-w-4xl mx-auto space-y-12">
                {selectedPairings.map((p, i) => (
                  <motion.div 
                    key={i}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className="border-b border-white/5 pb-12"
                  >
                    <h3 className="text-3xl font-display uppercase text-white mb-6 tracking-tight">{p.dish}</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {p.drinks.map((d, di) => (
                        <div key={di} className="bg-white/5 p-4 rounded-xl border border-white/10">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-[8px] uppercase tracking-widest font-black text-brand-accent">{d.matchType}</span>
                            <span className="text-[9px] opacity-40 uppercase">{d.category}</span>
                          </div>
                          <h4 className="text-lg font-display font-normal text-white uppercase tracking-tight mb-2">{d.name}</h4>
                          <p className="text-[10px] leading-relaxed text-white/60 italic border-l border-white/20 pl-3">
                            {d.description}
                          </p>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

