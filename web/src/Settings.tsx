import { useEffect, useState, type FormEvent } from 'react';
import { api, errorMessage } from './api';

type Settings = { thresholds: number[]; emailAlerts: boolean };

export function Settings({ readOnly }: { readOnly: boolean }) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<Settings>('GET', '/me')
      .then(setSettings)
      .catch((err: unknown) => setError(errorMessage(err)));
  }, []);

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const thresholds = String(data.get('thresholds') ?? '')
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean)
      .map(Number);
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      setSettings(
        await api<Settings>('PATCH', '/settings', {
          thresholds,
          emailAlerts: data.get('emailAlerts') === 'on',
        }),
      );
      setSaved(true);
    } catch (err) {
      setError(errorMessage(err));
    }
    setBusy(false);
  };

  return (
    <section aria-labelledby="settings-heading">
      <h2 id="settings-heading">Alert settings</h2>
      {!settings ? (
        error ? (
          <p role="alert">{error}</p>
        ) : (
          <p role="status">Loading settings…</p>
        )
      ) : (
        // Keyed by the saved values so the inputs show what the server actually stored.
        <form
          key={`${settings.thresholds}|${settings.emailAlerts}`}
          onSubmit={onSubmit}
          aria-labelledby="settings-heading"
        >
          <p>
            <label htmlFor="thresholds">
              Alert me when this many days are left (comma separated)
            </label>
            <br />
            <input
              id="thresholds"
              name="thresholds"
              defaultValue={settings.thresholds.join(', ')}
              inputMode="numeric"
              pattern="[0-9, ]+"
              disabled={readOnly}
              required
            />
          </p>
          <p>
            <label>
              <input
                type="checkbox"
                name="emailAlerts"
                defaultChecked={settings.emailAlerts}
                disabled={readOnly}
              />{' '}
              Also send alerts by email
            </label>
          </p>
          {error && <p role="alert">{error}</p>}
          {saved && <p role="status">Settings saved.</p>}
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
