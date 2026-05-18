import { motion } from "motion/react";
import { Camera, Store } from "lucide-react";
import { useState } from "react";

interface OnboardingProps {
  onNext: (data: { name: string; type: string; email: string; phone: string; logo: string | null }) => void;
}

export default function RestaurantOnboarding({ onNext }: OnboardingProps) {
  const [name, setName] = useState("");
  const [type, setType] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [logo, setLogo] = useState<string | null>(null);

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      const reader = new FileReader();
      reader.onload = (ev) => setLogo(ev.target?.result as string);
      reader.readAsDataURL(e.target.files[0]);
    }
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
            <Camera className="text-white/20 group-hover:text-orange-500 transition-colors" size={40} />
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

      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <label className="text-[10px] uppercase tracking-[0.2em] text-brand-accent font-bold ml-1">Nome Locale</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="es. L'OSTERIA MODERNA"
              className="w-full bg-white/5 border border-white/10 rounded-sm px-6 py-4 outline-none focus:border-brand-accent transition-colors placeholder:opacity-20 uppercase font-display tracking-tight text-xl"
            />
          </div>

          <div className="space-y-2">
            <label className="text-[10px] uppercase tracking-[0.2em] text-brand-accent font-bold ml-1">Tipo di Cucina</label>
            <input
              type="text"
              value={type}
              onChange={(e) => setType(e.target.value)}
              placeholder="es. TRADIZIONE ITALIANA"
              className="w-full bg-white/5 border border-white/10 rounded-sm px-6 py-4 outline-none focus:border-brand-accent transition-colors placeholder:opacity-20 uppercase font-display tracking-tight text-xl"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <label className="text-[10px] uppercase tracking-[0.2em] text-brand-accent font-bold ml-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="info@ristorante.it"
              className="w-full bg-white/5 border border-white/10 rounded-sm px-6 py-4 outline-none focus:border-brand-accent transition-colors placeholder:opacity-20 font-sans tracking-tight text-sm"
            />
          </div>

          <div className="space-y-2">
            <label className="text-[10px] uppercase tracking-[0.2em] text-brand-accent font-bold ml-1">Telefono</label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+39 012 345678"
              className="w-full bg-white/5 border border-white/10 rounded-sm px-6 py-4 outline-none focus:border-brand-accent transition-colors placeholder:opacity-20 font-sans tracking-tight text-sm"
            />
          </div>
        </div>

        <button
          onClick={() => onNext({ name, type, email, phone, logo })}
          disabled={!name || !type}
          className="btn-primary w-full mt-4"
        >
          carica il tuo menu
        </button>
      </div>
    </motion.div>
  );
}
