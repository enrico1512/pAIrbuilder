import React, { useState, useEffect } from "react";
import { motion } from "motion/react";
import { ChevronLeft, ChevronRight, Check, BrainCircuit, Edit2, BarChart3, TrendingUp, Plus } from "lucide-react";
import { type Dish, type Drink, analyzeDrinksWithMenu } from "../lib/gemini";

interface ReviewProps {
  foodPages: { dishes: Dish[]; drinks: Drink[] }[];
  drinkPages: { dishes: Dish[]; drinks: Drink[] }[];
  onConfirm: (dishes: Dish[], drinks: Drink[]) => void;
}

export default function MenuReview({ 
  foodPages, 
  drinkPages, 
  onConfirm 
}: { 
  foodPages: { dishes: Dish[]; drinks: Drink[] }[]; 
  drinkPages: { dishes: Dish[]; drinks: Drink[] }[]; 
  onConfirm: (dishes: Dish[], drinks: Drink[]) => void 
}) {
  // Consolidate all results into two master lists for easy review
  const [allDishes, setAllDishes] = useState<Dish[]>(() => {
    const raw = [...foodPages.flatMap(p => p.dishes), ...drinkPages.flatMap(p => p.dishes)];
    const seen = new Set<string>();
    return raw.filter(d => {
      const key = (d.name || "").toLowerCase().trim();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  });
  const [allDrinks, setAllDrinks] = useState<Drink[]>(() => {
    // Migration helper: map old 'type' to 'category' if needed
    const raw = [...foodPages.flatMap(p => p.drinks), ...drinkPages.flatMap(p => p.drinks)].map(d => ({
      ...d,
      category: d.category || (d as any).type || "Altro"
    }));
    const seen = new Set<string>();
    return raw.filter(d => {
      const key = (d.product || "").toLowerCase().trim();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  });

  const [analysis, setAnalysis] = useState<{ stats: string[]; strategy: string } | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const [foodPage, setFoodPage] = useState(1);
  const [drinkPage, setDrinkPage] = useState(1);
  const ITEMS_PER_PAGE = 25; // Items visible per page

  // Sorting logic based on user request: "order items follow categories"
  const sortedDishes = [...allDishes].sort((a, b) => 
    (a.category || "VARIE").localeCompare(b.category || "VARIE", undefined, { sensitivity: 'base' })
  );

  const sortedDrinks = [...allDrinks].sort((a, b) => 
    (a.category || "Altro").localeCompare(b.category || "Altro", undefined, { sensitivity: 'base' })
  );

  const paginatedDishes = sortedDishes.slice((foodPage - 1) * ITEMS_PER_PAGE, foodPage * ITEMS_PER_PAGE);
  const paginatedDrinks = sortedDrinks.slice((drinkPage - 1) * ITEMS_PER_PAGE, drinkPage * ITEMS_PER_PAGE);

  const totalFoodPages = Math.max(1, Math.ceil(sortedDishes.length / ITEMS_PER_PAGE));
  const totalDrinkPages = Math.max(1, Math.ceil(sortedDrinks.length / ITEMS_PER_PAGE));

  useEffect(() => {
    if (allDrinks.length > 0 && !analysis && !isAnalyzing) {
      setIsAnalyzing(true);
      analyzeDrinksWithMenu(allDishes, allDrinks).then(res => {
        setAnalysis(res);
        setIsAnalyzing(false);
      });
    }
  }, [allDrinks.length, allDishes.length]);

  const getDrinkDisplayLabel = (category: string) => {
    const cat = (category || "").toLowerCase();
    if (cat.includes("vino") || cat.includes("bollicine")) return "Vino";
    if (cat.includes("birra")) return "Birra";
    if (cat.includes("cocktail")) return "Cocktail";
    if (cat.includes("acq") || cat.includes("soft") || cat.includes("succo")) return "Analcolico";
    if (cat.includes("caff") || cat.includes("the")) return "Caffetteria";
    return "Drink";
  };

  const formatText = (text: string | undefined | null) => {
    if (!text) return "";
    // Remove "NULL", "null", ", NULL", "NULL, " case-insensitively
    return text.replace(/,?\s*NULL\s*,?/gi, "").trim();
  };

  const togglePriority = (index: number) => {
    const priorityCount = allDrinks.filter(d => d.isPriority).length;
    
    if (!allDrinks[index].isPriority && priorityCount >= 5) {
      alert("Puoi selezionare al massimo 5 prodotti prioritari.");
      return;
    }
    
    const newDrinks = [...allDrinks];
    newDrinks[index] = { ...newDrinks[index], isPriority: !newDrinks[index].isPriority };
    setAllDrinks(newDrinks);
  };

  const updateDish = (index: number, field: keyof Dish, value: string) => {
    const newDishes = [...allDishes];
    newDishes[index] = { ...newDishes[index], [field]: value };
    setAllDishes(newDishes);
  };

  const updateDrink = (index: number, field: keyof Drink, value: string) => {
    const newDrinks = [...allDrinks];
    newDrinks[index] = { ...newDrinks[index], [field]: value };
    setAllDrinks(newDrinks);
  };

  const addManualDish = () => {
    const newDish: Dish = {
      name: "Nuovo Piatto",
      category: "ANTIPASTI",
      fullIngredients: "Inserisci ingredienti...",
    };
    setAllDishes(prev => [newDish, ...prev]);
    setFoodPage(1);
  };

  const addManualDrink = () => {
    const newDrink: Drink = {
      product: "Nuovo Drink",
      producer: "Produttore",
      category: "Vino",
      vintage: "-",
      price: "-",
      isPriority: false,
    };
    setAllDrinks(prev => [newDrink, ...prev]);
    setDrinkPage(1);
  };

  const finalize = () => {
    onConfirm(allDishes, allDrinks);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-7xl mx-auto space-y-8"
    >
      <div className="text-center space-y-2">
        <div className="flex items-center justify-center gap-2 text-brand-accent animate-pulse mb-2">
          <BrainCircuit size={18} />
          <span className="text-[10px] uppercase font-bold tracking-widest">Dioniso Learning Mode Active</span>
        </div>
        <h2 className="text-5xl uppercase font-display">Conferma Menu e Drinks</h2>
        <p className="text-white/60">Controlla i dati estratti e clicca ed eventualmente apporta modifiche.</p>
      </div>

      {/* Analysis Panel */}
      <motion.div 
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        className="glass-panel p-8 border-brand-accent/30 bg-brand-accent/5 relative overflow-hidden"
      >
        <div className="absolute top-0 right-0 p-4 opacity-10">
          <BarChart3 size={120} className="text-brand-accent" />
        </div>
        
        <div className="relative z-10 grid grid-cols-1 md:grid-cols-3 gap-10 items-center">
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-brand-accent">
              <TrendingUp size={20} />
              <h3 className="text-xs font-bold uppercase tracking-widest">Analisi della tua Carta</h3>
            </div>
            <div className="space-y-2">
              {isAnalyzing ? (
                <div className="flex items-center gap-3 animate-pulse">
                  <div className="w-4 h-4 bg-white/20 rounded-full"></div>
                  <div className="h-4 w-40 bg-white/10 rounded"></div>
                </div>
              ) : analysis?.stats.map((stat, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="w-1.5 h-1.5 bg-brand-accent rounded-full shadow-[0_0_8px_rgba(248,188,180,0.5)]"></div>
                  <span className="text-sm font-medium tracking-tight text-white/80">{stat}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="md:col-span-2 border-l border-white/10 md:pl-10 space-y-3">
            <h4 className="text-[10px] uppercase font-bold tracking-[0.2em] text-white/40">Considerazione Strategica</h4>
            <div className="relative">
              {isAnalyzing ? (
                <div className="space-y-2 animate-pulse">
                  <div className="h-4 w-full bg-white/5 rounded"></div>
                  <div className="h-4 w-5/6 bg-white/5 rounded"></div>
                </div>
              ) : (
                <p className="text-lg leading-relaxed font-normal text-white/90">
                  "{analysis?.strategy || "Dioniso sta elaborando la strategia migliore per la tua cantina..."}"
                </p>
              )}
            </div>
          </div>
        </div>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
        {/* Menu Section */}
        <div className="flex flex-col gap-4">
          <div className="glass-panel overflow-hidden flex flex-col h-[600px]">
            <div className="p-6 border-b border-white/10 bg-white/5 flex justify-between items-center">
              <div>
                <h3 className="text-brand-accent uppercase tracking-widest text-sm font-bold flex items-center gap-2">
                  <span className="w-2 h-2 bg-brand-accent rounded-full animate-pulse"></span>
                  Menu Food
                </h3>
                <p className="text-[10px] text-white mt-1 uppercase">controlla l'esattezza dei dati, puoi modificare o aggiungere piatti/drinks mancanti</p>
              </div>
              <button 
                onClick={addManualDish}
                className="flex items-center gap-2 bg-brand-accent/10 hover:bg-brand-accent/20 text-brand-accent px-3 py-1.5 rounded-lg border border-brand-accent/30 transition-all text-[10px] uppercase font-bold tracking-widest"
              >
                <Plus size={14} />
                Aggiungi
              </button>
            </div>
            
            <div className="flex-1 overflow-auto p-0">
              <table className="w-full text-left border-collapse">
                <thead className="sticky top-0 bg-brand-bg-dark z-10">
                  <tr className="border-b border-white/10">
                    <th className="px-4 py-3 text-[10px] uppercase tracking-widest opacity-40 font-medium">Categoria</th>
                    <th className="px-4 py-3 text-[10px] uppercase tracking-widest opacity-40 font-medium">Piatto</th>
                    <th className="px-4 py-3 text-[10px] uppercase tracking-widest opacity-40 font-medium">Ingredienti</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                      {Array.from(new Set(paginatedDishes.map(d => d.category || "VARIE"))).map(category => (
                        <React.Fragment key={category}>
                          <tr className="bg-white/10" key={`header-${category}`}>
                            <td colSpan={3} className="px-4 py-2 text-[10px] uppercase tracking-widest font-black text-brand-accent">
                              {category}
                            </td>
                          </tr>
                          {paginatedDishes.filter(d => (d.category || "VARIE") === category).map((dish, i) => (
                            <tr key={`${category}-${dish.name}-${i}`} className="hover:bg-white/5 transition-colors">
                              <td className="px-4 py-4 align-top">
                                <span 
                                  contentEditable 
                                  suppressContentEditableWarning
                                  onBlur={(e) => updateDish(allDishes.indexOf(dish), 'category', e.currentTarget.textContent || "")}
                                  className="text-[10px] uppercase border border-white/10 px-2 py-0.5 rounded text-white/40 focus:outline-none focus:border-brand-accent"
                                >
                                  {dish.category || "VARIE"}
                                </span>
                              </td>
                              <td className="px-4 py-4 align-top font-bold uppercase tracking-tight text-sm">
                                <div 
                                  contentEditable 
                                  suppressContentEditableWarning
                                  onBlur={(e) => updateDish(allDishes.indexOf(dish), 'name', e.currentTarget.textContent || "")}
                                  className="focus:outline-none focus:text-brand-accent min-h-[1em] hover:bg-white/5 p-1 rounded transition-colors cursor-text"
                                >
                                  {dish.name}
                                </div>
                              </td>
                              <td className="px-4 py-4 align-top text-xs text-white/50 leading-relaxed italic">
                                <div 
                                  contentEditable 
                                  suppressContentEditableWarning
                                  onBlur={(e) => updateDish(allDishes.indexOf(dish), 'fullIngredients', e.currentTarget.textContent || "")}
                                  className="focus:outline-none focus:text-white min-h-[1em] hover:bg-white/5 p-1 rounded transition-colors cursor-text"
                                >
                                  {dish.fullIngredients}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </React.Fragment>
                      ))}
                      {paginatedDishes.length === 0 && (
                        <tr key="empty-food">
                          <td colSpan={3} className="px-4 py-8 text-center text-xs opacity-40 uppercase tracking-widest">
                            Nessun piatto rilevato
                          </td>
                        </tr>
                      )}
                </tbody>
              </table>
            </div>

            {/* Food Pagination — visible only when more than ITEMS_PER_PAGE items */}
            {totalFoodPages > 1 && <div className="p-3 border-t border-white/10 bg-white/5 flex items-center justify-between gap-2 shrink-0">
              <button
                onClick={() => setFoodPage(p => Math.max(1, p - 1))}
                disabled={foodPage === 1}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 text-[10px] uppercase tracking-widest font-bold disabled:opacity-20 disabled:cursor-not-allowed hover:enabled:border-brand-accent hover:enabled:text-brand-accent transition-all"
              >
                <ChevronLeft size={13} /> Prec
              </button>
              <span className="text-[10px] uppercase tracking-widest font-bold text-white/40 text-center">
                {sortedDishes.length === 0 ? "0 piatti" : `${(foodPage - 1) * ITEMS_PER_PAGE + 1}–${Math.min(foodPage * ITEMS_PER_PAGE, sortedDishes.length)} di ${sortedDishes.length}`}
              </span>
              <button
                onClick={() => setFoodPage(p => Math.min(totalFoodPages, p + 1))}
                disabled={foodPage === totalFoodPages}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 text-[10px] uppercase tracking-widest font-bold disabled:opacity-20 disabled:cursor-not-allowed hover:enabled:border-brand-accent hover:enabled:text-brand-accent transition-all"
              >
                Succ <ChevronRight size={13} />
              </button>
            </div>}
          </div>
        </div>

        {/* Drinks Section */}
        <div className="flex flex-col gap-4">
          <div className="glass-panel overflow-hidden flex flex-col h-[600px]">
            <div className="p-6 border-b border-white/10 bg-white/5 flex justify-between items-center">
              <div>
                <h3 className="text-brand-accent uppercase tracking-widest text-sm font-bold flex items-center gap-2">
                  <span className="w-2 h-2 bg-brand-accent rounded-full animate-pulse"></span>
                  La Tua Carta Drinks
                </h3>
                <p className="text-[10px] text-white mt-1 uppercase">controlla l'esattezza dei dati, puoi modificare o aggiungere piatti/drinks mancanti</p>
              </div>
              <button 
                onClick={addManualDrink}
                className="flex items-center gap-2 bg-brand-accent/10 hover:bg-brand-accent/20 text-brand-accent px-3 py-1.5 rounded-lg border border-brand-accent/30 transition-all text-[10px] uppercase font-bold tracking-widest"
              >
                <Plus size={14} />
                Aggiungi
              </button>
            </div>

            <div className="flex-1 overflow-auto p-0">
              <table className="w-full text-left border-collapse">
                <thead className="sticky top-0 bg-brand-bg-dark z-10">
                  <tr className="border-b border-white/10">
                    <th className="px-4 py-3 text-[10px] uppercase tracking-widest opacity-40 font-medium">Categoria</th>
                    <th className="px-4 py-3 text-[10px] uppercase tracking-widest opacity-40 font-medium">Produttore</th>
                    <th className="px-4 py-3 text-[10px] uppercase tracking-widest opacity-40 font-medium">Prodotto</th>
                    <th className="px-4 py-3 text-[10px] uppercase tracking-widest opacity-40 font-medium text-right">Prezzo</th>
                    <th className="px-4 py-3 text-[10px] uppercase tracking-widest opacity-40 font-medium text-center">Priorita</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {paginatedDrinks.map((drink, i) => {
                    const originalIndex = allDrinks.indexOf(drink);
                    return (
                      <tr key={`${drink.producer}-${drink.product}-${i}`} className={`hover:bg-white/5 transition-colors ${drink.isPriority ? 'bg-brand-accent/5' : ''}`}>
                        <td className="px-4 py-4 align-top">
                          <span 
                            contentEditable 
                            suppressContentEditableWarning
                            onBlur={(e) => updateDrink(originalIndex, 'category', e.currentTarget.textContent || "")}
                            className="text-[10px] uppercase text-brand-accent font-bold block focus:outline-none"
                          >
                            {getDrinkDisplayLabel(drink.category)}
                          </span>
                          <span className="text-[9px] uppercase text-white/40 block mt-1">
                            {formatText(drink.category)}
                          </span>
                          <div 
                            contentEditable 
                            suppressContentEditableWarning
                            onBlur={(e) => updateDrink(originalIndex, 'vintage', e.currentTarget.textContent || "")}
                            className="text-[9px] uppercase text-white/30 block mt-0.5 focus:outline-none"
                          >
                            {formatText(drink.vintage)}
                          </div>
                        </td>
                        <td className="px-4 py-4 align-top text-xs uppercase opacity-80">
                          <div 
                            contentEditable 
                            suppressContentEditableWarning
                            onBlur={(e) => updateDrink(originalIndex, 'producer', e.currentTarget.textContent || "")}
                            className="focus:outline-none focus:text-white"
                          >
                            {drink.producer}
                          </div>
                        </td>
                        <td className="px-4 py-4 align-top font-bold uppercase tracking-tight text-sm">
                          <div 
                            contentEditable 
                            suppressContentEditableWarning
                            onBlur={(e) => updateDrink(originalIndex, 'product', e.currentTarget.textContent || "")}
                            className="focus:outline-none focus:text-brand-accent"
                          >
                            {drink.product}
                          </div>
                        </td>
                        <td className="px-4 py-4 align-top text-right font-mono text-xs opacity-60">
                          <div 
                            contentEditable 
                            suppressContentEditableWarning
                            onBlur={(e) => updateDrink(originalIndex, 'price', e.currentTarget.textContent || "")}
                            className="focus:outline-none"
                          >
                            {drink.price || '-'}
                          </div>
                        </td>
                        <td className="px-4 py-4 align-top text-center">
                          <button
                            onClick={() => togglePriority(originalIndex)}
                            className={`w-6 h-6 rounded border flex items-center justify-center transition-all ${
                              drink.isPriority 
                              ? 'bg-brand-accent border-brand-accent text-brand-bg' 
                              : 'border-white/20 hover:border-brand-accent'
                            }`}
                          >
                            {drink.isPriority && <Check size={14} strokeWidth={3} />}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {paginatedDrinks.length === 0 && (
                    <tr key="empty-drinks">
                      <td colSpan={5} className="px-4 py-8 text-center text-xs opacity-40 uppercase tracking-widest">
                        Nessuna bevanda rilevata
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Drink Pagination — visible only when more than ITEMS_PER_PAGE items */}
            {totalDrinkPages > 1 && <div className="p-3 border-t border-white/10 bg-white/5 flex items-center justify-between gap-2 shrink-0">
              <button
                onClick={() => setDrinkPage(p => Math.max(1, p - 1))}
                disabled={drinkPage === 1}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 text-[10px] uppercase tracking-widest font-bold disabled:opacity-20 disabled:cursor-not-allowed hover:enabled:border-brand-accent hover:enabled:text-brand-accent transition-all"
              >
                <ChevronLeft size={13} /> Prec
              </button>
              <span className="text-[10px] uppercase tracking-widest font-bold text-white/40 text-center">
                {`${(drinkPage - 1) * ITEMS_PER_PAGE + 1}–${Math.min(drinkPage * ITEMS_PER_PAGE, sortedDrinks.length)} di ${sortedDrinks.length}`}
              </span>
              <button
                onClick={() => setDrinkPage(p => Math.min(totalDrinkPages, p + 1))}
                disabled={drinkPage === totalDrinkPages}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 text-[10px] uppercase tracking-widest font-bold disabled:opacity-20 disabled:cursor-not-allowed hover:enabled:border-brand-accent hover:enabled:text-brand-accent transition-all"
              >
                Succ <ChevronRight size={13} />
              </button>
            </div>}
          </div>
        </div>
      </div>

      <div className="flex justify-center pt-10">
        <button
          onClick={finalize}
          className="btn-primary px-20 py-5 text-2xl"
        >
          GENERA ABBINAMENTI PERFETTI
        </button>
      </div>
    </motion.div>
  );
}
