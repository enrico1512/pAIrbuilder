import { useState, type ReactNode } from "react";
import { Eye, EyeOff } from "lucide-react";

/**
 * Field — input glass-style condiviso del design system pAIrbuilder.
 *
 * Pattern visivo: micro-label uppercase (text-brand-peach) + input glass
 * (bg-white/5 + border white/10 + rounded-lg).
 *
 * Promosso da componente locale in AuthModal.tsx (sessione 2026-05-27).
 * Da migrare progressivamente in RestaurantOnboarding, ResetPasswordPage,
 * VerifyEmailPage che oggi reimplementano lo stile a mano.
 *
 * Per type='password' include toggle "mostra/nascondi" (icona occhio):
 * cliccando l'icona si cambia type='text' senza modificare il prop,
 * così il browser autocomplete continua a trattarlo come password.
 *
 * Riferimento: AMBROSIA-DESIGN-SYSTEM-v1.md sez. 6.4 (Form input).
 */
export interface FieldProps {
  icon: ReactNode;
  label: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  autoComplete?: string;
  required?: boolean;
  minLength?: number;
}

export default function Field({
  icon,
  label,
  placeholder,
  value,
  onChange,
  type = "text",
  autoComplete,
  required,
  minLength,
}: FieldProps) {
  const [showPassword, setShowPassword] = useState(false);
  const isPassword = type === "password";
  const effectiveType = isPassword && showPassword ? "text" : type;

  return (
    <label className="block space-y-1">
      <span className="text-[10px] uppercase tracking-widest text-brand-peach font-bold flex items-center gap-2">
        {icon}
        {label}
      </span>
      <div className="relative">
        <input
          type={effectiveType}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          required={required}
          minLength={minLength}
          className={`w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 outline-none focus:border-brand-peach transition-colors placeholder:opacity-30 text-sm ${
            isPassword ? "pr-11" : ""
          }`}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setShowPassword((s) => !s)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white transition-colors"
            aria-label={showPassword ? "Nascondi password" : "Mostra password"}
            tabIndex={-1}
          >
            {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        )}
      </div>
    </label>
  );
}
