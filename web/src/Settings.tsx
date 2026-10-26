import { useEffect, useState, type FormEvent } from 'react';
import { useAnnounce } from './announce';
import { api, errorMessage } from './api';
import { useI18n } from './i18n';

type Settings = { thresholds: number[]; emailAlerts: boolean };

export function Settings({ readOnly }: { readOnly: boolean }) {
  const announce = useAnnounce();
  const { t } = useI18n();
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
    // Only the latest request may fill the form: a late duplicate response (StrictMode runs this
    // effect twice in development) would overwrite what the user has already typed.
    let current = true;
    api<Settings>('GET', '/me')
      .then((s) => {
        if (!current) return;
        show(s);
        setLoaded(true);
      })
      .catch((err: unknown) => current && setError(errorMessage(err)));
    return () => {
      current = false;
    };
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
      announce(t.settingsAnnounce);
    } catch (err) {
      setError(errorMessage(err));
    }
    setBusy(false);
  };

  return (
    <section aria-labelledby="settings-heading">
      <h2 id="settings-heading">{t.settingsTitle}</h2>
      {!loaded ? (
        error ? (
          <p role="alert">{error}</p>
        ) : (
          <p>{t.loadingSettings}</p>
        )
      ) : (
        <form onSubmit={onSubmit}>
          {readOnly && <p id="settings-readonly">{t.settingsReadOnly}</p>}
          <p>
            <label htmlFor="thresholds">{t.thresholdsLabel}</label>
            <br />
            <input
              id="thresholds"
              value={thresholds}
              onChange={(e) => setThresholds(e.target.value)}
              inputMode="numeric"
              pattern="[0-9, ]+"
              title={t.thresholdsHint}
              aria-describedby={readOnly ? 'settings-readonly' : 'thresholds-hint'}
              readOnly={readOnly}
              required
            />
          </p>
          <p id="thresholds-hint">{t.thresholdsHint}</p>
          <p>
            <label>
              <input
                type="checkbox"
                checked={emailAlerts}
                onChange={(e) => setEmailAlerts(e.target.checked)}
                disabled={readOnly}
              />{' '}
              {t.emailAlerts}
            </label>
          </p>
          {error && <p role="alert">{error}</p>}
          {saved && <p>{t.settingsSaved}</p>}
          {!readOnly && (
            <button type="submit" disabled={busy}>
              {t.saveSettings}
            </button>
          )}
        </form>
      )}
    </section>
  );
}
