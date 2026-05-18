import { motion, AnimatePresence } from "motion/react";
import { Upload, X, Utensils, Wine, Check, BrainCircuit, Info, Sparkles } from "lucide-react";
import { useState, useEffect } from "react";
import { learningService } from "../lib/learningService";

interface MenuUploadProps {
  onBack: () => void;
  onNext: (menuFiles: File[], drinksFiles: File[]) => void;
}

export default function MenuUpload({ onBack, onNext }: MenuUploadProps) {
  const [menuFiles, setMenuFiles] = useState<File[]>([]);
  const [drinksFiles, setDrinksFiles] = useState<File[]>([]);
  const [showLearningInfo, setShowLearningInfo] = useState(false);
  const [learnedCount, setLearnedCount] = useState({ dishes: 0, drinks: 0 });

  useEffect(() => {
    const dishExamples = learningService.getExamples('dish', 50);
    const drinkExamples = learningService.getExamples('drink', 50);
    setLearnedCount({
      dishes: dishExamples.length,
      drinks: drinkExamples.length
    });
  }, []);

  useEffect(() => {
    // Mock data removed to allow real user testing
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, type: 'menu' | 'drinks') => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files);
      if (type === 'menu') setMenuFiles([...menuFiles, ...newFiles]);
      else setDrinksFiles([...drinksFiles, ...newFiles]);
    }
  };

  const removeFile = (index: number, type: 'menu' | 'drinks') => {
    if (type === 'menu') setMenuFiles(menuFiles.filter((_, i) => i !== index));
    else setDrinksFiles(drinksFiles.filter((_, i) => i !== index));
  };

  const loadTestData = () => {
    const mockMenu = new File(["Antipasti: Bruschette al pomodoro, Crudo di Parma. Primi: Bigoli all'anatra, Casunziei ampezzani. Secondi: Tagliata di manzo, Baccala alla vicentina."], "menu_cena.txt", { type: "text/plain" });
    const mockDrinks = new File(["Bollicine: Prosecco Brut DOCG, Talento Brut Rose. Bianchi: Soave Colli Scaligeri, Langhe DOC Bianco. Rossi: Tai Rosso, Nebbiolo D'Alba."], "menu_drink.txt", { type: "text/plain" });
    
    setMenuFiles([mockMenu]);
    setDrinksFiles([mockDrinks]);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-4xl mx-auto space-y-8"
    >
      <div className="text-center space-y-4 max-w-2xl mx-auto mb-12">
        <h2 className="text-4xl lg:text-5xl mb-2">I TUOI MENU</h2>
        <p className="text-white/60">Carica i documenti del tuo ristorante per iniziare il matching.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Menu Upload */}
        <div className={`glass-panel p-8 space-y-4 transition-all duration-500 ${menuFiles.length > 0 ? 'ring-2 ring-brand-accent/30 bg-brand-accent/5' : ''}`} data-testid="menu-upload">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Utensils className={menuFiles.length > 0 ? 'text-orange-500' : 'text-white/40'} />
              <div className="flex items-center gap-2">
                <h3 className="text-2xl">MENU PIATTI</h3>
                {menuFiles.length > 0 && (
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="text-orange-500 p-1"
                  >
                    <Check size={12} strokeWidth={4} />
                  </motion.div>
                )}
              </div>
            </div>
            {menuFiles.length > 0 && (
              <button 
                onClick={() => setMenuFiles([])}
                className="text-[10px] uppercase tracking-widest opacity-50 hover:opacity-100 transition-opacity"
              >
                Resetta
              </button>
            )}
          </div>
          <div className={`border-2 border-dashed rounded-xl p-8 text-center transition-all duration-300 relative ${
            menuFiles.length > 0 
              ? 'border-brand-accent bg-brand-accent/5 shadow-[inset_0_0_20px_rgba(180,90,255,0.1)]' 
              : 'border-white/20 hover:border-brand-accent/50'
          }`}>
            <input
              type="file"
              multiple
              accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.csv"
              onChange={(e) => handleFileChange(e, 'menu')}
              className="absolute inset-0 opacity-0 cursor-pointer z-10"
              title="Carica menu"
            />
            {menuFiles.length > 0 ? (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="relative z-0"
              >
                <div className="w-12 h-12 mx-auto mb-3 flex items-center justify-center text-orange-500">
                  <Check size={32} strokeWidth={3} />
                </div>
                <p className="text-sm font-bold text-orange-500 uppercase">File caricati con successo</p>
                <p className="text-[10px] opacity-60 uppercase tracking-tighter mt-1">Clicca o trascina per aggiungere altri menu</p>
              </motion.div>
            ) : (
              <>
                <Upload className="mx-auto mb-2 text-white/40" />
                <p className="text-sm text-white/60">Trascina o clicca per caricare foto, PDF, Word o Excel del menu</p>
              </>
            )}
          </div>
          
          <div className="space-y-3">
            {menuFiles.length > 0 && (
              <div className="flex justify-center mb-4">
                <label className="text-[10px] uppercase font-bold tracking-widest bg-brand-accent/20 text-brand-accent px-4 py-2 rounded-full cursor-pointer hover:bg-brand-accent/30 transition-colors inline-flex items-center gap-2 border border-brand-accent/20">
                  <Upload size={12} />
                  Aggiungi Altro File Menu
                  <input
                    type="file"
                    multiple
                    accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.csv"
                    onChange={(e) => handleFileChange(e, 'menu')}
                    className="w-0.5 h-0.5 opacity-0.1"
                  />
                </label>
              </div>
            )}
            {menuFiles.map((file, i) => (
              <div key={i} className="flex items-center justify-between bg-white/5 p-3 rounded-lg text-xs group hover:bg-white/10 transition-colors border border-white/5">
                <div className="flex items-center gap-2 truncate">
                  <div className="w-1.5 h-1.5 bg-brand-accent rounded-full"></div>
                  <span className="truncate">{file.name}</span>
                </div>
                <button 
                  onClick={() => removeFile(i, 'menu')}
                  className="p-1 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Drinks Upload */}
        <div className={`glass-panel p-8 space-y-4 transition-all duration-500 ${drinksFiles.length > 0 ? 'ring-2 ring-brand-accent/30 bg-brand-accent/5' : ''}`} data-testid="drinks-upload">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Wine className={drinksFiles.length > 0 ? 'text-orange-500' : 'text-white/40'} />
              <div className="flex items-center gap-2">
                <h3 className="text-2xl">CARTA DRINKS</h3>
                {drinksFiles.length > 0 && (
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="text-orange-500 p-1"
                  >
                    <Check size={12} strokeWidth={4} />
                  </motion.div>
                )}
              </div>
            </div>
            {drinksFiles.length > 0 && (
              <button 
                onClick={() => setDrinksFiles([])}
                className="text-[10px] uppercase tracking-widest opacity-50 hover:opacity-100 transition-opacity"
              >
                Resetta
              </button>
            )}
          </div>
          <div className={`border-2 border-dashed rounded-xl p-8 text-center transition-all duration-300 relative ${
            drinksFiles.length > 0 
              ? 'border-brand-accent bg-brand-accent/5 shadow-[inset_0_0_20px_rgba(180,90,255,0.1)]' 
              : 'border-white/20 hover:border-brand-accent/50'
          }`}>
            <input
              type="file"
              multiple
              accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.csv"
              onChange={(e) => handleFileChange(e, 'drinks')}
              className="absolute inset-0 opacity-0 cursor-pointer z-10"
              title="Carica drinks"
            />
            {drinksFiles.length > 0 ? (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="relative z-0"
              >
                <div className="w-12 h-12 mx-auto mb-3 flex items-center justify-center text-orange-500">
                  <Check size={32} strokeWidth={3} />
                </div>
                <p className="text-sm font-bold text-orange-500 uppercase">Drinks caricati con successo</p>
                <p className="text-[10px] opacity-60 uppercase tracking-tighter mt-1">Clicca o trascina per aggiungere altri drinks</p>
              </motion.div>
            ) : (
              <>
                <Upload className="mx-auto mb-2 text-white/40" />
                <p className="text-sm text-white/60">Trascina o clicca per caricare foto, PDF, Word o Excel dei drinks</p>
              </>
            )}
          </div>

          <div className="space-y-3">
            {drinksFiles.length > 0 && (
              <div className="flex justify-center mb-4">
                <label className="text-[10px] uppercase font-bold tracking-widest bg-brand-accent/20 text-brand-accent px-4 py-2 rounded-full cursor-pointer hover:bg-brand-accent/30 transition-colors inline-flex items-center gap-2 border border-brand-accent/20">
                  <Upload size={12} />
                  Aggiungi Altro File Drinks
                  <input
                    type="file"
                    multiple
                    accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.csv"
                    onChange={(e) => handleFileChange(e, 'drinks')}
                    className="w-0.5 h-0.5 opacity-0.1"
                  />
                </label>
              </div>
            )}
            {drinksFiles.map((file, i) => (
              <div key={i} className="flex items-center justify-between bg-white/5 p-3 rounded-lg text-xs group hover:bg-white/10 transition-colors border border-white/5">
                <div className="flex items-center gap-2 truncate">
                  <div className="w-1.5 h-1.5 bg-brand-accent rounded-full"></div>
                  <span className="truncate">{file.name}</span>
                </div>
                <button 
                  onClick={() => removeFile(i, 'drinks')}
                  className="p-1 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-col items-center gap-4 pt-4">
        <button 
          onClick={loadTestData}
          className="text-[10px] uppercase tracking-widest text-brand-accent hover:underline decoration-brand-accent/30"
          data-testid="test-data-btn"
        >
          ⚡ Test con file di esempio
        </button>

        {(menuFiles.length > 0 || drinksFiles.length > 0) && (
          <div className="text-xs uppercase tracking-widest text-white/40 bg-white/5 px-6 py-2 rounded-full border border-white/10">
            Pronto per l'estrazione: <span className="text-brand-accent font-bold">{menuFiles.length} menu</span> e <span className="text-brand-accent font-bold">{drinksFiles.length} drinks</span>
          </div>
        )}
        
        <div className="flex justify-between items-center w-full">
          <button onClick={onBack} className="text-white/60 hover:text-white underline underline-offset-4">
            Indietro
          </button>
          
          <button
            onClick={() => onNext(menuFiles, drinksFiles)}
            disabled={menuFiles.length === 0 || drinksFiles.length === 0}
            className={`btn-primary px-10 py-4 ${menuFiles.length > 0 && drinksFiles.length > 0 ? 'animate-pulse' : ''}`}
          >
            CONFERMA E PROCEDI →
          </button>
        </div>
      </div>
    </motion.div>
  );
}
