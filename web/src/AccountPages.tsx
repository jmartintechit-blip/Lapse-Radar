import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { api, errorMessage } from './api';
import { useAuth } from './auth';
import { useI18n } from './i18n';

// The one-time token comes in the URL fragment, which browsers never send to servers. It is read
// once and then removed from the address bar, so it does not stay in the history or a screenshot.
function useFragmentToken() {
  const [token] = useState(() => new URLSearchParams(window.location.hash.slice(1)).get('token'));
  useEffect(() => {
    if (window.location.hash) history.replaceState(null, '', window.location.pathname);
  }, []);
  return token;
}

// Runs an API call from a form and keeps the busy/error/done state the three pages share.
function useSubmit(run: (data: FormData) => Promise<void>) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    try {
      await run(data);
      setDone(true);
    } catch (err) {
      setError(errorMessage(err));
    }
    setBusy(false);
  };
  return { error, busy, done, onSubmit };
}

export function ForgotPassword() {
  const { t } = useI18n();
  const { error, busy, done, onSubmit } = useSubmit((data) =>
    api('POST', '/auth/forgot', { email: String(data.get('email')) }),
  );
  return (
    <main>
      <h1>{t.forgotTitle}</h1>
      {done ? (
        <p role="status">{t.forgotDone}</p>
      ) : (
        <form onSubmit={onSubmit}>
          <p>{t.forgotIntro}</p>
          <p>
            <label htmlFor="email">{t.email}</label>
            <br />
            <input id="email" name="email" type="email" autoComplete="email" required />
          </p>
          {error && <p role="alert">{error}</p>}
          <button type="submit" disabled={busy}>
            {t.sendLink}
          </button>
        </form>
      )}
      <p>
        <Link to="/login">{t.signIn}</Link>
      </p>
    </main>
  );
}

export function ResetPassword() {
  const { t } = useI18n();
  const token = useFragmentToken();
  const { error, busy, done, onSubmit } = useSubmit((data) =>
    api('POST', '/auth/reset', { token, password: String(data.get('password')) }),
  );
  if (!token)
    return (
      <main>
        <h1>{t.resetTitle}</h1>
        <p role="alert">{t.noToken}</p>
        <Link to="/forgot-password">{t.askNewLink}</Link>
      </main>
    );
  return (
    <main>
      <h1>{t.resetTitle}</h1>
      {done ? (
        <>
          <p role="status">{t.resetDone}</p>
          <Link to="/login">{t.signIn}</Link>
        </>
      ) : (
        <form onSubmit={onSubmit}>
          <p>
            <label htmlFor="password">{t.newPassword}</label>
            <br />
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={10}
              maxLength={128}
              aria-describedby="password-hint"
              required
            />
          </p>
          <p id="password-hint">{t.passwordHint}</p>
          {error && <p role="alert">{error}</p>}
          <button type="submit" disabled={busy}>
            {t.resetSubmit}
          </button>
        </form>
      )}
    </main>
  );
}

// A button instead of confirming on load: mail scanners that open links must not use them up.
export function ConfirmEmail() {
  const { t } = useI18n();
  const { refresh } = useAuth();
  const token = useFragmentToken();
  const { error, busy, done, onSubmit } = useSubmit(async () => {
    await api('POST', '/auth/confirm', { token });
    await refresh();
  });
  if (!token)
    return (
      <main>
        <h1>{t.confirmTitle}</h1>
        <p role="alert">{t.noToken}</p>
        <Link to="/dashboard">{t.dashboard}</Link>
      </main>
    );
  return (
    <main>
      <h1>{t.confirmTitle}</h1>
      {done ? (
        <>
          <p role="status">{t.confirmDone}</p>
          <Link to="/dashboard">{t.goDashboard}</Link>
        </>
      ) : (
        <form onSubmit={onSubmit}>
          <p>{t.confirmIntro}</p>
          {error && <p role="alert">{error}</p>}
          <button type="submit" disabled={busy}>
            {t.confirmSubmit}
          </button>
        </form>
      )}
    </main>
  );
}
