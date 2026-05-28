import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { UtensilsCrossed, Loader2, Info, AlertCircle, Zap, BrainCircuit } from "lucide-react";
import { Trans, useTranslation } from "react-i18next";
import RestaurantOnboarding from "./components/RestaurantOnboarding";
import MenuUpload from "./components/MenuUpload";
import MenuReview from "./components/MenuReview";
import PairingResults from "./components/PairingResults";
import AboutSection, { type InfoMode } from "./components/AboutSection";
import { FlashIcon } from "./components/FlashIcon";
import Header from "./components/Header";
import Footer from "./components/Footer";
import AuthModal from "./components/AuthModal";
import Paywall from "./components/Paywall";
import { useAuth } from "./lib/auth";
import { toBcp47, currencyFor } from "./i18n/languageMap";

const AUTH_DISMISS_KEY = "pairbuilder.authDismissed";
import { generatePairings, extractMenuData, listItemNames, isWineCategory, isPizzaCategory, type Pairing, type Dish, type Drink } from "./lib/gemini";
import { parseExcel, parseWord, parsePDFDetailed, parsePPTX } from "./lib/fileParser";
import { learningService } from "./lib/learningService";
import { sha256File, lookupCache, saveCache } from "./lib/aiCache";

export type Step = "welcome" | "paywall" | "restaurant" | "upload" | "extracting" | "review" | "loading" | "results" | "about" | "add-drinks";

