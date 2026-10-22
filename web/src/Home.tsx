import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useAuth } from './auth';
import { Radar } from './Radar';

type ApiStatus = 'loading' | 'ok' | 'error';

export function Home() {
  const [status, setStatus] = useState<ApiStatus>('loading');
  const { user, authenticate } = useAuth();
  const navigate = useNavigate();
  const [demoError, setDemoError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/health')
      .then((res) => setStatus(res.ok ? 'ok' : 'error'))
      .catch(() => setStatus('error'));
  }, []);

  const startDemo = async () => {
    const error = await authenticate('demo', '', '');
    if (error) setDemoError(error);
    else navigate('/dashboard');
  };

  return (
    <main>
      <section className="hero" aria-labelledby="hero-title">
        <div>
          <h1 id="hero-title">
            Know what expires <br />
            before it breaks.
          </h1>
          <p className="lead">
            One panel for TLS certificates, domains and tokens. Days left at a glance, automatic
            checks, and one alert per threshold, never a flood.
          </p>
          <nav aria-label="Account" className="actions">
            {user ? (
              <Link to="/dashboard" className="cta">
                Go to dashboard
              </Link>
            ) : (
              <>
                <button type="button" className="cta" onClick={() => void startDemo()}>
                  Try the read-only demo
                </button>
                <Link to="/signup" className="cta ghost">
                  Create account
                </Link>
                <Link to="/login" className="cta ghost">
                  Sign in
                </Link>
              </>
            )}
          </nav>
          {demoError && <p role="alert">{demoError}</p>}
        </div>
        <Radar />
      </section>

      <section aria-labelledby="how-title">
        <h2 id="how-title">How it works</h2>
        <ol className="steps">
          <li>
            <strong>Add what can lapse.</strong> A host for its TLS certificate, a domain, or any
            token or licence with a date.
          </li>
          <li>
            <strong>Checks run for you.</strong> Certificates and registered domains are checked
            automatically; you can also check on demand.
          </li>
          <li>
            <strong>Get told once.</strong> An alert at 30, 14, 7 and 1 days and at expiry, in the
            app and by email, without repeats.
          </li>
        </ol>
      </section>

      <footer className="site-footer">
        <Link to="/privacy">Privacy</Link>
        <span role="status">API status: {status}</span>
      </footer>
    </main>
  );
}
