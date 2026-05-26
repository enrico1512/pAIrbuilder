import React, { useState, useEffect } from "react";
import { motion } from "motion/react";
import { ChevronLeft, ChevronRight, Check, BrainCircuit, Edit2, BarChart3, TrendingUp, Plus, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { type Dish, type Drink, analyzeDrinksWithMenu, isWineCategory, isPizzaCategory } from "../lib/gemini";

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
  const { t } = useTranslation();
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

  // Draft state for manual additions — only confirmed entries become part of the master list
  const [draftDish, setDraftDish] = useState<Dish | null>(null);
  const [draftDrink, setDraftDrink] = useState<Drink | null>(null);

  const [foodPage, setFoodPage] = useState(1);
  const [drinkPage, setDrinkPage] = useState(1);
  const ITEMS_PER_PAGE = 25; // Items visible per page

  // Le pizze restano in `allDishes` (verranno salvate nel DB via
  // /api/dishes/bulk dal parent per la strategia dati BIBI), ma non sono
  // visibili qui ne' passate a generatePairings: l'abbinamento pizza+vino
  // non e' considerato di valore dal prodotto. Stessa logica dei drink
  // non-vino qui sotto.
  const visibleDishes = allDishes.filter(d => !isPizzaCategory(d.category));
  const sortedDishes = [...visibleDishes].sort((a, b) =>
    (a.category || "VARIE").localeCompare(b.category || "VARIE", undefined, { sensitivity: 'base' })
  );

  // Solo i vini sono mostrati nella tabella drinks e usati per gli abbinamenti.
  // Birre/cocktail/spirits restano in `allDrinks` (verranno comunque salvati
  // nel DB via /api/drinks/bulk dal parent), ma non sono visibili qui ne'
  // passati a generatePairings.
  const visibleDrinks = allDrinks.filter(d => isWineCategory(d.category));
  const sortedDrinks = [...visibleDrinks].sort((a, b) =>
    (a.category || "Altro").localeCompare(b.category || "Altro", undefined, { sensitivity: 'base' })
  );

  const paginatedDishes = sortedDishes.slice((foodPage - 1) * ITEMS_PER_PAGE, foodPage * ITEMS_PER_PAGE);
  const paginatedDrinks = sortedDrinks.slice((drinkPage - 1) * ITEMS_PER_PAGE, drinkPage * ITEMS_PER_PAGE);

  const totalFoodPages = Math.max(1, Math.ceil(sortedDishes.length / ITEMS_PER_PAGE));
  const totalDrinkPages = Math.max(1, Math.ceil(sortedDrinks.length / ITEMS_PER_PAGE));

  useEffect(() => {
    // Passiamo solo vini + piatti non-pizza: l'analisi strategica e' pensata
    // per gli abbinamenti che produrremo davvero, non per i drink non-vino
    // o le pizze che vivono nel DB ma fuori dal pairing.
    const wineSubset = allDrinks.filter(d => isWineCategory(d.category));
    const dishesSubset = allDishes.filter(d => !isPizzaCategory(d.category));
    if (wineSubset.length > 0 && !analysis && !isAnalyzing) {
      setIsAnalyzing(true);
      analyzeDrinksWithMenu(dishesSubset, wineSubset).then(res => {
        setAnalysis(res);
        setIsAnalyzing(false);
      });
    }
  }, [allDrinks.length, allDishes.length]);

  const getDrinkDisplayLabel = (category: string) => {
    const cat = (category || "").toLowerCase();
    if (cat.includes("vino") || cat.includes("bollicine") || cat.includes("wine") || cat.includes("sparkling")) return t('menuReview.drinks.displayLabels.wine');
    if (cat.includes("birra") || cat.includes("beer")) return t('menuReview.drinks.displayLabels.beer');
    if (cat.includes("cocktail")) return t('menuReview.drinks.displayLabels.cocktail');
    if (cat.includes("acq") || cat.includes("soft") || cat.includes("succo") || cat.includes("water") || cat.includes("juice")) return t('menuReview.drinks.displayLabels.nonAlcoholic');
    if (cat.includes("caff") || cat.includes("the") || cat.includes("coffee") || cat.includes("tea")) return t('menuReview.drinks.displayLabels.coffee');
    return t('menuReview.drinks.displayLabels.generic');
  };

  const formatText = (text: string | undefined | null) => {
    if (!text) return "";
    // Remove "NULL", "null", ", NULL", "NULL, " case-insensitively
    return text.replace(/,?\s*NULL\s*,?/gi, "").trim();
  };

  const togglePriority = (index: number) => {
    const priorityCount = allDrinks.filter(d => d.isPriority).length;
    
    if (!allDrinks[index].isPriority && priorityCount >= 5) {
      alert(t('menuReview.alerts.priorityLimit'));
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

  const startDraftDish = () => {
    if (draftDish) return; // already drafting
    setDraftDish({
      name: "",
      category: "ANTIPASTI",
      fullIngredients: "",
    });
    setFoodPage(1);
  };

  const updateDraftDish = (field: keyof Dish, value: string) => {
    setDraftDish(prev => (prev ? { ...prev, [field]: value } : prev));
  };

  const confirmDraftDish = () => {
    if (!draftDish) return;
    if (!draftDish.name.trim()) {
      alert(t('menuReview.alerts.missingDishName'));
      return;
    }
    const toAdd: Dish = {
      name: draftDish.name.trim(),
      category: (draftDish.category || "VARIE").trim().toUpperCase(),
      fullIngredients: (draftDish.fullIngredients || "").trim(),
    };
    setAllDishes(prev => [toAdd, ...prev]);
    setDraftDish(null);
  };

  const cancelDraftDish = () => setDraftDish(null);

  const startDraftDrink = () => {
    if (draftDrink) return;
    setDraftDrink({
      product: "",
      producer: "",
      category: "Vino Rosso",
      vintage: "",
      price: "",
      isPriority: false,
    });
    setDrinkPage(1);
  };

  const updateDraftDrink = (field: keyof Drink, value: string) => {
    setDraftDrink(prev => (prev ? { ...prev, [field]: value } : prev));
  };

  const confirmDraftDrink = () => {
    if (!draftDrink) return;
    if (!draftDrink.product.trim()) {
      alert(t('menuReview.alerts.missingDrinkName'));
      return;
    }
    const toAdd: Drink = {
      product: draftDrink.product.trim(),
      producer: (draftDrink.producer || "").trim(),
      category: (draftDrink.category || "Vino Rosso").trim(),
      vintage: (draftDrink.vintage || "").trim(),
      price: (draftDrink.price || "").trim(),
      isPriority: false,
    };
    setAllDrinks(prev => [toAdd, ...prev]);
    setDraftDrink(null);
  };

  const cancelDraftDrink = () => setDraftDrink(null);

  const finalize = () => {
    if (draftDish || draftDrink) {
      const pending: string[] = [];
      if (draftDish) pending.push(t('menuReview.alerts.pendingDish'));
      if (draftDrink) pending.push(t('menuReview.alerts.pendingDrink'));
      const separator = ` ${t('upload.status.separator')} `;
      const ok = confirm(
        t('menuReview.alerts.pendingDiscard', { pending: pending.join(separator) })
      );
      if (!ok) return;
      setDraftDish(null);
      setDraftDrink(null);
    }
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
          <span className="text-[10px] uppercase font-bold tracking-widest">{t('menuReview.badge')}</span>
        </div>
        <h2 className="text-5xl uppercase font-display">{t('menuReview.title')}</h2>
        <p className="text-white/60">{t('menuReview.subtitle')}</p>
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
              <h3 className="text-xs font-bold uppercase tracking-widest">{t('menuReview.analysis.statsHeading')}</h3>
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
            <h4 className="text-[10px] uppercase font-bold tracking-[0.2em] text-white/40">{t('menuReview.analysis.strategyHeading')}</h4>
            <div className="relative">
              {isAnalyzing ? (
                <div className="space-y-2 animate-pulse">
                  <div className="h-4 w-full bg-white/5 rounded"></div>
                  <div className="h-4 w-5/6 bg-white/5 rounded"></div>
                </div>
              ) : (
                <p className="text-lg leading-relaxed font-normal text-white/90">
                  "{analysis?.strategy || t('menuReview.analysis.loadingStrategy')}"
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
                  {t('menuReview.menu.heading')}
                </h3>
                <p className="text-[10px] text-white mt-1 uppercase">{t('menuReview.sectionHint')}</p>
              </div>
              <button
                onClick={startDraftDish}
                disabled={!!draftDish}
                className="flex items-center gap-2 bg-brand-accent/10 hover:bg-brand-accent/20 text-brand-accent px-3 py-1.5 rounded-lg border border-brand-accent/30 transition-all text-[10px] uppercase font-bold tracking-widest disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <Plus size={14} />
                {t('menuReview.menu.addButton')}
              </button>
            </div>
            
            <div className="flex-1 overflow-auto p-0">
              <table className="w-full text-left border-collapse">
                <thead className="sticky top-0 bg-brand-bg-dark z-10">
                  <tr className="border-b border-white/10">
                    <th className="px-4 py-3 text-[10px] uppercase tracking-widest opacity-40 font-medium">{t('menuReview.menu.columns.category')}</th>
                    <th className="px-4 py-3 text-[10px] uppercase tracking-widest opacity-40 font-medium">{t('menuReview.menu.columns.dish')}</th>
                    <th className="px-4 py-3 text-[10px] uppercase tracking-widest opacity-40 font-medium">{t('menuReview.menu.columns.ingredients')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                      {draftDish && (
                        <React.Fragment key="draft-dish">
                          <tr className="bg-brand-accent/10 border-l-4 border-brand-accent">
                            <td className="px-4 pt-4 pb-1 align-top">
                              <input
                                type="text"
                                value={draftDish.category || ""}
                                onChange={(e) => updateDraftDish('category', e.target.value)}
                                placeholder={t('menuReview.menu.placeholders.category')}
                                className="w-full text-[10px] uppercase bg-transparent border border-brand-accent/40 rounded px-2 py-1 text-white focus:outline-none focus:border-brand-accent"
                              />
                            </td>
                            <td className="px-4 pt-4 pb-1 align-top">
                              <input
                                type="text"
                                value={draftDish.name || ""}
                                onChange={(e) => updateDraftDish('name', e.target.value)}
                                placeholder={t('menuReview.menu.placeholders.name')}
                                autoFocus
                                className="w-full font-bold uppercase tracking-tight text-sm bg-transparent border border-brand-accent/40 rounded px-2 py-1 text-white focus:outline-none focus:border-brand-accent"
                              />
                            </td>
                            <td className="px-4 pt-4 pb-1 align-top">
                              <input
                                type="text"
                                value={draftDish.fullIngredients || ""}
                                onChange={(e) => updateDraftDish('fullIngredients', e.target.value)}
                                placeholder={t('menuReview.menu.placeholders.ingredients')}
                                className="w-full text-xs italic bg-transparent border border-brand-accent/40 rounded px-2 py-1 text-white/80 focus:outline-none focus:border-brand-accent"
                              />
                            </td>
                          </tr>
                          <tr className="bg-brand-accent/10 border-l-4 border-brand-accent">
                            <td colSpan={3} className="px-4 pb-3 pt-1">
                              <div className="flex items-center justify-between gap-3">
                                <span className="text-[9px] uppercase tracking-widest text-white/40">
                                  {t('menuReview.draft.notice')}
                                </span>
                                <div className="flex gap-2">
                                  <button
                                    onClick={cancelDraftDish}
                                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-white/20 text-[10px] uppercase font-bold tracking-widest text-white/60 hover:text-white hover:border-white/40 transition-all"
                                  >
                                    <X size={12} /> {t('menuReview.draft.cancel')}
                                  </button>
                                  <button
                                    onClick={confirmDraftDish}
                                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-brand-accent text-brand-bg text-[10px] uppercase font-bold tracking-widest hover:brightness-110 transition-all"
                                  >
                                    <Check size={12} strokeWidth={3} /> {t('menuReview.draft.confirm')}
                                  </button>
                                </div>
                              </div>
                            </td>
                          </tr>
                        </React.Fragment>
                      )}
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
                      {paginatedDishes.length === 0 && !draftDish && (
                        <tr key="empty-food">
                          <td colSpan={3} className="px-4 py-8 text-center text-xs opacity-40 uppercase tracking-widest">
                            {t('menuReview.menu.empty')}
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
                <ChevronLeft size={13} /> {t('menuReview.pagination.prev')}
              </button>
              <span className="text-[10px] uppercase tracking-widest font-bold text-white/40 text-center">
                {sortedDishes.length === 0 ? t('menuReview.menu.zeroCount') : t('menuReview.pagination.range', { start: (foodPage - 1) * ITEMS_PER_PAGE + 1, end: Math.min(foodPage * ITEMS_PER_PAGE, sortedDishes.length), total: sortedDishes.length })}
              </span>
              <button
                onClick={() => setFoodPage(p => Math.min(totalFoodPages, p + 1))}
                disabled={foodPage === totalFoodPages}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 text-[10px] uppercase tracking-widest font-bold disabled:opacity-20 disabled:cursor-not-allowed hover:enabled:border-brand-accent hover:enabled:text-brand-accent transition-all"
              >
                {t('menuReview.pagination.next')} <ChevronRight size={13} />
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
                  {t('menuReview.drinks.heading')}
                </h3>
                <p className="text-[10px] text-white mt-1 uppercase">{t('menuReview.sectionHint')}</p>
                <p className="text-[10px] text-brand-accent mt-1 leading-snug">
                  ⭐ {t('menuReview.drinks.priorityHint')}
                  <span className="ml-2 opacity-60">({visibleDrinks.filter(d => d.isPriority).length}/5)</span>
                </p>
              </div>
              <button
                onClick={startDraftDrink}
                disabled={!!draftDrink}
                className="flex items-center gap-2 bg-brand-accent/10 hover:bg-brand-accent/20 text-brand-accent px-3 py-1.5 rounded-lg border border-brand-accent/30 transition-all text-[10px] uppercase font-bold tracking-widest disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <Plus size={14} />
                {t('menuReview.drinks.addButton')}
              </button>
            </div>

            <div className="flex-1 overflow-auto p-0">
              <table className="w-full text-left border-collapse">
                <thead className="sticky top-0 bg-brand-bg-dark z-10">
                  <tr className="border-b border-white/10">
                    <th className="px-4 py-3 text-[10px] uppercase tracking-widest opacity-40 font-medium">{t('menuReview.drinks.columns.category')}</th>
                    <th className="px-4 py-3 text-[10px] uppercase tracking-widest opacity-40 font-medium">{t('menuReview.drinks.columns.producer')}</th>
                    <th className="px-4 py-3 text-[10px] uppercase tracking-widest opacity-40 font-medium">{t('menuReview.drinks.columns.product')}</th>
                    <th className="px-4 py-3 text-[10px] uppercase tracking-widest opacity-40 font-medium text-right">{t('menuReview.drinks.columns.price')}</th>
                    <th className="px-4 py-3 text-[10px] uppercase tracking-widest opacity-40 font-medium text-center">{t('menuReview.drinks.columns.priority')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {draftDrink && (
                    <React.Fragment key="draft-drink">
                      <tr className="bg-brand-accent/10 border-l-4 border-brand-accent">
                        <td className="px-4 pt-4 pb-1 align-top">
                          <select
                            value={draftDrink.category || "Vino Rosso"}
                            onChange={(e) => updateDraftDrink('category', e.target.value)}
                            className="w-full text-[10px] uppercase bg-brand-bg-dark border border-brand-accent/40 rounded px-2 py-1 text-white focus:outline-none focus:border-brand-accent"
                          >
                            <option value="Vino Rosso">{t('menuReview.drinks.categoryOptions.redWine')}</option>
                            <option value="Vino Bianco">{t('menuReview.drinks.categoryOptions.whiteWine')}</option>
                            <option value="Vino Rosato">{t('menuReview.drinks.categoryOptions.roseWine')}</option>
                            <option value="Bollicine">{t('menuReview.drinks.categoryOptions.sparkling')}</option>
                            <option value="Vino Dolce">{t('menuReview.drinks.categoryOptions.sweetWine')}</option>
                          </select>
                          <input
                            type="text"
                            value={draftDrink.vintage || ""}
                            onChange={(e) => updateDraftDrink('vintage', e.target.value)}
                            placeholder={t('menuReview.drinks.placeholders.vintage')}
                            className="w-full mt-1 text-[10px] uppercase bg-transparent border border-brand-accent/40 rounded px-2 py-1 text-white/70 focus:outline-none focus:border-brand-accent"
                          />
                        </td>
                        <td className="px-4 pt-4 pb-1 align-top">
                          <input
                            type="text"
                            value={draftDrink.producer || ""}
                            onChange={(e) => updateDraftDrink('producer', e.target.value)}
                            placeholder={t('menuReview.drinks.placeholders.producer')}
                            className="w-full text-xs uppercase bg-transparent border border-brand-accent/40 rounded px-2 py-1 text-white focus:outline-none focus:border-brand-accent"
                          />
                        </td>
                        <td className="px-4 pt-4 pb-1 align-top">
                          <input
                            type="text"
                            value={draftDrink.product || ""}
                            onChange={(e) => updateDraftDrink('product', e.target.value)}
                            placeholder={t('menuReview.drinks.placeholders.name')}
                            autoFocus
                            className="w-full font-bold uppercase tracking-tight text-sm bg-transparent border border-brand-accent/40 rounded px-2 py-1 text-white focus:outline-none focus:border-brand-accent"
                          />
                        </td>
                        <td className="px-4 pt-4 pb-1 align-top text-right">
                          <input
                            type="text"
                            value={draftDrink.price || ""}
                            onChange={(e) => updateDraftDrink('price', e.target.value)}
                            placeholder={t('menuReview.drinks.placeholders.price')}
                            className="w-full text-right font-mono text-xs bg-transparent border border-brand-accent/40 rounded px-2 py-1 text-white/80 focus:outline-none focus:border-brand-accent"
                          />
                        </td>
                        <td className="px-4 pt-4 pb-1 align-top text-center text-[9px] uppercase tracking-widest text-white/30">
                          —
                        </td>
                      </tr>
                      <tr className="bg-brand-accent/10 border-l-4 border-brand-accent">
                        <td colSpan={5} className="px-4 pb-3 pt-1">
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-[9px] uppercase tracking-widest text-white/40">
                              {t('menuReview.draft.notice')}
                            </span>
                            <div className="flex gap-2">
                              <button
                                onClick={cancelDraftDrink}
                                className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-white/20 text-[10px] uppercase font-bold tracking-widest text-white/60 hover:text-white hover:border-white/40 transition-all"
                              >
                                <X size={12} /> {t('menuReview.draft.cancel')}
                              </button>
                              <button
                                onClick={confirmDraftDrink}
                                className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-brand-accent text-brand-bg text-[10px] uppercase font-bold tracking-widest hover:brightness-110 transition-all"
                              >
                                <Check size={12} strokeWidth={3} /> {t('menuReview.draft.confirm')}
                              </button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    </React.Fragment>
                  )}
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
                  {paginatedDrinks.length === 0 && !draftDrink && (
                    <tr key="empty-drinks">
                      <td colSpan={5} className="px-4 py-8 text-center text-xs opacity-40 uppercase tracking-widest">
                        {t('menuReview.drinks.empty')}
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
                <ChevronLeft size={13} /> {t('menuReview.pagination.prev')}
              </button>
              <span className="text-[10px] uppercase tracking-widest font-bold text-white/40 text-center">
                {t('menuReview.pagination.range', { start: (drinkPage - 1) * ITEMS_PER_PAGE + 1, end: Math.min(drinkPage * ITEMS_PER_PAGE, sortedDrinks.length), total: sortedDrinks.length })}
              </span>
              <button
                onClick={() => setDrinkPage(p => Math.min(totalDrinkPages, p + 1))}
                disabled={drinkPage === totalDrinkPages}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 text-[10px] uppercase tracking-widest font-bold disabled:opacity-20 disabled:cursor-not-allowed hover:enabled:border-brand-accent hover:enabled:text-brand-accent transition-all"
              >
                {t('menuReview.pagination.next')} <ChevronRight size={13} />
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
          {t('menuReview.finalize')}
        </button>
      </div>
    </motion.div>
  );
}
