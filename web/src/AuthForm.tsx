import { useState, type FormEvent } from 'react';
import { Link, Navigate } from 'react-router';
import { useAuth } from './auth';

export function AuthForm({ mode }: { mode: 'login' | 'signup' }) {
  const { user, authenticate } = useAuth();
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
      <h1>{signup ? 'Create account' : 'Sign in'}</h1>
      <form onSubmit={onSubmit}>
        <p>
          <label htmlFor="email">Email</label>
          <br />
          <input id="email" name="email" type="email" autoComplete="email" required />
        </p>
        <p>
          <label htmlFor="password">Password</label>
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
        {signup && <p id="password-hint">10 to 128 characters.</p>}
        {error && <p role="alert">{error}</p>}
        <button type="submit" disabled={busy}>
          {signup ? 'Create account' : 'Sign in'}
        </button>
      </form>
      <p>
        {signup ? (
          <>
            Already registered? <Link to="/login">Sign in</Link>
          </>
        ) : (
          <>
            New here? <Link to="/signup">Create an account</Link>
          </>
        )}
      </p>
    </main>
  );
}
