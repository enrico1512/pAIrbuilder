import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { UtensilsCrossed, Loader2, ChevronDown, User, Mail, Info, Settings, LogOut, AlertCircle, CheckCircle2, Zap, BrainCircuit } from "lucide-react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Trans, useTranslation } from "react-i18next";
import RestaurantOnboarding from "./components/RestaurantOnboarding";
import MenuUpload from "./components/MenuUpload";
import MenuReview from "./components/MenuReview";
import PairingResults from "./components/PairingResults";
import AboutSection, { type InfoMode } from "./components/AboutSection";
import { FlashIcon } from "./components/FlashIcon";
import LanguageSwitcher from "./components/LanguageSwitcher";
import AuthModal from "./components/AuthModal";
import { useAuth } from "./lib/auth";
import { toBcp47, currencyFor } from "./i18n/languageMap";

const AUTH_DISMISS_KEY = "pairbuilder.authDismissed";
import { generatePairings, extractMenuData, listItemNames, type Pairing, type Dish, type Drink } from "./lib/gemini";
import { parseExcel, parseWord, parsePDFDetailed } from "./lib/fileParser";
import { learningService } from "./lib/learningService";

type Step = "welcome" | "restaurant" | "upload" | "extracting" | "review" | "loading" | "results" | "about" | "add-drinks";

