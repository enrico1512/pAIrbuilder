import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import './i18n';
import App from './App.tsx';
import ResetPasswordPage from './components/ResetPasswordPage';
import VerifyEmailPage from './components/VerifyEmailPage';
import { AuthProvider } from './lib/auth';
import './index.css';

/**
 * Routing minimale prima del mount: per le 2 pagine raggiunte da link
 * email (/reset-password?token=... e /verify-email?token=...) carichiamo
 * un component dedicato invece dell'intera SPA. Non serve react-router:
 * sono pagine landing → a-href verso "/" al termine del flow.
 *
 * Auth/i18n provider restano comuni: le pagine standalone usano i18n e
 * non auth, ma il provider non costa nulla.
 */
function Root() {
  const path = window.location.pathname;
  if (path === '/reset-password' || path === '/reset-password/') {
    return <ResetPasswordPage />;
  }
  if (path === '/verify-email' || path === '/verify-email/') {
    return <VerifyEmailPage />;
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
