import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { motion, AnimatePresence } from "motion/react";
import { X, Loader2, Mail, KeyRound, Store, User } from "lucide-react";
import { useAuth, slugify } from "../lib/auth";

type Tab = 'login' | 'register';

interface AuthModalProps {
  open: boolean;
  onClose: () => void;
  initialTab?: Tab;
}

export default function AuthModal({ open, onClose, initialTab = 'login' }: AuthModalProps) {
  const { t } = useTranslation();
  const { login, register } = useAuth();

  const [tab, setTab] = useState<Tab>(initialTab);
  // Resync the tab with the caller's initialTab every time the modal opens —
  // useState only takes the initial value on first mount, so without this the
  // tab would be sticky across "open with login" → close → "open with register".
  useEffect(() => {
    if (open) setTab(initialTab);
  }, [open, initialTab]);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [restaurantName, setRestaurantName] = useState("");
  const [fullName, setFullName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setEmail("");
    setPassword("");
    setRestaurantName("");
    setFullName("");
    setError(null);
    setSubmitting(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      if (tab === 'login') {
        await login(email.trim(), password);
      } else {
        const slug = slugify(restaurantName);
        await register({
          restaurantName: restaurantName.trim(),
          slug,
          email: email.trim(),
          password,
          fullName: fullName.trim() || undefined,
        });
      }
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('auth.errors.generic'));
      setSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="auth-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-md flex items-center justify-center p-4"
          onClick={handleClose}
        >
          <motion.div
            key="auth-modal"
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ duration: 0.2 }}
            onClick={(e) => e.stopPropagation()}
            className="glass-panel w-full max-w-md p-8 relative space-y-6"
          >
            <button
              onClick={handleClose}
              aria-label="close"
              className="absolute top-4 right-4 text-white/40 hover:text-white transition-colors p-1"
            >
              <X size={18} />
            </button>

            <div className="text-center space-y-2 pt-2">
              <h2 className="text-3xl font-display uppercase tracking-tight text-brand-accent leading-none">
                {t('auth.popup.title')}
              </h2>
              <p className="text-white/70 text-sm leading-relaxed max-w-sm mx-auto">
                {t('auth.popup.tagline')}
              </p>
            </div>

            <div className="flex bg-white/5 rounded-full p-1 border border-white/10">
              {(['login', 'register'] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => { setTab(k); setError(null); }}
                  className={`flex-1 text-[11px] uppercase font-bold tracking-widest py-2 rounded-full transition-all ${
                    tab === k
                      ? 'bg-brand-accent text-brand-bg shadow'
                      : 'text-white/60 hover:text-white'
                  }`}
                >
                  {t(`auth.tabs.${k}`)}
                </button>
              ))}
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {tab === 'register' && (
                <Field
                  icon={<Store size={14} />}
                  label={t('auth.fields.restaurantName')}
                  placeholder={t('auth.fields.restaurantPlaceholder')}
                  value={restaurantName}
                  onChange={setRestaurantName}
                  autoComplete="organization"
                  required
                />
              )}
              {tab === 'register' && (
                <Field
                  icon={<User size={14} />}
                  label={t('auth.fields.fullName')}
                  placeholder={t('auth.fields.fullNamePlaceholder')}
                  value={fullName}
                  onChange={setFullName}
                  autoComplete="name"
                />
              )}
              <Field
                icon={<Mail size={14} />}
                type="email"
                label={t('auth.fields.email')}
                placeholder={t('auth.fields.emailPlaceholder')}
                value={email}
                onChange={setEmail}
                autoComplete="email"
                required
              />
              <Field
                icon={<KeyRound size={14} />}
                type="password"
                label={t('auth.fields.password')}
                placeholder={t('auth.fields.passwordPlaceholder')}
                value={password}
                onChange={setPassword}
                autoComplete={tab === 'login' ? 'current-password' : 'new-password'}
                minLength={tab === 'register' ? 8 : undefined}
                required
              />

              {error && (
                <div className="text-xs text-red-300 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting && <Loader2 size={16} className="animate-spin" />}
                {submitting
                  ? t(tab === 'login' ? 'auth.submit.loginLoading' : 'auth.submit.registerLoading')
                  : t(tab === 'login' ? 'auth.submit.login' : 'auth.submit.register')}
              </button>
            </form>

            <button
              type="button"
              onClick={handleClose}
              className="w-full text-[10px] uppercase tracking-widest text-white/40 hover:text-white transition-colors py-2"
            >
              {t('auth.popup.guestButton')}
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

interface FieldProps {
  icon: React.ReactNode;
  label: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  autoComplete?: string;
  required?: boolean;
  minLength?: number;
}

function Field({ icon, label, placeholder, value, onChange, type = 'text', autoComplete, required, minLength }: FieldProps) {
  return (
    <label className="block space-y-1">
      <span className="text-[10px] uppercase tracking-widest text-brand-accent font-bold flex items-center gap-2">
        {icon}
        {label}
      </span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        required={required}
        minLength={minLength}
        className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 outline-none focus:border-brand-accent transition-colors placeholder:opacity-30 text-sm"
      />
    </label>
  );
}
