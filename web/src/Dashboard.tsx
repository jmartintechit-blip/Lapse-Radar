import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { daysRemaining, expiryStatus } from '../../shared/expiry';
import { api, errorMessage } from './api';
import { useAuth } from './auth';

type Item = {
  id: string;
  kind: 'tls' | 'domain' | 'manual';
  label: string;
  host: string | null;
  expiresAt: string | null;
  status: 'pending' | 'ok' | 'error';
  lastError: string | null;
  notes: string | null;
};

const KIND_NAME = { tls: 'TLS certificate', domain: 'Domain', manual: 'Manual' } as const;
// A date input holds a day; items expire at the start of that UTC day.
const toIso = (day: string) => `${day}T00:00:00Z`;

function expiryText(item: Item) {
  if (!item.expiresAt) {
    return item.status === 'error' ? 'Check failed' : 'Not checked yet';
  }
  const days = daysRemaining(item.expiresAt);
  const day = item.expiresAt.slice(0, 10);
  const when =
    expiryStatus(item.expiresAt) === 'expired'
      ? days === 0
        ? 'expired today'
        : `expired ${-days} day${days === -1 ? '' : 's'} ago`
      : `${days} day${days === 1 ? '' : 's'} left`;
  return `${day} · ${when}`;
}

function AddItemForm({ onAdded }: { onAdded: (item: Item) => void }) {
  const [kind, setKind] = useState<Item['kind']>('tls');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const manual = kind === 'manual';

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    const text = (name: string) => String(data.get(name) ?? '').trim();
    const body = manual
      ? { kind, label: text('label'), expiresAt: toIso(text('expires')) }
      : { kind, host: text('host'), ...(text('label') ? { label: text('label') } : {}) };
    setBusy(true);
    setError(null);
    try {
      onAdded(await api<Item>('POST', '/items', body));
      form.reset();
    } catch (err) {
      setError(errorMessage(err));
    }
    setBusy(false);
  };

  return (
    <form onSubmit={onSubmit} aria-labelledby="add-heading">
      <h2 id="add-heading">Add an item</h2>
      <p>
        <label htmlFor="kind">Type</label>
        <br />
        <select id="kind" value={kind} onChange={(e) => setKind(e.target.value as Item['kind'])}>
          <option value="tls">TLS certificate</option>
          <option value="domain">Domain</option>
          <option value="manual">Manual (token, licence…)</option>
        </select>
      </p>
      {!manual && (
        <p>
          <label htmlFor="host">Host name</label>
          <br />
          <input
            id="host"
            name="host"
            placeholder="example.com"
            maxLength={253}
            autoComplete="off"
            required
          />
        </p>
      )}
      <p>
        <label htmlFor="label">{manual ? 'Label' : 'Label (optional)'}</label>
        <br />
        <input id="label" name="label" maxLength={100} required={manual} />
      </p>
      {manual && (
        <p>
          <label htmlFor="expires">Expires on</label>
          <br />
          <input id="expires" name="expires" type="date" min="2000-01-01" required />
        </p>
      )}
      {error && <p role="alert">{error}</p>}
      <button type="submit" disabled={busy}>
        Add item
      </button>
    </form>
  );
}

