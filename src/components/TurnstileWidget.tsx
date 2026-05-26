import { useEffect, useRef, useState } from "react";

/**
 * Widget Cloudflare Turnstile. Si auto-carica lo script ufficiale di
 * Cloudflare la prima volta che il componente compare in DOM, poi usa
 * window.turnstile.render() per generare il box "Verifica che sei umano".
 *
 * Se `siteKey` e' null o vuoto (env TURNSTILE_SITE_KEY non settata sul
 * server), il widget non viene mostrato e onToken("") viene chiamato
 * immediatamente — cosi' il form puo' procedere in modalita' dev.
 */

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: HTMLElement,
        opts: {
          sitekey: string;
          callback?: (token: string) => void;
          'error-callback'?: () => void;
          'expired-callback'?: () => void;
          theme?: 'light' | 'dark' | 'auto';
          size?: 'normal' | 'compact' | 'flexible';
        }
      ) => string;
      reset: (widgetId?: string) => void;
      remove: (widgetId?: string) => void;
    };
    __turnstileScriptLoading?: boolean;
  }
}

const SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

interface TurnstileWidgetProps {
  siteKey: string | null | undefined;
  onToken: (token: string) => void;
  theme?: 'light' | 'dark';
}

function ensureScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  if (window.__turnstileScriptLoading) {
    return new Promise<void>((resolve) => {
      const tick = () => {
        if (window.turnstile) resolve();
        else setTimeout(tick, 50);
      };
      tick();
    });
  }
  window.__turnstileScriptLoading = true;
  return new Promise<void>((resolve, reject) => {
    const s = document.createElement('script');
    s.src = SCRIPT_URL;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Failed to load Turnstile script'));
    document.head.appendChild(s);
  });
}

export default function TurnstileWidget({ siteKey, onToken, theme = 'dark' }: TurnstileWidgetProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Dev mode: niente site key → simuliamo immediato "ok" col token vuoto.
    // Il backend, vedendo niente TURNSTILE_SECRET_KEY, lascia passare.
    if (!siteKey) {
      onToken('');
      return;
    }

    let cancelled = false;
    ensureScript()
      .then(() => {
        if (cancelled || !ref.current || !window.turnstile) return;
        widgetIdRef.current = window.turnstile.render(ref.current, {
          sitekey: siteKey,
          theme,
          callback: (token) => onToken(token),
          'error-callback': () => setError('Captcha error'),
          'expired-callback': () => onToken(''),
        });
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || 'Script load failed');
      });

    return () => {
      cancelled = true;
      try {
        if (widgetIdRef.current && window.turnstile) {
          window.turnstile.remove(widgetIdRef.current);
        }
      } catch {
        /* noop */
      }
      widgetIdRef.current = null;
    };
  }, [siteKey, theme, onToken]);

  if (!siteKey) return null;
  return (
    <div className="my-2">
      <div ref={ref} />
      {error && <p className="text-xs text-red-300 mt-1">{error}</p>}
    </div>
  );
}
