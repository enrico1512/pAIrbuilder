import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, CheckCircle2, AlertCircle } from "lucide-react";

/**
 * Pagina mostrata su `/verify-email?token=...`. Al mount chiama POST
 * /api/auth/verify-email che marca users.email_verified_at = now() se
 * il token e' valido. Mostra success o failure.
 */
export default function VerifyEmailPage() {
  const { t } = useTranslation();
  const [state, setState] = useState<'loading' | 'success' | 'error'>('loading');
  const [errorMsg, setErrorMsg] = useState<string>('');

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get('token') || '';
    if (!token) {
      setState('error');
      setErrorMsg(t('auth.verify.errorBody'));
      return;
    }
    (async () => {
      try {
        const r = await fetch('/api/auth/verify-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        });
        if (!r.ok) {
          const data = await r.json().catch(() => ({}));
          setErrorMsg(data?.error || t('auth.verify.errorBody'));
          setState('error');
          return;
        }
        setState('success');
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : t('auth.errors.generic'));
        setState('error');
      }
    })();
  }, [t]);

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-brand-violet">
      <div className="glass-panel w-full max-w-md p-8 space-y-6 text-center">
        {state === 'loading' && (
          <>
            <Loader2 className="animate-spin text-brand-peach mx-auto" size={48} />
            <p className="text-white/70">…</p>
          </>
        )}
        {state === 'success' && (
          <>
            <div className="mx-auto w-16 h-16 rounded-full bg-brand-peach/10 border border-brand-peach/30 flex items-center justify-center">
              <CheckCircle2 size={32} className="text-brand-peach" />
            </div>
            <h2 className="text-3xl font-display uppercase tracking-tight text-brand-peach leading-none">
              {t('auth.verify.successTitle')}
            </h2>
            <p className="text-white/70 text-sm">{t('auth.verify.successBody')}</p>
            <a href="/" className="btn-primary inline-flex items-center justify-center gap-2 px-8">
              {t('auth.verify.goHome')}
            </a>
          </>
        )}
        {state === 'error' && (
          <>
            <div className="mx-auto w-16 h-16 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center">
              <AlertCircle size={32} className="text-red-300" />
            </div>
            <h2 className="text-3xl font-display uppercase tracking-tight text-red-300 leading-none">
              {t('auth.verify.errorTitle')}
            </h2>
            <p className="text-white/70 text-sm">{errorMsg || t('auth.verify.errorBody')}</p>
            <a href="/" className="btn-primary inline-flex items-center justify-center gap-2 px-8">
              {t('auth.verify.goHome')}
            </a>
          </>
        )}
      </div>
    </div>
  );
}
