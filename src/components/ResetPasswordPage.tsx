import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { KeyRound, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import Field from "./Field";

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
    <div className="min-h-screen flex items-center justify-center p-6 bg-brand-violet">
      <div className="glass-panel w-full max-w-md p-8 space-y-6">
        <div className="text-center space-y-2">
          <h2 className="text-3xl font-display uppercase tracking-tight text-brand-peach leading-none">
            {t('auth.reset.title')}
          </h2>
          <p className="text-white/70 text-sm">{t('auth.reset.subtitle')}</p>
        </div>

        {success ? (
          <div className="space-y-4 text-center">
            <div className="mx-auto w-14 h-14 rounded-full bg-brand-peach/10 border border-brand-peach/30 flex items-center justify-center">
              <CheckCircle2 size={28} className="text-brand-peach" />
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
            <Field
              icon={<KeyRound size={14} />}
              label={t('auth.reset.newPassword')}
              placeholder=""
              value={newPassword}
              onChange={setNewPassword}
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
            />
            <Field
              icon={<KeyRound size={14} />}
              label={t('auth.reset.confirmPassword')}
              placeholder=""
              value={confirmPassword}
              onChange={setConfirmPassword}
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
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
