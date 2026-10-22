import { useRef, useState, type FormEvent } from 'react';
import { api, errorMessage } from './api';
import { useAuth } from './auth';

export function DeleteAccount() {
  const { logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const password = String(new FormData(e.currentTarget).get('password') ?? '');
    setBusy(true);
    setError(null);
    try {
      await api('DELETE', '/me', { password });
      await logout(); // the session is gone already; this clears the signed-in state
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <section aria-labelledby="delete-heading">
      <h2 id="delete-heading">Delete account</h2>
      {!open ? (
        <button ref={trigger} type="button" onClick={() => setOpen(true)}>
          Delete my account…
        </button>
      ) : (
        <form onSubmit={onSubmit}>
          <p>This permanently removes your account, items and alerts. It cannot be undone.</p>
          <p>
            <label htmlFor="delete-password">Confirm with your password</label>
            <br />
            <input
              id="delete-password"
              name="password"
              type="password"
              autoComplete="current-password"
              maxLength={128}
              autoFocus
              required
            />
          </p>
          {error && <p role="alert">{error}</p>}
          <button type="submit" disabled={busy}>
            Permanently delete my account
          </button>{' '}
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              // the trigger is mounted again after this render
              setTimeout(() => trigger.current?.focus());
            }}
          >
            Cancel
          </button>
        </form>
      )}
    </section>
  );
}
