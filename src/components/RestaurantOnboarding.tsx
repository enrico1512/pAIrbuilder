import { motion } from "motion/react";
import { Camera, Store } from "lucide-react";
import { useState } from "react";

interface OnboardingProps {
  onNext: (data: { name: string; type: string; email: string; phone: string; logo: string | null }) => void;
}

const STORAGE_KEY = "pairbuilder_restaurant";

export default function RestaurantOnboarding({ onNext }: OnboardingProps) {
  const saved = (() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"); } catch { return {}; }
  })();

  const [name, setName] = useState(saved.name || "");
  const [type, setType] = useState(saved.type || "");
  const [email, setEmail] = useState(saved.email || "");
  const [phone, setPhone] = useState(saved.phone || "");
  const [logo, setLogo] = useState<string | null>(saved.logo || null);

  // Track whether each field has been explicitly touched for autocomplete trigger
  const [nameFocused, setNameFocused] = useState(false);
  const savedName = saved.name || "";

  const handleNameFocus = () => {
    if (!nameFocused && name) {
      // Temporarily clear the field so Chrome shows its saved autocomplete suggestions
      setName("");
      setNameFocused(true);
    }
  };

  const handleNameBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    // If user left the field empty and there was a saved value, restore it
    if (!e.target.value && savedName) {
      setName(savedName);
    }
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      const reader = new FileReader();
      reader.onload = (ev) => setLogo(ev.target?.result as string);
      reader.readAsDataURL(e.target.files[0]);
    }
  };

  const handleSubmit = () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ name, type, email, phone, logo }));
    } catch { /* ignore */ }
    onNext({ name, type, email, phone, logo });
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="max-w-2xl mx-auto glass-panel p-8 lg:p-12 space-y-8"
    >
      <div className="text-center space-y-2">
        <h2 className="text-5xl">IL TUO LOCALE</h2>
        <p className="text-white/60">Inserisci i tuoi dati per ricevere il pairing via mail e usalo per migliorare il servizio in sala</p>
      </div>

      <div className="flex flex-col items-center gap-4">
        <div className="relative w-32 h-32 rounded-full bg-white/10 flex items-center justify-center overflow-hidden border-2 border-white/20 group cursor-pointer">
          {logo ? (
            <img src={logo} alt="Logo" className="w-full h-full object-cover" />
          ) : (
            <Camera className="text-white/20 group-hover:text-brand-accent transition-colors" size={40} />
          )}
          <input
            type="file"
            accept=".jpg,.jpeg,.png,.pdf,.svg"
            onChange={handleLogoUpload}
            className="absolute inset-0 opacity-0 cursor-pointer"
          />
        </div>
        <p className="text-xs uppercase tracking-widest text-white/40 text-center">Carica il Logo<br />(.jpg, .PDF, .svg, .JPEG)</p>
      </div>

      <form
        autoComplete="on"
        onSubmit={(e) => { e.preventDefault(); handleSubmit(); }}
        className="space-y-6"
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <label htmlFor="org-name" className="text-[10px] uppercase tracking-[0.2em] text-brand-accent font-bold ml-1">Nome Locale</label>
            <input
              id="org-name"
              type="text"
              name="organization"
              autoComplete="organization"
              value={name}
              onFocus={handleNameFocus}
              onBlur={handleNameBlur}
              onChange={(e) => setName(e.target.value)}
              placeholder={nameFocused && !name && savedName ? savedName : "es. L'OSTERIA MODERNA"}
              className="w-full bg-white/5 border border-white/10 rounded-sm px-6 py-4 outline-none focus:border-brand-accent transition-colors placeholder:opacity-20 uppercase font-display tracking-tight text-xl"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="cuisine-type" className="text-[10px] uppercase tracking-[0.2em] text-brand-accent font-bold ml-1">Tipo di Cucina</label>
            <input
              id="cuisine-type"
              type="text"
              name="cuisine-type"
              autoComplete="off"
              value={type}
              onChange={(e) => setType(e.target.value)}
              placeholder="es. TRADIZIONE ITALIANA"
              className="w-full bg-white/5 border border-white/10 rounded-sm px-6 py-4 outline-none focus:border-brand-accent transition-colors placeholder:opacity-20 uppercase font-display tracking-tight text-xl"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <label htmlFor="email" className="text-[10px] uppercase tracking-[0.2em] text-brand-accent font-bold ml-1">Email</label>
            <input
              id="email"
              type="email"
              name="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="info@ristorante.it"
              className="w-full bg-white/5 border border-white/10 rounded-sm px-6 py-4 outline-none focus:border-brand-accent transition-colors placeholder:opacity-20 font-sans tracking-tight text-sm"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="tel" className="text-[10px] uppercase tracking-[0.2em] text-brand-accent font-bold ml-1">Telefono</label>
            <input
              id="tel"
              type="tel"
              name="tel"
              autoComplete="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+39 012 345678"
              className="w-full bg-white/5 border border-white/10 rounded-sm px-6 py-4 outline-none focus:border-brand-accent transition-colors placeholder:opacity-20 font-sans tracking-tight text-sm"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={!name || !type}
          className="btn-primary w-full mt-4"
        >
          carica il tuo menu
        </button>
      </form>
    </motion.div>
  );
}
