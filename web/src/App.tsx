import { Link, Route, Routes } from 'react-router';
import { AnnounceProvider } from './announce';
import { AuthForm } from './AuthForm';
import { AuthProvider, RequireUser } from './auth';
import { Dashboard } from './Dashboard';
import { Home } from './Home';
import { Privacy } from './Privacy';
import { RouteFocus } from './RouteFocus';
import { SiteHeader } from './SiteHeader';

function NotFound() {
  return (
    <main>
      <h1>Page not found</h1>
      <p>
        <Link to="/">Back to home</Link>
      </p>
    </main>
  );
}

export function App() {
  return (
    <AuthProvider>
      <AnnounceProvider>
        <RouteFocus />
        <SiteHeader />
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/login" element={<AuthForm mode="login" />} />
          <Route path="/signup" element={<AuthForm mode="signup" />} />
          <Route element={<RequireUser />}>
            <Route path="/dashboard" element={<Dashboard />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </AnnounceProvider>
    </AuthProvider>
  );
}