function EditForm({
  item,
  onSaved,
  onCancel,
}: {
  item: Item;
  onSaved: (item: Item) => void;
  onCancel: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const text = (name: string) => String(data.get(name) ?? '').trim();
    setBusy(true);
    setError(null);
    try {
      onSaved(
        await api<Item>('PATCH', `/items/${item.id}`, {
          label: text('label'),
          notes: text('notes') || null,
          ...(item.kind === 'manual' ? { expiresAt: toIso(text('expires')) } : {}),
        }),
      );
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <form onSubmit={onSubmit} aria-label={`Edit ${item.label}`}>
      <p>
        <label htmlFor={`label-${item.id}`}>Label</label>
        <br />
        <input
          id={`label-${item.id}`}
          name="label"
          defaultValue={item.label}
          maxLength={100}
          required
        />
      </p>
      {item.kind === 'manual' && (
        <p>
          <label htmlFor={`expires-${item.id}`}>Expires on</label>
          <br />
          <input
            id={`expires-${item.id}`}
            name="expires"
            type="date"
            min="2000-01-01"
            defaultValue={item.expiresAt?.slice(0, 10)}
            required
          />
        </p>
      )}
      <p>
        <label htmlFor={`notes-${item.id}`}>Notes</label>
        <br />
        <textarea
          id={`notes-${item.id}`}
          name="notes"
          defaultValue={item.notes ?? ''}
          maxLength={500}
        />
      </p>
      {error && <p role="alert">{error}</p>}
      <button type="submit" disabled={busy}>
        Save
      </button>{' '}
      <button type="button" onClick={onCancel}>
        Cancel
      </button>
    </form>
  );
}

function ItemRow({
  item,
  readOnly,
  onChanged,
  onDeleted,
}: {
  item: Item;
  readOnly: boolean;
  onChanged: (item: Item) => void;
  onDeleted: (id: string) => void;
}) {
  const [mode, setMode] = useState<'view' | 'edit' | 'confirm'>('view');
  const [error, setError] = useState<string | null>(null);

  const remove = async () => {
    try {
      await api('DELETE', `/items/${item.id}`);
      onDeleted(item.id);
    } catch (err) {
      setError(errorMessage(err));
      setMode('view');
    }
  };

  const [checking, setChecking] = useState(false);
  const checkNow = async () => {
    setError(null);
    setChecking(true);
    try {
      onChanged(await api<Item>('POST', `/items/${item.id}/check`));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setChecking(false);
    }
  };

  const status = item.expiresAt ? expiryStatus(item.expiresAt) : item.status;

  return (
    <tr>
      <th scope="row">{item.label}</th>
      <td>
        {KIND_NAME[item.kind]}
        {item.host && item.host !== item.label ? ` · ${item.host}` : ''}
      </td>
      <td>{expiryText(item)}</td>
      <td data-status={status}>{status}</td>
      <td>
        {mode === 'edit' ? (
          <EditForm
            item={item}
            onCancel={() => setMode('view')}
            onSaved={(saved) => {
              onChanged(saved);
              setMode('view');
            }}
          />
        ) : readOnly ? null : mode === 'confirm' ? (
          <>
            <button type="button" onClick={() => void remove()}>
              Confirm delete {item.label}
            </button>{' '}
            <button type="button" onClick={() => setMode('view')}>
              Keep
            </button>
          </>
        ) : (
          <>
            {item.kind !== 'manual' && (
              <>
                <button type="button" disabled={checking} onClick={() => void checkNow()}>
                  {checking ? 'Checking…' : 'Check now'}
                  <span className="visually-hidden"> {item.label}</span>
                </button>{' '}
              </>
            )}
            <button type="button" onClick={() => setMode('edit')}>
              Edit<span className="visually-hidden"> {item.label}</span>
            </button>{' '}
            <button type="button" onClick={() => setMode('confirm')}>
              Delete<span className="visually-hidden"> {item.label}</span>
            </button>
          </>
        )}
        {error && <p role="alert">{error}</p>}
        {item.status === 'error' && item.lastError && <p>Last check: {item.lastError}</p>}
      </td>
    </tr>
  );
}

export function Dashboard() {
  const { user, logout } = useAuth();
  const [items, setItems] = useState<Item[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const readOnly = user?.isDemo ?? true;

  const load = useCallback(async () => {
    setError(null);
    setItems(null);
    try {
      setItems(await api<Item[]>('GET', '/items'));
    } catch (err) {
      setError(errorMessage(err));
    }
  }, []);
  useEffect(() => void load(), [load]);

  return (
    <main>
      <h1>Dashboard</h1>
      <p>Signed in as {user?.email}</p>
      <button type="button" onClick={() => void logout()}>
        Sign out
      </button>

      <h2>Your items</h2>
      {error ? (
        <div role="alert">
          <p>{error}</p>
          <button type="button" onClick={() => void load()}>
            Try again
          </button>
        </div>
      ) : !items ? (
        <p role="status">Loading items…</p>
      ) : items.length === 0 ? (
        <p>Nothing tracked yet. Add a domain, a TLS host or a token to see its days left.</p>
      ) : (
        <table>
          <caption className="visually-hidden">Tracked items and their expiry</caption>
          <thead>
            <tr>
              <th scope="col">Item</th>
              <th scope="col">Type</th>
              <th scope="col">Expires</th>
              <th scope="col">Status</th>
              <th scope="col">Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <ItemRow
                key={item.id}
                item={item}
                readOnly={readOnly}
                onChanged={(saved) => setItems(items.map((i) => (i.id === saved.id ? saved : i)))}
                onDeleted={(id) => setItems(items.filter((i) => i.id !== id))}
              />
            ))}
          </tbody>
        </table>
      )}

      {readOnly ? (
        <p>The demo account is read-only.</p>
      ) : error ? null : (
        <AddItemForm onAdded={(item) => setItems((items) => [...(items ?? []), item])} />
      )}
    </main>
  );
}
