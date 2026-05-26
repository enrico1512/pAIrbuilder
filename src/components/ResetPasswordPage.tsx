import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { KeyRound, Loader2, CheckCircle2, AlertCircle } from "lucide-react";

/**
 * Pagina mostrata su `/reset-password?token=...`. Form per impostare la
 * nuova password; submit chiama POST /api/auth/reset-password. Su successo
 * mostra un messaggio e un link per andare al login. Su errore (token non
 * valido / scaduto) mostra messaggio.
 */
export default function ResetPasswordPage() {
  const { t } = useTranslation();
  const token = new URLSearchParams(window.location.search).get('token') || '';
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (newPassword.length < 8) {
      setError(t('auth.reset.errorShort'));
      return;
    }
    if (newPassword !== confirmPassword) {
      setError(t('auth.reset.errorMismatch'));
      return;
    }
    if (!token) {
      setError(t('auth.reset.errorInvalidLink'));
      return;
    }

    setSubmitting(true);
    try {
      const r = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, newPassword }),
      });
      if (!r.ok) {
        const data = await r.json().catch(() => ({}));
        throw new Error(data?.error || t('auth.reset.errorInvalidLink'));
      }
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('auth.errors.generic'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-brand-bg">
      <div className="glass-panel w-full max-w-md p-8 space-y-6">
        <div className="text-center space-y-2">
          <h2 className="text-3xl font-display uppercase tracking-tight text-brand-accent leading-none">
            {t('auth.reset.title')}
          </h2>
          <p className="text-white/70 text-sm">{t('auth.reset.subtitle')}</p>
        </div>

        {success ? (
          <div className="space-y-4 text-center">
            <div className="mx-auto w-14 h-14 rounded-full bg-brand-accent/10 border border-brand-accent/30 flex items-center justify-center">
              <CheckCircle2 size={28} className="text-brand-accent" />
            </div>
            <h3 className="text-xl font-display uppercase tracking-tight text-white">
              {t('auth.reset.successTitle')}
            </h3>
            <p className="text-sm text-white/70">{t('auth.reset.successBody')}</p>
            <a href="/" className="btn-primary inline-flex items-center justify-center gap-2 px-8">
              {t('auth.reset.goLogin')}
            </a>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <PwdField
              label={t('auth.reset.newPassword')}
              value={newPassword}
              onChange={setNewPassword}
              autoComplete="new-password"
            />
            <PwdField
              label={t('auth.reset.confirmPassword')}
              value={confirmPassword}
              onChange={setConfirmPassword}
              autoComplete="new-password"
            />

            {error && (
              <div className="text-xs text-red-300 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2 flex items-start gap-2">
                <AlertCircle size={14} className="shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting && <Loader2 size={16} className="animate-spin" />}
              {submitting ? t('auth.reset.submitting') : t('auth.reset.submit')}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

function PwdField({
  label,
  value,
  onChange,
  autoComplete,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete?: string;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-[10px] uppercase tracking-widest text-brand-accent font-bold flex items-center gap-2">
        <KeyRound size={14} />
        {label}
      </span>
      <input
        type="password"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        required
        minLength={8}
        className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 outline-none focus:border-brand-accent transition-colors text-sm"
      />
    </label>
  );
}
