import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { motion, AnimatePresence } from "motion/react";
import { X, Loader2, Mail, KeyRound, Store, User, ArrowLeft, CheckCircle2 } from "lucide-react";
import { useAuth } from "../lib/auth";
import TurnstileWidget from "./TurnstileWidget";

type Tab = 'login' | 'register' | 'forgot';

interface AuthModalProps {
  open: boolean;
  onClose: () => void;
  initialTab?: 'login' | 'register';
}

export default function AuthModal({ open, onClose, initialTab = 'login' }: AuthModalProps) {
  const { t } = useTranslation();
  const { login, register } = useAuth();

  const [tab, setTab] = useState<Tab>(initialTab);
  // Resync the tab with the caller's initialTab every time the modal opens.
  useEffect(() => {
    if (open) setTab(initialTab);
  }, [open, initialTab]);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [restaurantName, setRestaurantName] = useState("");
  const [fullName, setFullName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [forgotSent, setForgotSent] = useState(false);

  // Captcha: site key letta da /api/config-check. Se null/vuota, il widget
  // non si renderizza e il backend skippa la verifica (modalita' dev).
  const [turnstileSiteKey, setTurnstileSiteKey] = useState<string | null>(null);
  const [captchaToken, setCaptchaToken] = useState<string>("");

  // Verifica registrata: dopo register OK mostriamo banner "controlla email".
  const [checkInbox, setCheckInbox] = useState(false);

  useEffect(() => {
    if (!open) return;
    fetch('/api/config-check')
      .then((r) => r.json())
      .then((data) => setTurnstileSiteKey(data?.turnstileSiteKey || null))
      .catch(() => setTurnstileSiteKey(null));
  }, [open]);

  const reset = () => {
    setEmail("");
    setPassword("");
    setRestaurantName("");
    setFullName("");
    setError(null);
    setSubmitting(false);
    setCaptchaToken("");
    setForgotSent(false);
    setCheckInbox(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const onCaptchaToken = useCallback((token: string) => {
    setCaptchaToken(token);
  }, []);

  // Quando il captcha e' richiesto (siteKey presente) MA non ancora risolto,
  // disabilitiamo i bottoni submit per evitare invii senza token.
  const captchaRequired = !!turnstileSiteKey;
  const captchaReady = !captchaRequired || captchaToken.length > 0;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      if (tab === 'login') {
        await login(email.trim(), password);
        handleClose();
      } else if (tab === 'register') {
        await register({
          restaurantName: restaurantName.trim(),
          email: email.trim(),
          password,
          fullName: fullName.trim() || undefined,
          captchaToken,
        });
        // Mostriamo banner "controlla email" e poi chiudiamo dopo 4s,
        // così l'utente sa che deve aprire la mail. Il flow App.tsx
        // useEffect su auth.user gestisce il post-close (paywall →
        // restaurant skip).
        setCheckInbox(true);
        setSubmitting(false);
        setTimeout(() => handleClose(), 4000);
      } else if (tab === 'forgot') {
        const r = await fetch('/api/auth/forgot-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: email.trim(), captchaToken }),
        });
        if (!r.ok) {
          const data = await r.json().catch(() => ({}));
          throw new Error(data?.error || t('auth.errors.generic'));
        }
        setForgotSent(true);
        setSubmitting(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('auth.errors.generic'));
      setSubmitting(false);
    }
  };

  const switchToTab = (k: Tab) => {
    setTab(k);
    setError(null);
    setForgotSent(false);
    setCheckInbox(false);
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
                {tab === 'forgot' ? t('auth.forgot.title') : t('auth.popup.title')}
              </h2>
              <p className="text-white/70 text-sm leading-relaxed max-w-sm mx-auto">
                {tab === 'forgot' ? t('auth.forgot.subtitle') : t('auth.popup.tagline')}
              </p>
            </div>

            {tab !== 'forgot' && (
              <div className="flex bg-white/5 rounded-full p-1 border border-white/10">
                {(['login', 'register'] as const).map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => switchToTab(k)}
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
            )}

            {/* Banner success post-register */}
            {checkInbox && tab === 'register' && (
              <div className="text-xs bg-brand-accent/10 border border-brand-accent/30 text-brand-accent rounded-lg px-4 py-3 flex items-start gap-2">
                <CheckCircle2 size={16} className="shrink-0 mt-0.5" />
                <span>{t('auth.verify.checkInbox')}</span>
              </div>
            )}

            {/* Banner success post-forgot */}
            {forgotSent && tab === 'forgot' ? (
              <div className="space-y-4">
                <div className="text-xs bg-brand-accent/10 border border-brand-accent/30 text-brand-accent rounded-lg px-4 py-3 flex items-start gap-2">
                  <CheckCircle2 size={16} className="shrink-0 mt-0.5" />
                  <span>{t('auth.forgot.success')}</span>
                </div>
                <button
                  type="button"
                  onClick={() => switchToTab('login')}
                  className="w-full text-[10px] uppercase tracking-widest text-white/60 hover:text-white transition-colors py-2 flex items-center justify-center gap-1"
                >
                  <ArrowLeft size={12} />
                  {t('auth.forgot.back')}
                </button>
              </div>
            ) : (
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
                {tab !== 'forgot' && (
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
                )}

                {/* Link "Password dimenticata?" sotto i campi login */}
                {tab === 'login' && (
                  <div className="text-right">
                    <button
                      type="button"
                      onClick={() => switchToTab('forgot')}
                      className="text-[10px] uppercase tracking-widest text-brand-accent hover:underline"
                    >
                      {t('auth.forgot.link')}
                    </button>
                  </div>
                )}

                {/* Captcha Turnstile per register e forgot (non login). */}
                {(tab === 'register' || tab === 'forgot') && (
                  <TurnstileWidget siteKey={turnstileSiteKey} onToken={onCaptchaToken} />
                )}

                {error && (
                  <div className="text-xs text-red-300 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={submitting || !captchaReady}
                  className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {submitting && <Loader2 size={16} className="animate-spin" />}
                  {tab === 'forgot'
                    ? (submitting ? t('auth.forgot.submitting') : t('auth.forgot.submit'))
                    : (submitting
                        ? t(tab === 'login' ? 'auth.submit.loginLoading' : 'auth.submit.registerLoading')
                        : t(tab === 'login' ? 'auth.submit.login' : 'auth.submit.register'))}
                </button>

                {tab === 'forgot' && (
                  <button
                    type="button"
                    onClick={() => switchToTab('login')}
                    className="w-full text-[10px] uppercase tracking-widest text-white/60 hover:text-white transition-colors py-2 flex items-center justify-center gap-1"
                  >
                    <ArrowLeft size={12} />
                    {t('auth.forgot.back')}
                  </button>
                )}
              </form>
            )}

            {tab !== 'forgot' && (
              <button
                type="button"
                onClick={handleClose}
                className="btn-primary w-full flex items-center justify-center gap-2"
              >
                {t('auth.popup.guestButton')}
              </button>
            )}
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