export type RestaurantData = {
  name: string;
  type: string;
  email: string;
  phone: string;
  logo: string | null;
} | null;

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

  // Helper: popola restaurantData dai dati salvati nel profilo loggato,
  // così l'utente non deve ricompilare il form "Il tuo locale" ogni volta
  // (i dati ci sono già nel DB, sia per registrazione fresh che per
  // adozione guest dopo paywall).
  const restaurantDataFromAuth = () => ({
    name: auth.restaurant?.name || '',
    type: auth.restaurant?.cuisineType || '',
    email: auth.restaurant?.email || '',
    phone: auth.restaurant?.phone || '',
    logo: auth.restaurant?.logoUrl || null,
  });

  // Routing post-auth:
  //  - da "paywall" → "upload" (l'onboarding ristorante era gia' stato fatto
  //    come guest e adottato dal register; oppure login profilo esistente).
  //  - da "welcome" → "restaurant" (post register/login: il nome ristorante
  //    c'e' gia' ma mancano tipo cucina/telefono/logo, da raccogliere qui).
  useEffect(() => {
    if (!auth.user) return;
    if (step === "paywall") {
      setRestaurantData(restaurantDataFromAuth());
      setStep("upload");
    } else if (step === "welcome") {
      setRestaurantData(restaurantDataFromAuth());
      setStep("restaurant");
    }
  }, [auth.user, auth.restaurant, step]);

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

  const handleStart = async () => {
    // Reset memory when starting fresh
    setExtractedDishesMemory([]);
    setExtractedDrinksMemory([]);
    setPendingDrinkFiles([]);
    setProcessedDrinkFileCount(0);
    setHasPartialResults(false);

    // Paywall check pay-per-use: la 1ª sessione e' gratis per ogni
    // restaurant_id (guest o loggato), dalla 2ª in poi serve pagare 10€.
    // - nessuna sessione attiva (visitatore nuovo) → can_start_free: true
    // - restaurant in sessione con 0 upload completati → can_start_free: true
    // - restaurant in sessione con ≥1 upload completato → can_start_free: false
    try {
      const res = await fetch("/api/uploads/quota");
      if (res.ok) {
        const data = await res.json();
        if (data?.can_start_free === false) {
          setStep("paywall");
          return;
        }
      }
    } catch (err) {
      console.warn("[uploads/quota] check failed, proceeding without paywall:", err);
    }
    // Utente gia' loggato: i dati del ristorante sono nel DB, salta lo
    // step "restaurant" e va diretto a "upload" (popolando restaurantData
    // dal profilo). Gli ospiti, invece, vanno su "restaurant" per
    // compilare il form di onboarding la prima volta.
    if (auth.user && auth.restaurant) {
      setRestaurantData(restaurantDataFromAuth());
      setStep("upload");
    } else {
      setStep("restaurant");
    }
  };

  const handleRestaurantSubmit = (data: { name: string; type: string; email: string; phone: string; logo: string | null }) => {
    setRestaurantData(data);
    setStep("upload");
    // Per sessioni ospite (non loggate), creiamo un guest restaurant sul
    // server cosi' le chiamate /api/dishes|drinks|pairings/bulk successive
    // hanno un restaurant_id a cui attaccarsi. Fire-and-forget — se fallisce
    // l'UX continua normalmente (perdiamo solo l'analytics lato server).
    // Gli utenti loggati saltano: il loro restaurant_id e' gia' in sessione.
    if (!auth.user) {
      const lang = (i18n.resolvedLanguage || i18n.language || 'it').split('-')[0];
      void fetch('/api/guest/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: data.name,
          type: data.type,
          email: data.email,
          phone: data.phone,
          preferredLanguage: lang,
        }),
      }).catch(err => console.warn('[guest onboarding] save failed (non-blocking):', err));
    }
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

          // Cache check: stesso file binario gia' estratto in precedenza?
          // Se hit, skippiamo parsing + listItemNames + extractMenuData.
          const fileHashMenu = await sha256File(f);
          const cachedMenu = await lookupCache(fileHashMenu, 'menu');
          if (cachedMenu.hit && cachedMenu.result) {
            console.log(`[cache HIT] menu "${f.name}" (${fileHashMenu.slice(0, 12)}...)`);
            setFoodResults(prev => [...prev, cachedMenu.result as any]);
            allExtractedDishes.push(...(cachedMenu.result.dishes || []));
            setCurrentScanningCounts({ dishes: 0, drinks: 0 });
            setCurrentExtractionItem(null);
            continue;
          }

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
          } else if (f.name.toLowerCase().endsWith(".pptx") || f.name.toLowerCase().endsWith(".ppt")) {
            // PowerPoint: solo .pptx parsabile (ZIP + XML); .ppt legacy fallisce
            // con messaggio chiaro. Aggiunto 28 mag 2026 su richiesta Enrico.
            textContent = await parsePPTX(f);
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

          // Cache save fire-and-forget: prossimo upload dello stesso file
          // sara' istantaneo (no AI).
          saveCache(fileHashMenu, 'menu', result as any);
        }
      }

      // Process Drink Lists Page by Page
      for (const [idx, f] of drinks.entries()) {
        if (controller.signal.aborted) throw new Error("TIMEOUT");

        setProcessingIndex((isAddingDrinks ? 0 : menus.length) + idx + 1);
        setExtractionMode("counting");
        setCurrentScanningCounts({ dishes: 0, drinks: 0 });
        setCurrentExtractionItem(t('app.extracting.progress.drinkList'));

        // Cache check
        const fileHashDrinks = await sha256File(f);
        const cachedDrinks = await lookupCache(fileHashDrinks, 'drinks');
        if (cachedDrinks.hit && cachedDrinks.result) {
          console.log(`[cache HIT] drinks "${f.name}" (${fileHashDrinks.slice(0, 12)}...)`);
          setDrinkResults(prev => [...prev, cachedDrinks.result as any]);
          setExtractedDrinksMemory(prev => [...prev, ...(cachedDrinks.result.drinks || [])]);
          setProcessedDrinkFileCount(idx + 1);
          setCurrentScanningCounts({ dishes: 0, drinks: 0 });
          setCurrentExtractionItem(null);
          continue;
        }

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
        } else if (f.name.toLowerCase().endsWith(".pptx") || f.name.toLowerCase().endsWith(".ppt")) {
          // PowerPoint: solo .pptx parsabile (ZIP + XML); .ppt legacy fallisce
          // con messaggio chiaro. Aggiunto 28 mag 2026 su richiesta Enrico.
          textContent = await parsePPTX(f);
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

        // Cache save fire-and-forget
        saveCache(fileHashDrinks, 'drinks', result as any);
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
    allDishes.slice(0, 3).forEach(dish => {
      learningService.saveFeedback('dish', dish.name, dish);
    });
    allDrinks.slice(0, 3).forEach(drink => {
      learningService.saveFeedback('drink', drink.product, drink);
    });

    // Persist dishes + drinks server-side sotto lo scope corrente (utente
    // loggato OPPURE guest restaurant creato al onboarding). L'endpoint
    // pairings deve trovare queste righe nel DB per risolvere i nomi → id,
    // quindi attendiamo entrambi i POST PRIMA di generare i pairings, ma
    // non blocchiamo l'UI in caso di errore.
    const persistMenuPromise = (async () => {
      try {
        await Promise.all([
          fetch('/api/dishes/bulk', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ dishes: allDishes }),
          }),
          fetch('/api/drinks/bulk', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ drinks: allDrinks }),
          }),
        ]);
      } catch (err) {
        console.warn('[bulk save] menu/drinks save failed (non-blocking):', err);
      }
    })();

    setStep("loading");
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 300000); // 300 seconds timeout

    (async () => {
      try {
        const restaurantContext = `Ristorante: ${restaurantData?.name}. Cucina: ${restaurantData?.type}.`;
        const context = getUserContext();
        
        const rawDishes = extractedDishesMemory.length > 0 ? extractedDishesMemory : allDishes;
        // L'AI di pairing salta le pizze: l'abbinamento pizza+vino non e' un
        // deliverable di prodotto. Le pizze restano in allDishes (salvate in
        // /api/dishes/bulk per la strategia dati BIBI) ma non vanno
        // all'AI di pairing — coerente col filtro UI di MenuReview che le
        // nasconde, e con la simmetria isPizzaCategory <-> isWineCategory.
        const finalDishes = rawDishes.filter(d => !isPizzaCategory(d.category));

        // Deduplicate drinks
        const drinkMap = new Map();
        [...extractedDrinksMemory, ...allDrinks].forEach(d => {
          if (d.product) drinkMap.set(d.product.toLowerCase().trim(), d);
        });
        const allUniqueDrinks = Array.from(drinkMap.values()) as Drink[];
        // L'AI di pairing usa SOLO vini. Birre/cocktail/spirits restano in
        // allUniqueDrinks (e nel /api/drinks/bulk salvataggio) per le analisi
        // cross-ristorante, ma non entrano negli abbinamenti — coerente col
        // filtro UI di MenuReview che mostra solo i vini.
        const finalDrinks = allUniqueDrinks.filter(d => isWineCategory(d.category));

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

        // Registra la sessione di upload come "completata" lato server.
        // Per chi e' arrivato fino qui senza paywall (= aveva can_start_free
        // true), il record creato sara' is_free=true, status='completed'.
        // Fire-and-forget: se fallisce ci limitiamo a un warning.
        void fetch('/api/uploads/start', { method: 'POST' }).catch((err) =>
          console.warn('[uploads/start] failed (non-blocking):', err)
        );

        // Dopo che dishes + drinks sono stati persistiti AND l'AI ha
        // ritornato i pairings, salviamo anche quelli. Il server risolve
        // i nomi → id usando le righe appena inserite, quindi MUST await il
        // persistMenuPromise prima. Non-blocking su errore.
        try {
          await persistMenuPromise;
          const pairingPayload = result.flatMap((p) =>
            (p.drinks || []).map((d) => ({
              dishName: p.dish,
              drinkName: d.name,
              matchType: d.matchType,
              description: d.description,
            }))
          );
          if (pairingPayload.length > 0) {
            void fetch('/api/pairings/bulk', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                pairings: pairingPayload,
                language: (i18n.resolvedLanguage || 'it').split('-')[0],
                model: 'mixed',
              }),
            }).catch((err) => console.warn('[bulk save] pairings save failed (non-blocking):', err));
          }
        } catch (err) {
          console.warn('[bulk save] pairings persist skipped:', err);
        }
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
    <div className="h-screen flex flex-col overflow-hidden selection:bg-brand-peach selection:text-brand-violet">
      <Header
        restaurantData={restaurantData}
        step={step}
        setStep={setStep}
        setInfoMode={setInfoMode}
        setPreviousStep={setPreviousStep}
        openAuthModal={openAuthModal}
        handleLogout={handleLogout}
      />

      {/* Main Content */}
      <main className="flex-1 flex flex-col relative overflow-hidden">
        <div ref={scrollContainerRef} className="flex-1 px-6 md:px-10 py-8 overflow-y-auto">
          <AnimatePresence mode="wait" initial={false}>
            {step === "welcome" && (
              <motion.section
                key="welcome"
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                /* min-h-full + justify-start su mobile: contenuto inizia dal top
                   (era 'h-full justify-center' → titolo+CTA spinti sopra il fold
                   perché contenuto totale > viewport mobile). lg+ torna centrato. */
                className="min-h-full flex flex-col items-center justify-start lg:justify-center text-center space-y-8 py-8 lg:py-12"
              >
                <div className="space-y-4 max-w-3xl">
                  <h2 className="text-5xl sm:text-6xl lg:text-9xl leading-[0.8] mb-4 uppercase font-display text-brand-peach font-normal tracking-tight">
                    p<span className="text-white">AI</span>rbuilder
                  </h2>
                  <p className="text-base sm:text-lg lg:text-xl text-white font-light max-w-xl mx-auto">
                    {t('app.welcome.tagline')}
                  </p>
                </div>
                <button onClick={handleStart} className="btn-primary text-lg sm:text-xl lg:text-2xl px-8 sm:px-12 py-3 sm:py-4 mt-6 lg:mt-8">
                  {t('app.welcome.cta')}
                </button>

                <div className="flex flex-col items-center">
                  <div className="max-w-4xl text-sm text-white/80 mt-10 leading-relaxed flex flex-col items-center gap-10">
                    {/* Sezione Perche' Funziona */}
                    <div className="w-full space-y-6">
                      <h3 className="text-3xl font-display text-brand-peach uppercase tracking-tight text-center font-normal">{t('app.welcome.whyHeading')}</h3>
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
                      <h3 className="text-3xl font-display text-brand-peach uppercase tracking-tight font-normal">{t('app.welcome.howHeading')}</h3>
                      <p className="text-white/80">{t('app.welcome.howDescription')}</p>
                      <button
                        onClick={() => { setInfoMode("how-it-works"); setStep("about"); }}
                        className="text-brand-peach hover:underline text-xs font-bold uppercase tracking-wider"
                      >
                        {t('app.welcome.discoverMore')}
                      </button>
                    </div>
                  </div>
                </div>
              </motion.section>
            )}

            {step === "paywall" && (
              <Paywall
                key="paywall"
                onRegister={() => {
                  // Apre AuthModal in modalità registrazione. Dopo aver creato
                  // il profilo, l'utente sarà autenticato e la prossima
                  // pressione di "Inizia" rifarà il quota check (con
                  // restaurant_id loggato e count=0 sul nuovo restaurant).
                  setAuthModalTab("register");
                  setAuthModalOpen(true);
                }}
                onLogin={() => {
                  setAuthModalTab("login");
                  setAuthModalOpen(true);
                }}
              />
            )}

            {step === "restaurant" && (
              <RestaurantOnboarding key="restaurant" onNext={handleRestaurantSubmit} initialData={restaurantData} />
            )}

            {step === "upload" && (
              <MenuUpload key="upload" onBack={() => setStep(auth.user ? "welcome" : "restaurant")} onNext={handleFilesSubmit} />
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
                  <Loader2 className="animate-spin text-brand-peach relative z-10" size={80} />
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
                      className="text-brand-peach font-medium"
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
                      <div className="text-3xl font-display text-brand-peach leading-none">
                        {foodResults.reduce((acc, p) => acc + p.dishes.length, 0) + currentScanningCounts.dishes}
                      </div>
                      <div className="text-[10px] uppercase tracking-[0.2em] opacity-40 mt-1">{t('app.extracting.counter.dishes')}</div>
                    </div>
                    <div className="text-center">
                      <div className="text-3xl font-display text-brand-peach leading-none">
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
                <Loader2 className="animate-spin text-brand-peach" size={64} />
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
                  <div className="mx-auto w-20 h-20 flex items-center justify-center text-brand-peach mb-6">
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
                      <p className="text-sm font-bold uppercase tracking-widest text-brand-peach">{t('app.addDrinks.remainingHeading', { count: pendingDrinkFiles.length })}</p>
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
                    <p className="text-xl font-display text-brand-peach">{extractedDishesMemory.length}</p>
                  </div>
                  <div className="glass-panel p-4 text-center">
                    <p className="text-[10px] uppercase opacity-40 mb-1">{t('app.addDrinks.stats.drinksExtracted')}</p>
                    <p className="text-xl font-display text-brand-peach">{extractedDrinksMemory.length}</p>
                  </div>
                  <div className="glass-panel p-4 text-center">
                    <p className="text-[10px] uppercase opacity-40 mb-1">{t('app.addDrinks.stats.filesRemaining')}</p>
                    <p className="text-xl font-display text-brand-peach">{pendingDrinkFiles.length}</p>
                  </div>
                </div>
              </motion.section>
            )}
          </AnimatePresence>

          {/* Footer scroll-end (decisione 28 mag 2026):
              spostato DENTRO al container scrollabile per essere visibile
              SOLO quando l'utente raggiunge il fondo del contenuto, invece
              di restare fisso sopra il viewport in ogni step (UX richiesta
              da Enrico).
              Bleed -mx-6 md:-mx-10 per spanning full-width oltre il padding
              orizzontale del wrapper. */}
          <div className="-mx-6 md:-mx-10 mt-12">
            <Footer configStatus={configStatus} />
          </div>
        </div>
      </main>

      <AuthModal open={authModalOpen} onClose={handleAuthClose} initialTab={authModalTab} />
    </div>
  );
}
