import { Link, Route, Routes } from 'react-router';
import { AnnounceProvider } from './announce';
import { AuthForm } from './AuthForm';
import { AuthProvider, RequireUser } from './auth';
import { Dashboard } from './Dashboard';
import { ForgotPassword, ResetPassword, ConfirmEmail } from './AccountPages';
import { Home } from './Home';
import { I18nProvider, useI18n } from './i18n';
import { Privacy } from './Privacy';
import { RouteFocus } from './RouteFocus';
import { SiteHeader } from './SiteHeader';

function NotFound() {
  const { t } = useI18n();
  return (
    <main>
      <h1>{t.notFound}</h1>
      <p>
        <Link to="/">{t.backHome}</Link>
      </p>
    </main>
  );
}

export function App() {
  return (
    <I18nProvider>
      <AuthProvider>
        <AnnounceProvider>
          <RouteFocus />
          <SiteHeader />
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/privacy" element={<Privacy />} />
            <Route path="/login" element={<AuthForm mode="login" />} />
            <Route path="/signup" element={<AuthForm mode="signup" />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/confirm" element={<ConfirmEmail />} />
            <Route element={<RequireUser />}>
              <Route path="/dashboard" element={<Dashboard />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AnnounceProvider>
      </AuthProvider>
    </I18nProvider>
  );
}