export default function App() {
  const { t, i18n } = useTranslation();
  const auth = useAuth();
  const [step, setStep] = useState<Step>("welcome");
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authModalTab, setAuthModalTab] = useState<'login' | 'register'>('register');
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Auto-open auth popup on first visit: only if not logged in, only after
  // /api/auth/me has resolved (auth.loading=false), and only if the user
  // hasn't already dismissed it ("continue as guest"). Persists dismissal
  // in localStorage so the popup doesn't reappear every page load.
  useEffect(() => {
    if (auth.loading) return;
    if (auth.user) return;
    if (localStorage.getItem(AUTH_DISMISS_KEY) === '1') return;
    setAuthModalTab('register');
    setAuthModalOpen(true);
  }, [auth.loading, auth.user]);

  const handleAuthClose = () => {
    if (!auth.user) localStorage.setItem(AUTH_DISMISS_KEY, '1');
    setAuthModalOpen(false);
  };

  const openAuthModal = (tab: 'login' | 'register') => {
    setAuthModalTab(tab);
    setAuthModalOpen(true);
  };

  const handleLogout = async () => {
    await auth.logout();
    localStorage.removeItem(AUTH_DISMISS_KEY);
  };

  // Ensure scroll to top on step changes
  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo(0, 0);
    }
  }, [step]);

  const [previousStep, setPreviousStep] = useState<Step>("welcome");
  const [infoMode, setInfoMode] = useState<InfoMode>("how-it-works");
  const [showHowItWorks, setShowHowItWorks] = useState(false);
  const [restaurantData, setRestaurantData] = useState<{ name: string; type: string; email: string; phone: string; logo: string | null } | null>(null);
  const [foodResults, setFoodResults] = useState<{ dishes: Dish[]; drinks: Drink[] }[]>([]);
  const [drinkResults, setDrinkResults] = useState<{ dishes: Dish[]; drinks: Drink[] }[]>([]);
  const [foodCurrentPage, setFoodCurrentPage] = useState(0);
  const [drinkCurrentPage, setDrinkCurrentPage] = useState(0);
  const [totalFilesCount, setTotalFilesCount] = useState(0);
  const [processingIndex, setProcessingIndex] = useState(0);
  const [currentExtractionItem, setCurrentExtractionItem] = useState<string | null>(null);
  const [extractionMode, setExtractionMode] = useState<"counting" | "extracting">("counting");
  const [pairings, setPairings] = useState<Pairing[]>([]);
  const [funPhrase, setFunPhrase] = useState("");

  const [extractedDishesMemory, setExtractedDishesMemory] = useState<Dish[]>([]);
  const [extractedDrinksMemory, setExtractedDrinksMemory] = useState<Drink[]>([]);
  const [pendingDrinkFiles, setPendingDrinkFiles] = useState<File[]>([]);
  const [processedDrinkFileCount, setProcessedDrinkFileCount] = useState(0);
  const [hasPartialResults, setHasPartialResults] = useState(false);

  const foodPhrases = {
    counting: t('app.funPhrases.food.counting', { returnObjects: true }) as string[],
    extracting: t('app.funPhrases.food.extracting', { returnObjects: true }) as string[]
  };

  const drinkPhrases = {
    counting: t('app.funPhrases.drinks.counting', { returnObjects: true }) as string[],
    extracting: t('app.funPhrases.drinks.extracting', { returnObjects: true }) as string[]
  };

  const [currentScanningCounts, setCurrentScanningCounts] = useState({ dishes: 0, drinks: 0 });

  useEffect(() => {
    let interval: any;
    if (step === "extracting") {
      const isDrinks = processingIndex > (totalFilesCount / 2); // Simple heuristic or track phase
      const phase = extractionMode;
      const pool = isDrinks ? drinkPhrases[phase as keyof typeof drinkPhrases] : foodPhrases[phase as keyof typeof foodPhrases];
      
      setFunPhrase(pool[Math.floor(Math.random() * pool.length)]);
      interval = setInterval(() => {
        const currentPool = isDrinks ? drinkPhrases[phase as keyof typeof drinkPhrases] : foodPhrases[phase as keyof typeof foodPhrases];
        setFunPhrase(currentPool[Math.floor(Math.random() * currentPool.length)]);
      }, 4000);
    }
    return () => clearInterval(interval);
  }, [step, extractionMode, processingIndex, totalFilesCount]);

  const getUserContext = () => {
    const active = i18n.resolvedLanguage || i18n.language || navigator.language || 'it';
    return { lang: toBcp47(active), currency: currencyFor(active) };
  };

  const [configStatus, setConfigStatus] = useState<{ visionApiKeyPresent: boolean; status: string; message: string } | null>(null);

  useEffect(() => {
    fetch("/api/config-check")
      .then(res => res.json())
      .then(setConfigStatus)
      .catch(err => console.error("Config check failed:", err));
  }, []);

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const base64 = (reader.result as string).split(",")[1];
        resolve(base64);
      };
      reader.onerror = (error) => reject(error);
    });
  };

  const resizeImage = (file: File, maxWidth = 2048, maxHeight = 2048): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target?.result as string;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > maxWidth) {
              height *= maxWidth / width;
              width = maxWidth;
            }
          } else {
            if (height > maxHeight) {
              width *= maxHeight / height;
              height = maxHeight;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0, width, height);
          
          const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
          resolve(dataUrl.split(',')[1]);
        };
        img.onerror = reject;
      };
      reader.onerror = reject;
    });
  };

  const handleStart = () => {
    // Reset memory when starting fresh
    setExtractedDishesMemory([]);
    setExtractedDrinksMemory([]);
    setPendingDrinkFiles([]);
    setProcessedDrinkFileCount(0);
    setHasPartialResults(false);
    setStep("restaurant");
  };

  const handleRestaurantSubmit = (data: { name: string; type: string; email: string; phone: string; logo: string | null }) => {
    setRestaurantData(data);
    setStep("upload");
  };

  const handleAddMoreDrinks = async (newDrinkFiles: File[]) => {
    const currentDishes = extractedDishesMemory.length > 0 ? extractedDishesMemory : foodResults.flatMap(p => p.dishes);
    setExtractedDishesMemory(currentDishes);
    await handleFilesSubmit([], newDrinkFiles);
  };

  const handleFilesSubmit = async (menus: File[], drinks: File[]) => {
    const isAddingDrinks = extractedDishesMemory.length > 0 && menus.length === 0;
    
    setStep("extracting");
    setTotalFilesCount(menus.length + drinks.length);
    setProcessingIndex(0);
    
    if (!isAddingDrinks) {
      setFoodResults([]);
      setExtractedDishesMemory([]);
    }
    
    setDrinkResults([]);
    setFoodCurrentPage(0);
    setDrinkCurrentPage(0);
    setExtractionMode("counting");
    setCurrentExtractionItem(null);
    setCurrentScanningCounts({ dishes: 0, drinks: 0 });
    setPendingDrinkFiles(drinks);
    setProcessedDrinkFileCount(0);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 300000); // 300 seconds timeout

    try {
      let allExtractedDishes: Dish[] = isAddingDrinks ? extractedDishesMemory : [];
      
      if (!isAddingDrinks) {
        // Process Food Menus Page by Page
        for (const [idx, f] of menus.entries()) {
          if (controller.signal.aborted) throw new Error("TIMEOUT");
          
          setProcessingIndex(idx + 1);
          setExtractionMode("counting");
          setCurrentScanningCounts({ dishes: 0, drinks: 0 });
          setCurrentExtractionItem(t('app.extracting.progress.menuStructure'));
          
          let textContent: string | undefined = undefined;
          let imageBase64: string | undefined = undefined;
          let images: string[] | undefined = undefined;

          if (f.type.startsWith("image/")) {
            imageBase64 = await resizeImage(f);
          } else if (f.type === "application/pdf" || f.name.endsWith(".pdf")) {
            const pdfResult = await parsePDFDetailed(f);
            textContent = pdfResult.text;
            images = pdfResult.images;
          } else if (f.type === "text/plain") {
            textContent = await f.text();
          } else if (f.name.endsWith(".docx") || f.name.endsWith(".doc")) {
            textContent = await parseWord(f);
          } else if (f.name.endsWith(".xlsx") || f.name.endsWith(".xls") || f.name.endsWith(".csv")) {
            textContent = await parseExcel(f);
          }

          const baseData = {
            imageBase64,
            images,
            text: textContent,
            mimeType: f.type.startsWith("image/") ? 'image/jpeg' : f.type,
          };

          const scan = await listItemNames(baseData);
          
          const foundDishes = scan.dishes?.length || 0;
          const foundDrinks = scan.drinks?.length || 0;
          setCurrentScanningCounts({ dishes: foundDishes, drinks: foundDrinks });
          
          const totalItemsOnPage = foundDishes + foundDrinks;
          
          setExtractionMode("extracting");
          
          const result = await extractMenuData(
            [baseData], 
            [], 
            totalItemsOnPage > 0 ? scan : undefined,
            (extractedDishes, extractedDrinks) => {
              if (extractedDishes > 0 || extractedDrinks > 0) {
                setCurrentExtractionItem(t('app.extracting.progress.transcribing', { done: extractedDishes + extractedDrinks, total: totalItemsOnPage }));
                setCurrentScanningCounts({ dishes: Math.max(foundDishes, extractedDishes), drinks: Math.max(foundDrinks, extractedDrinks) });
              }
            }
          );
          
          setFoodResults(prev => [...prev, result]);
          allExtractedDishes.push(...result.dishes);
          setCurrentScanningCounts({ dishes: 0, drinks: 0 });
          setCurrentExtractionItem(null);
        }
      }

      // Process Drink Lists Page by Page
      for (const [idx, f] of drinks.entries()) {
        if (controller.signal.aborted) throw new Error("TIMEOUT");

        setProcessingIndex((isAddingDrinks ? 0 : menus.length) + idx + 1);
        setExtractionMode("counting");
        setCurrentScanningCounts({ dishes: 0, drinks: 0 });
        setCurrentExtractionItem(t('app.extracting.progress.drinkList'));
        
        let textContent: string | undefined = undefined;
        let imageBase64: string | undefined = undefined;
        let images: string[] | undefined = undefined;

        if (f.type.startsWith("image/")) {
          imageBase64 = await resizeImage(f);
        } else if (f.type === "application/pdf" || f.name.endsWith(".pdf")) {
          const pdfResult = await parsePDFDetailed(f);
          textContent = pdfResult.text;
          images = pdfResult.images;
        } else if (f.type === "text/plain") {
          textContent = await f.text();
        } else if (f.name.endsWith(".docx") || f.name.endsWith(".doc")) {
          textContent = await parseWord(f);
        } else if (f.name.endsWith(".xlsx") || f.name.endsWith(".xls") || f.name.endsWith(".csv")) {
          textContent = await parseExcel(f);
        }

        const baseData = {
          imageBase64,
          images,
          text: textContent,
          mimeType: f.type.startsWith("image/") ? 'image/jpeg' : f.type,
        };

        const scan = await listItemNames(baseData);
        
        const foundDishes = scan.dishes?.length || 0;
        const foundDrinks = scan.drinks?.length || 0;
        setCurrentScanningCounts({ dishes: foundDishes, drinks: foundDrinks });
        
        const totalItemsOnPage = foundDishes + foundDrinks;

        setExtractionMode("extracting");

        const result = await extractMenuData(
          [], 
          [baseData], 
          totalItemsOnPage > 0 ? scan : undefined,
          (extractedDishes, extractedDrinks) => {
            if (extractedDishes > 0 || extractedDrinks > 0) {
              setCurrentExtractionItem(t('app.extracting.progress.digitalizing', { done: extractedDishes + extractedDrinks, total: totalItemsOnPage }));
              setCurrentScanningCounts({ dishes: Math.max(foundDishes, extractedDishes), drinks: Math.max(foundDrinks, extractedDrinks) });
            }
          }
        );
        
        setDrinkResults(prev => [...prev, result]);
        setExtractedDrinksMemory(prev => [...prev, ...result.drinks]);
        setProcessedDrinkFileCount(idx + 1);
        setCurrentScanningCounts({ dishes: 0, drinks: 0 });
        setCurrentExtractionItem(null);
      }

      // Commit food results to memory as well
      if (!isAddingDrinks) {
        setExtractedDishesMemory(allExtractedDishes);
      }
    
      setStep("review");
      clearTimeout(timeoutId);
    } catch (error) {
      clearTimeout(timeoutId);
      console.error("Extraction error:", error);
      
      if (error instanceof Error && error.message === "TIMEOUT") {
        const remaining = drinks.slice(processedDrinkFileCount);
        
        if (remaining.length > 0) {
          setPendingDrinkFiles(remaining);
          setHasPartialResults(true);
          // Make sure we have the food results in memory if it was the first run
          if (!isAddingDrinks && foodResults.length > 0) {
            setExtractedDishesMemory(foodResults.flatMap(p => p.dishes));
          }
          setStep("add-drinks");
        } else {
          setStep("review");
        }
      } else {
        alert(error instanceof Error ? error.message : t('app.errors.extractionFailed'));
        setStep("upload");
      }
    }
  };

  const handleReviewConfirm = (allDishes: Dish[], allDrinks: Drink[]) => {
    // Save feedback for learning (verified items)
    // We take a few high-quality ones to avoid overwhelming the prompt
    allDishes.slice(0, 3).forEach(dish => {
      learningService.saveFeedback('dish', dish.name, dish);
    });
    allDrinks.slice(0, 3).forEach(drink => {
      learningService.saveFeedback('drink', drink.product, drink);
    });

    setStep("loading");
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 300000); // 300 seconds timeout

    (async () => {
      try {
        const restaurantContext = `Ristorante: ${restaurantData?.name}. Cucina: ${restaurantData?.type}.`;
        const context = getUserContext();
        
        const finalDishes = extractedDishesMemory.length > 0 ? extractedDishesMemory : allDishes;
        
        // Deduplicate drinks
        const drinkMap = new Map();
        [...extractedDrinksMemory, ...allDrinks].forEach(d => {
          if (d.product) drinkMap.set(d.product.toLowerCase().trim(), d);
        });
        const finalDrinks = Array.from(drinkMap.values()) as Drink[];

        const pairingPromise = generatePairings(
          restaurantContext, 
          finalDishes, 
          finalDrinks,
          `${context.lang}|${context.currency}`
        );

        const timeoutPromise = new Promise<never>((_, reject) => {
          controller.signal.addEventListener("abort", () => reject(new Error("TIMEOUT")));
        });

        const result = await Promise.race([pairingPromise, timeoutPromise]);
        
        setPairings(result);
        setStep("results");
        clearTimeout(timeoutId);
      } catch (error) {
        clearTimeout(timeoutId);
        console.error("Pairing error:", error);
        if (error instanceof Error && error.message === "TIMEOUT") {
          alert(t('app.errors.timeout'));
        } else {
          alert(t('app.errors.pairingFailed'));
        }
        setStep("review");
      }
    })();
  };

  return (
    <div className="h-screen flex flex-col overflow-hidden selection:bg-brand-accent selection:text-brand-bg">
      {/* Header */}
      <header className="grid grid-cols-3 items-center px-6 md:px-10 py-6 border-b border-white/10 z-10 bg-brand-bg/80 backdrop-blur-sm sticky top-0">
        <div className="flex items-center gap-4">
          <div className="text-left hidden lg:block">
            <p className="text-[10px] uppercase tracking-widest opacity-60">{t('app.header.restaurantLabel')}</p>
            <p className="text-sm font-bold truncate max-w-[150px]">{restaurantData?.name || auth.restaurant?.name || t('app.header.restaurantFallback')}</p>
          </div>
        </div>

        <div className="text-center invisible md:visible opacity-0 pointer-events-none">
          {/* Title removed as requested */}
        </div>

        <div className="flex justify-end items-center gap-4">
          <LanguageSwitcher />
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <button className="flex items-center gap-2 bg-white/5 hover:bg-white/10 px-4 py-2 rounded-full transition-colors border border-white/10 outline-none">
                <User size={18} className="text-brand-accent" />
                <span className="text-xs font-bold uppercase tracking-widest hidden sm:inline">{t('app.header.menuTrigger')}</span>
                <ChevronDown size={14} className="opacity-50" />
              </button>
            </DropdownMenu.Trigger>

            <DropdownMenu.Portal>
              <DropdownMenu.Content 
                className="glass-panel min-w-[200px] p-2 mt-2 z-50 animate-in fade-in zoom-in-95 duration-200"
                align="end"
              >
                <DropdownMenu.Item 
                  onClick={() => { setInfoMode("about-us"); setPreviousStep(step); setStep("about"); }}
                  className="flex items-center gap-3 px-4 py-3 text-sm text-white/80 hover:text-white hover:bg-white/5 rounded-lg outline-none cursor-pointer transition-colors"
                >
                  <BrainCircuit size={16} className="text-brand-accent" />
                  <span>{t('app.dropdown.aboutUs')}</span>
                </DropdownMenu.Item>
                <DropdownMenu.Item 
                  onClick={() => { setInfoMode("how-it-works"); setPreviousStep(step); setStep("about"); }}
                  className="flex items-center gap-3 px-4 py-3 text-sm text-white/80 hover:text-white hover:bg-white/5 rounded-lg outline-none cursor-pointer transition-colors"
                >
                  <FlashIcon size={16} className="text-brand-accent" />
                  <span>{t('app.dropdown.howItWorks')}</span>
                </DropdownMenu.Item>
                <DropdownMenu.Item 
                  onClick={() => { setInfoMode("contact"); setPreviousStep(step); setStep("about"); }}
                  className="flex items-center gap-3 px-4 py-3 text-sm text-white/80 hover:text-white hover:bg-white/5 rounded-lg outline-none cursor-pointer transition-colors"
                >
                  <Mail size={16} className="text-brand-accent" />
                  <span>{t('app.dropdown.contact')}</span>
                </DropdownMenu.Item>
                <DropdownMenu.Separator className="h-px bg-white/10 my-2" />
                {auth.user ? (
                  <>
                    <div className="px-4 py-2 text-[10px] uppercase tracking-widest text-white/40">
                      {t('auth.menu.loggedAs', { name: auth.restaurant?.name || auth.user.email })}
                    </div>
                    <DropdownMenu.Item
                      onClick={handleLogout}
                      className="flex items-center gap-3 px-4 py-3 text-sm text-red-400 hover:bg-red-500/10 rounded-lg outline-none cursor-pointer transition-colors mt-1"
                    >
                      <LogOut size={16} />
                      <span>{t('auth.menu.logout')}</span>
                    </DropdownMenu.Item>
                  </>
                ) : (
                  <>
                    <DropdownMenu.Item
                      onClick={() => openAuthModal('login')}
                      className="flex items-center gap-3 px-4 py-3 text-sm text-white/80 hover:text-white hover:bg-white/5 rounded-lg outline-none cursor-pointer transition-colors"
                    >
                      <User size={16} className="text-brand-accent" />
                      <span>{t('auth.menu.loginEntry')}</span>
                    </DropdownMenu.Item>
                    <DropdownMenu.Item
                      onClick={() => openAuthModal('register')}
                      className="flex items-center gap-3 px-4 py-3 text-sm text-brand-accent hover:bg-brand-accent/10 rounded-lg outline-none cursor-pointer transition-colors"
                    >
                      <Settings size={16} />
                      <span>{t('auth.menu.registerEntry')}</span>
                    </DropdownMenu.Item>
                  </>
                )}
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col relative overflow-hidden">
        <div ref={scrollContainerRef} className="flex-1 px-6 md:px-10 py-8 overflow-y-auto">
          <AnimatePresence mode="wait">
            {step === "welcome" && (
              <motion.section
                key="welcome"
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="h-full flex flex-col items-center justify-center text-center space-y-8 py-12"
              >
                <div className="space-y-4 max-w-3xl">
                  <h2 className="text-7xl lg:text-9xl leading-[0.8] mb-4 uppercase font-display text-brand-accent font-normal tracking-tight">
                    p<span className="text-white">AI</span>rbuilder
                  </h2>
                  <p className="text-xl text-white font-light max-w-xl mx-auto">
                    {t('app.welcome.tagline')}
                  </p>
                </div>
                <button onClick={handleStart} className="btn-primary text-2xl px-12 py-4 mt-8">
                  {t('app.welcome.cta')}
                </button>

                <div className="flex flex-col items-center">
                  <div className="max-w-4xl text-sm text-white/80 mt-10 leading-relaxed flex flex-col items-center gap-10">
                    {/* Sezione Perche' Funziona */}
                    <div className="w-full space-y-6">
                      <h3 className="text-3xl font-display text-brand-accent uppercase tracking-tight text-center font-normal">{t('app.welcome.whyHeading')}</h3>
                      <div className="grid md:grid-cols-3 gap-6 text-left">
                        <div className="glass-panel p-6 border-brand-accent/20 bg-brand-accent/5">
                          <p className="text-white/80">{t('app.welcome.whyCard1')}</p>
                        </div>
                        <div className="glass-panel p-6 border-brand-accent/20 bg-brand-accent/5">
                          <p className="text-white/80">{t('app.welcome.whyCard2')}</p>
                        </div>
                        <div className="glass-panel p-6 border-brand-accent/20 bg-brand-accent/5">
                          <p className="text-white/80">{t('app.welcome.whyCard3')}</p>
                        </div>
                      </div>
                    </div>

                    {/* Sezione Come Funziona (Tecnologia) */}
                    <div className="max-w-2xl text-center space-y-6 pt-10 border-t border-white/10">
                      <h3 className="text-3xl font-display text-brand-accent uppercase tracking-tight font-normal">{t('app.welcome.howHeading')}</h3>
                      <p className="text-white/80">{t('app.welcome.howDescription')}</p>
                      <button
                        onClick={() => { setInfoMode("how-it-works"); setStep("about"); }}
                        className="text-brand-accent hover:underline text-xs font-bold uppercase tracking-wider"
                      >
                        {t('app.welcome.discoverMore')}
                      </button>
                    </div>
                  </div>
                </div>
              </motion.section>
            )}

            {step === "restaurant" && (
              <RestaurantOnboarding key="restaurant" onNext={handleRestaurantSubmit} />
            )}

            {step === "upload" && (
              <MenuUpload key="upload" onBack={() => setStep("restaurant")} onNext={handleFilesSubmit} />
            )}

            {step === "extracting" && (
              <motion.div
                key="extracting"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="h-full flex flex-col items-center justify-center py-24 space-y-8"
              >
                <div className="relative group">
                  <div className="absolute inset-0 bg-brand-accent/20 blur-2xl rounded-full group-hover:bg-brand-accent/30 transition-all duration-500 animate-pulse"></div>
                  <Loader2 className="animate-spin text-brand-accent relative z-10" size={80} />
                </div>
                <div className="text-center space-y-4">
                  <div className="space-y-1">
                    <h2 className="text-4xl uppercase font-display tracking-tight font-normal">
                      {extractionMode === "counting" ? t('app.extracting.headingCounting') : t('app.extracting.headingExtracting')}
                    </h2>
                    <p className="text-white/60 italic text-lg">"{funPhrase}"</p>
                    <p className="text-white/40 text-sm">{t('app.extracting.pageOf', { current: processingIndex, total: totalFilesCount })}</p>
                  </div>
                  
                  {currentExtractionItem && (
                    <motion.p 
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="text-brand-accent font-medium"
                    >
                      {currentExtractionItem}
                    </motion.p>
                  )}

                  <div className="w-64 h-1 bg-white/10 rounded-full mx-auto overflow-hidden">
                    <motion.div 
                      className="h-full bg-brand-accent"
                      initial={{ width: 0 }}
                      animate={{ width: `${(processingIndex / totalFilesCount) * 100}%` }}
                    />
                  </div>

                  {/* Real-time Extraction Counters */}
                  <div className="flex justify-center gap-10 mt-6 pt-4 border-t border-white/5">
                    <div className="text-center">
                      <div className="text-3xl font-display text-brand-accent leading-none">
                        {foodResults.reduce((acc, p) => acc + p.dishes.length, 0) + currentScanningCounts.dishes}
                      </div>
                      <div className="text-[10px] uppercase tracking-[0.2em] opacity-40 mt-1">{t('app.extracting.counter.dishes')}</div>
                    </div>
                    <div className="text-center">
                      <div className="text-3xl font-display text-brand-accent leading-none">
                        {[...foodResults, ...drinkResults].reduce((acc, p) => acc + (p.drinks?.length || 0), 0) + currentScanningCounts.drinks}
                      </div>
                      <div className="text-[10px] uppercase tracking-[0.2em] opacity-40 mt-1">{t('app.extracting.counter.drinks')}</div>
                    </div>
                  </div>

                  <p className="text-[10px] uppercase tracking-[0.2em] opacity-40 animate-pulse">
                    {extractionMode === "counting" ? t('app.extracting.statusCounting') : t('app.extracting.statusExtracting')}
                  </p>
                </div>
              </motion.div>
            )}

            {step === "review" && (foodResults.length > 0 || drinkResults.length > 0) && (
              <MenuReview 
                foodPages={foodResults}
                drinkPages={drinkResults}
                onConfirm={handleReviewConfirm} 
              />
            )}

            {step === "loading" && (
              <motion.div
                key="loading"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="h-full flex flex-col items-center justify-center py-24 space-y-8"
              >
                <Loader2 className="animate-spin text-brand-accent" size={64} />
                <div className="text-center space-y-2">
                  <h2 className="text-4xl uppercase">{t('app.loading.title')}</h2>
                  <p className="text-white/60 italic font-display text-xl">{t('app.loading.subtitle')}</p>
                </div>
              </motion.div>
            )}

            {step === "results" && (
              <PairingResults 
                key="results" 
                pairings={pairings} 
                restaurant={restaurantData} 
                onReset={() => setStep("welcome")}
              />
            )}

            {step === "about" && (
              <AboutSection key="about" mode={infoMode} onBack={() => setStep("welcome")} />
            )}

            {step === "add-drinks" && (
              <motion.section
                key="add-drinks"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="max-w-4xl mx-auto space-y-8 py-10"
              >
                <div className="glass-panel p-10 space-y-8 text-center border-brand-accent/30 bg-brand-accent/5">
                  <div className="mx-auto w-20 h-20 flex items-center justify-center text-brand-accent mb-6">
                    <FlashIcon size={64} />
                  </div>
                  <h2 className="text-4xl font-display uppercase tracking-tight font-normal">{t('app.addDrinks.title')}</h2>
                  <div className="space-y-4 max-w-2xl mx-auto">
                    <p className="text-lg text-white/70">
                      <Trans
                        i18nKey="app.addDrinks.summary"
                        values={{ dishes: extractedDishesMemory.length, drinks: extractedDrinksMemory.length }}
                        components={{ 1: <strong />, 3: <strong /> }}
                      />
                    </p>
                    <div className="flex flex-col items-center gap-2 p-4 bg-white/5 rounded-xl border border-white/10">
                      <p className="text-sm font-bold uppercase tracking-widest text-brand-accent">{t('app.addDrinks.remainingHeading', { count: pendingDrinkFiles.length })}</p>
                      <ul className="text-xs space-y-1 opacity-60">
                        {pendingDrinkFiles.map((f, i) => (
                          <li key={i}>{f.name}</li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-4 justify-center pt-6">
                    <button 
                      onClick={() => handleAddMoreDrinks(pendingDrinkFiles)}
                      className="btn-primary flex items-center gap-2 px-8 py-4"
                    >
                      <Loader2 size={18} className="animate-spin" />
                      {t('app.addDrinks.continueButton')}
                    </button>
                    <button
                      onClick={() => setStep("review")}
                      className="glass-panel px-8 py-4 hover:bg-white/10 transition-colors uppercase text-sm font-bold tracking-widest border-white/10"
                    >
                      {t('app.addDrinks.skipButton')}
                    </button>
                  </div>
                  
                  <div className="pt-4">
                    <label className="cursor-pointer text-xs font-bold uppercase tracking-widest opacity-40 hover:opacity-100 transition-opacity underline decorate-brand-accent">
                      {t('app.addDrinks.addMoreLink')}
                      <input 
                        type="file" 
                        multiple 
                        className="hidden" 
                        onChange={(e) => {
                          if (e.target.files) {
                            handleAddMoreDrinks(Array.from(e.target.files));
                          }
                        }}
                      />
                    </label>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div className="glass-panel p-4 text-center">
                    <p className="text-[10px] uppercase opacity-40 mb-1">{t('app.addDrinks.stats.menuUploaded')}</p>
                    <p className="text-sm font-bold truncate">{restaurantData?.name}</p>
                  </div>
                  <div className="glass-panel p-4 text-center">
                    <p className="text-[10px] uppercase opacity-40 mb-1">{t('app.addDrinks.stats.dishesExtracted')}</p>
                    <p className="text-xl font-display text-brand-accent">{extractedDishesMemory.length}</p>
                  </div>
                  <div className="glass-panel p-4 text-center">
                    <p className="text-[10px] uppercase opacity-40 mb-1">{t('app.addDrinks.stats.drinksExtracted')}</p>
                    <p className="text-xl font-display text-brand-accent">{extractedDrinksMemory.length}</p>
                  </div>
                  <div className="glass-panel p-4 text-center">
                    <p className="text-[10px] uppercase opacity-40 mb-1">{t('app.addDrinks.stats.filesRemaining')}</p>
                    <p className="text-xl font-display text-brand-accent">{pendingDrinkFiles.length}</p>
                  </div>
                </div>
              </motion.section>
            )}
          </AnimatePresence>
        </div>
      </main>

      {/* Footer Section */}
      <footer className="py-6 px-6 md:px-10 border-t border-white/10 grid grid-cols-3 items-center bg-brand-bg-dark">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse shadow-[0_0_8px_rgba(74,222,128,0.5)]"></span>
            <span className="text-[10px] uppercase tracking-widest opacity-70 hidden sm:inline">{t('app.footer.aiEngine')}</span>
          </div>
          {configStatus && (
            <div className="flex items-center gap-2 group cursor-help relative">
              {configStatus.status === "Full" ? (
                <CheckCircle2 size={12} className="text-green-500" />
              ) : configStatus.status === "Standard" ? (
                <CheckCircle2 size={12} className="text-green-500" />
              ) : (
                <CheckCircle2 size={12} className="text-green-500" />
              )}
              <span className="text-[9px] uppercase tracking-tighter opacity-50 whitespace-nowrap">
                {t('app.footer.aiModeLabel', { status: configStatus.status })}
              </span>
              <div className="absolute bottom-full left-0 mb-2 invisible group-hover:visible glass-panel p-2 text-[10px] w-64 z-50 pointer-events-none">
                {configStatus.message}
              </div>
            </div>
          )}
        </div>
        
        <div className="text-center">
          <p className="text-3xl md:text-5xl font-normal tracking-tighter text-brand-accent uppercase opacity-90 font-display whitespace-nowrap">
            {t('app.footer.tagline')}
          </p>
        </div>
        
        <div className="text-[10px] opacity-40 uppercase tracking-widest text-right">
          {t('app.footer.copyright')}
        </div>
      </footer>

      <AuthModal open={authModalOpen} onClose={handleAuthClose} initialTab={authModalTab} />
    </div>
  );
}
