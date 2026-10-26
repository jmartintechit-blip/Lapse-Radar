import { useCallback, useEffect, useState } from 'react';
import { useAnnounce } from './announce';
import { api, errorMessage } from './api';
import { useI18n } from './i18n';

type Alert = {
  id: string;
  label: string;
  kind: 'tls' | 'domain' | 'manual';
  thresholdDays: number;
  expiresAt: string;
  createdAt: string;
  readAt: string | null;
};

// version changes whenever items change, because that is when new alerts can appear.
export function Alerts({ readOnly, version }: { readOnly: boolean; version: number }) {
  const [alerts, setAlerts] = useState<Alert[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const announce = useAnnounce();
  const { t } = useI18n();
  const describe = (a: Alert) => t.alertText(a.label, a.thresholdDays);

  const load = useCallback(async () => {
    setError(null);
    try {
      setAlerts(await api<Alert[]>('GET', '/alerts'));
    } catch (err) {
      setError(errorMessage(err));
    }
  }, []);
  useEffect(() => void load(), [load, version]);

  const markRead = async (path: string, update: (a: Alert) => Alert) => {
    setError(null);
    try {
      await api('POST', path);
      setAlerts((list) => list?.map(update) ?? null);
      announce(path.endsWith('read-all') ? t.allMarked : t.oneMarked);
      // the button that had focus is gone: continue from the section heading
      document.getElementById('alerts-heading')?.focus();
    } catch (err) {
      setError(errorMessage(err));
    }
  };
  const now = new Date().toISOString();
  const unread = alerts?.filter((a) => !a.readAt).length ?? 0;

  return (
    <section aria-labelledby="alerts-heading">
      <h2 id="alerts-heading" tabIndex={-1}>
        {t.alertsTitle(unread)}
      </h2>
      {error && (
        <div role="alert">
          <p>{error}</p>
          <button type="button" onClick={() => void load()}>
            {t.tryAgain}
          </button>
        </div>
      )}
      {!alerts ? (
        !error && <p role="status">{t.loadingAlerts}</p>
      ) : alerts.length === 0 ? (
        <p>{t.noAlerts}</p>
      ) : (
        <>
          {!readOnly && unread > 0 && (
            <button
              type="button"
              onClick={() =>
                void markRead('/alerts/read-all', (a) => ({ ...a, readAt: a.readAt ?? now }))
              }
            >
              {t.markAllRead}
            </button>
          )}
          <ul>
            {alerts.map((a) => (
              <li key={a.id}>
                {a.readAt ? '' : <strong>{t.newPrefix}</strong>}
                {describe(a)} ({a.expiresAt.slice(0, 10)}){' '}
                {!a.readAt && !readOnly && (
                  <button
                    type="button"
                    onClick={() =>
                      void markRead(`/alerts/${a.id}/read`, (x) =>
                        x.id === a.id ? { ...x, readAt: now } : x,
                      )
                    }
                  >
                    {t.markRead}
                    <span className="visually-hidden">: {describe(a)}</span>
                  </button>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
