import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useAuth } from './auth';
import { useI18n } from './i18n';
import { Radar } from './Radar';

type ApiStatus = 'loading' | 'ok' | 'error';

export function Home() {
  const [status, setStatus] = useState<ApiStatus>('loading');
  const { user, authenticate } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();
  const [demoError, setDemoError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    fetch('/api/health')
      .then((res) => setStatus(res.ok ? 'ok' : 'error'))
      .catch(() => setStatus('error'));
  }, []);

  const startDemo = async () => {
    setStarting(true);
    setDemoError(null);
    const error = await authenticate('demo', '', '');
    if (error) {
      setDemoError(error);
      setStarting(false);
    } else navigate('/dashboard');
  };

  return (
    <main>
      <section className="hero" aria-labelledby="hero-title">
        <div>
          <h1 id="hero-title">
            {t.heroLine1} <br />
            {t.heroLine2}
          </h1>
          <p className="lead">{t.lead}</p>
          <nav aria-label={t.account} className="actions">
            {user ? (
              <Link to="/dashboard" className="cta">
                {t.goDashboard}
              </Link>
            ) : (
              <>
                <button
                  type="button"
                  className="cta"
                  disabled={starting}
                  onClick={() => void startDemo()}
                >
                  {t.tryDemo}
                </button>
                <Link to="/signup" className="cta ghost">
                  {t.createAccount}
                </Link>
                <Link to="/login" className="cta ghost">
                  {t.signIn}
                </Link>
              </>
            )}
          </nav>
          {demoError && <p role="alert">{demoError}</p>}
        </div>
        <Radar />
      </section>

      <section aria-labelledby="how-title">
        <h2 id="how-title">{t.howTitle}</h2>
        <ol className="steps">
          <li>
            <strong>{t.step1}</strong> {t.step1Text}
          </li>
          <li>
            <strong>{t.step2}</strong> {t.step2Text}
          </li>
          <li>
            <strong>{t.step3}</strong> {t.step3Text}
          </li>
        </ol>
      </section>

      <footer className="site-footer">
        <Link to="/privacy">{t.privacy}</Link>
        <span>{t.apiStatus(status)}</span>
      </footer>
    </main>
  );
}
