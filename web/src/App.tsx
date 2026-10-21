import { useEffect, useState } from 'react';
import { Link, Route, Routes } from 'react-router';
import { AuthForm } from './AuthForm';
import { AuthProvider, RequireUser, useAuth } from './auth';
import { Dashboard } from './Dashboard';

type ApiStatus = 'loading' | 'ok' | 'error';

function Home() {
  const [status, setStatus] = useState<ApiStatus>('loading');
  const { user } = useAuth();

  useEffect(() => {
    fetch('/api/health')
      .then((res) => setStatus(res.ok ? 'ok' : 'error'))
      .catch(() => setStatus('error'));
  }, []);

  return (
    <main>
      <h1>Lapse Radar</h1>
      <p>Know what expires before it breaks.</p>
      <p role="status">API status: {status}</p>
      <nav aria-label="Account">
        {user ? (
          <Link to="/dashboard">Go to dashboard</Link>
        ) : (
          <>
            <Link to="/login">Sign in</Link> · <Link to="/signup">Create account</Link>
          </>
        )}
      </nav>
    </main>
  );
}

function NotFound() {
  return (
    <main>
      <h1>Page not found</h1>
    </main>
  );
}

export function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<AuthForm mode="login" />} />
        <Route path="/signup" element={<AuthForm mode="signup" />} />
        <Route element={<RequireUser />}>
          <Route path="/dashboard" element={<Dashboard />} />
        </Route>
        <Route path="*" element={<NotFound />} />
      </Routes>
    </AuthProvider>
  );
}
