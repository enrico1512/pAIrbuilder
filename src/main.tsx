import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './i18n';
import App from './App.tsx';
import ResetPasswordPage from './components/ResetPasswordPage';
import VerifyEmailPage from './components/VerifyEmailPage';
import AboutPage from './components/AboutPage';
import type { InfoMode } from './components/AboutSection';
import { AuthProvider } from './lib/auth';
import './index.css';

/**
 * Routing minimale prima del mount.
 *
 * Pagine landing raggiungibili da link email (token-based):
 *   /reset-password?token=...
 *   /verify-email?token=...
 *
 * Pagine info pubbliche standalone (SEO-friendly, linkabili):
 *   IT  /come-funziona     EN  /how-it-works   → AboutPage mode="how-it-works"
 *   IT  /chi-siamo         EN  /about-us       → AboutPage mode="about-us"
 *   IT  /contatti          EN  /contact        → AboutPage mode="contact"
 *
 * Ogni route renderizza un componente dedicato invece dell'intera SPA.
 * Non serve react-router: il path determina il render alla mount.
 *
 * Auth/i18n provider restano comuni: le pagine standalone usano i18n
 * e (alcune) auth, il provider non costa nulla.
 */

// Map path → InfoMode. Coppie IT/EN per ogni mode.
const INFO_ROUTES: Record<string, InfoMode> = {
  // IT
  '/come-funziona': 'how-it-works',
  '/chi-siamo': 'about-us',
  '/contatti': 'contact',
  // EN
  '/how-it-works': 'how-it-works',
  '/about-us': 'about-us',
  '/contact': 'contact',
};

function normalizePath(path: string): string {
  // Rimuove trailing slash per match consistente.
  if (path.length > 1 && path.endsWith('/')) return path.slice(0, -1);
  return path;
}

function Root() {
  const path = normalizePath(window.location.pathname);

  if (path === '/reset-password') {
    return <ResetPasswordPage />;
  }
  if (path === '/verify-email') {
    return <VerifyEmailPage />;
  }

  const infoMode = INFO_ROUTES[path];
  if (infoMode) {
    return <AboutPage mode={infoMode} />;
  }

  return <App />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <Root />
    </AuthProvider>
  </StrictMode>,
);
