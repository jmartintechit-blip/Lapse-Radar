import { useCallback, useEffect, useState } from 'react';
import { api, errorMessage } from './api';

type Alert = {
  id: string;
  label: string;
  kind: 'tls' | 'domain' | 'manual';
  thresholdDays: number;
  expiresAt: string;
  createdAt: string;
  readAt: string | null;
};

const describe = (a: Alert) =>
  a.thresholdDays === 0
    ? `${a.label} has expired`
    : `${a.label} expires in ${a.thresholdDays} day${a.thresholdDays === 1 ? '' : 's'} or less`;

// version changes whenever items change, because that is when new alerts can appear.
export function Alerts({ readOnly, version }: { readOnly: boolean; version: number }) {
  const [alerts, setAlerts] = useState<Alert[] | null>(null);
  const [error, setError] = useState<string | null>(null);

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
    } catch (err) {
      setError(errorMessage(err));
    }
  };
  const now = new Date().toISOString();
  const unread = alerts?.filter((a) => !a.readAt).length ?? 0;

  return (
    <section aria-labelledby="alerts-heading">
      <h2 id="alerts-heading">Alerts{unread > 0 && ` (${unread} unread)`}</h2>
      {error && (
        <div role="alert">
          <p>{error}</p>
          <button type="button" onClick={() => void load()}>
            Try again
          </button>
        </div>
      )}
      {!alerts ? (
        !error && <p role="status">Loading alerts…</p>
      ) : alerts.length === 0 ? (
        <p>No alerts yet. They appear when an item gets close to its expiry date.</p>
      ) : (
        <>
          {!readOnly && unread > 0 && (
            <button
              type="button"
              onClick={() =>
                void markRead('/alerts/read-all', (a) => ({ ...a, readAt: a.readAt ?? now }))
              }
            >
              Mark all as read
            </button>
          )}
          <ul>
            {alerts.map((a) => (
              <li key={a.id}>
                {a.readAt ? '' : <strong>New: </strong>}
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
                    Mark as read<span className="visually-hidden">: {describe(a)}</span>
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
