import { useEffect, useState, type FormEvent } from 'react';
import { useAnnounce } from './announce';
import { api, errorMessage } from './api';

type Settings = { thresholds: number[]; emailAlerts: boolean };

export function Settings({ readOnly }: { readOnly: boolean }) {
  const announce = useAnnounce();
  const [thresholds, setThresholds] = useState('');
  const [emailAlerts, setEmailAlerts] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  const show = (s: Settings) => {
    setThresholds(s.thresholds.join(', '));
    setEmailAlerts(s.emailAlerts);
  };
  useEffect(() => {
    api<Settings>('GET', '/me')
      .then((s) => {
        show(s);
        setLoaded(true);
      })
      .catch((err: unknown) => setError(errorMessage(err)));
  }, []);

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      show(
        await api<Settings>('PATCH', '/settings', {
          thresholds: thresholds
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean)
            .map(Number),
          emailAlerts,
        }),
      );
      setSaved(true);
      announce('Alert settings saved');
    } catch (err) {
      setError(errorMessage(err));
    }
    setBusy(false);
  };

  return (
    <section aria-labelledby="settings-heading">
      <h2 id="settings-heading">Alert settings</h2>
      {!loaded ? (
        error ? (
          <p role="alert">{error}</p>
        ) : (
          <p>Loading settings…</p>
        )
      ) : (
        <form onSubmit={onSubmit}>
          {readOnly && <p id="settings-readonly">Read-only in the demo account.</p>}
          <p>
            <label htmlFor="thresholds">
              Alert me when this many days are left (comma separated)
            </label>
            <br />
            <input
              id="thresholds"
              value={thresholds}
              onChange={(e) => setThresholds(e.target.value)}
              inputMode="numeric"
              pattern="[0-9, ]+"
              title="Whole numbers separated by commas, for example 30, 14, 7, 1"
              aria-describedby={readOnly ? 'settings-readonly' : 'thresholds-hint'}
              readOnly={readOnly}
              required
            />
          </p>
          <p id="thresholds-hint">Whole numbers separated by commas, for example 30, 14, 7, 1.</p>
          <p>
            <label>
              <input
                type="checkbox"
                checked={emailAlerts}
                onChange={(e) => setEmailAlerts(e.target.checked)}
                disabled={readOnly}
              />{' '}
              Also send alerts by email
            </label>
          </p>
          {error && <p role="alert">{error}</p>}
          {saved && <p>Settings saved.</p>}
          {!readOnly && (
            <button type="submit" disabled={busy}>
              Save settings
            </button>
          )}
        </form>
      )}
    </section>
  );
}
