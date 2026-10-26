import { useState, type FormEvent } from 'react';
import { Link, Navigate } from 'react-router';
import { useAuth } from './auth';
import { useI18n } from './i18n';

export function AuthForm({ mode }: { mode: 'login' | 'signup' }) {
  const { user, authenticate } = useAuth();
  const { t } = useI18n();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const signup = mode === 'signup';

  if (user) return <Navigate to="/dashboard" replace />;

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    setBusy(true);
    setError(await authenticate(mode, String(data.get('email')), String(data.get('password'))));
    setBusy(false);
  };

  return (
    <main>
      <h1>{signup ? t.createAccount : t.signIn}</h1>
      <form onSubmit={onSubmit}>
        <p>
          <label htmlFor="email">{t.email}</label>
          <br />
          <input id="email" name="email" type="email" autoComplete="email" required />
        </p>
        <p>
          <label htmlFor="password">{t.password}</label>
          <br />
          <input
            id="password"
            name="password"
            type="password"
            autoComplete={signup ? 'new-password' : 'current-password'}
            minLength={signup ? 10 : undefined}
            maxLength={128}
            aria-describedby={signup ? 'password-hint' : undefined}
            required
          />
        </p>
        {signup && <p id="password-hint">{t.passwordHint}</p>}
        {error && <p role="alert">{error}</p>}
        <button type="submit" disabled={busy}>
          {signup ? t.createAccount : t.signIn}
        </button>
      </form>
      <p>
        {signup ? (
          <>
            {t.haveAccount} <Link to="/login">{t.signIn}</Link>
          </>
        ) : (
          <>
            {t.newHere} <Link to="/signup">{t.createAccount}</Link>
          </>
        )}
      </p>
      {!signup && (
        <p>
          <Link to="/forgot-password">{t.forgotLink}</Link>
        </p>
      )}
    </main>
  );
}
