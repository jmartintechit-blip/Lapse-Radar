import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { daysRemaining, expiryStatus } from '../../shared/expiry';
import { api, errorMessage } from './api';
import { Link } from 'react-router';
import { Account } from './Account';
import { Alerts } from './Alerts';
import { useAnnounce } from './announce';
import { DeleteAccount } from './DeleteAccount';
import { useAuth } from './auth';
import { useI18n } from './i18n';
import type { Dict } from './locales/en';
import { Settings } from './Settings';

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

// Status is never shown by colour alone: each state has its own symbol and word.
const STATUS_SYMBOL = {
  expired: '✕',
  critical: '▲',
  soon: '●',
  ok: '✓',
  pending: '…',
  error: '!',
} as const;
// A date input holds a day; items expire at the start of that UTC day.
const toIso = (day: string) => `${day}T00:00:00Z`;

function expiryText(item: Item, t: Dict) {
  if (!item.expiresAt) {
    return item.status === 'error' ? t.checkFailed : t.notCheckedYet;
  }
  const days = daysRemaining(item.expiresAt);
  const day = item.expiresAt.slice(0, 10);
  const when =
    expiryStatus(item.expiresAt) === 'expired'
      ? days === 0
        ? t.expiredToday
        : t.expiredAgo(-days)
      : t.daysLeft(days);
  return `${day} · ${when}`;
}

function AddItemForm({ onAdded }: { onAdded: (item: Item) => void }) {
  const { t } = useI18n();
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
      <h2 id="add-heading">{t.addItem}</h2>
      <p>
        <label htmlFor="kind">{t.type}</label>
        <br />
        <select id="kind" value={kind} onChange={(e) => setKind(e.target.value as Item['kind'])}>
          <option value="tls">{t.kinds.tls}</option>
          <option value="domain">{t.kinds.domain}</option>
          <option value="manual">{t.kindManualOption}</option>
        </select>
      </p>
      {!manual && (
        <p>
          <label htmlFor="host">{t.hostName}</label>
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
        <label htmlFor="label">{manual ? t.label : t.labelOptional}</label>
        <br />
        <input id="label" name="label" maxLength={100} required={manual} />
      </p>
      {manual && (
        <p>
          <label htmlFor="expires">{t.expiresOn}</label>
          <br />
          <input id="expires" name="expires" type="date" min="2000-01-01" required />
        </p>
      )}
      {error && <p role="alert">{error}</p>}
      <button type="submit" disabled={busy}>
        {t.addItemButton}
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
  const { t } = useI18n();
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
    <form onSubmit={onSubmit} aria-label={t.editItem(item.label)}>
      <p>
        <label htmlFor={`label-${item.id}`}>{t.label}</label>
        <br />
        <input
          id={`label-${item.id}`}
          name="label"
          autoFocus
          defaultValue={item.label}
          maxLength={100}
          required
        />
      </p>
      {item.kind === 'manual' && (
        <p>
          <label htmlFor={`expires-${item.id}`}>{t.expiresOn}</label>
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
        <label htmlFor={`notes-${item.id}`}>{t.notes}</label>
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
        {t.save}
      </button>{' '}
      <button type="button" onClick={onCancel}>
        {t.cancel}
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
  const { t } = useI18n();
  const [mode, setMode] = useState<'view' | 'edit' | 'confirm'>('view');
  const [error, setError] = useState<string | null>(null);
  const editButton = useRef<HTMLButtonElement>(null);
  const deleteButton = useRef<HTMLButtonElement>(null);
  const previous = useRef(mode);
  // Leaving edit or confirm removes the focused control; put focus back on the one that opened it.
  useEffect(() => {
    if (mode === 'view') {
      if (previous.current === 'edit') editButton.current?.focus();
      if (previous.current === 'confirm') deleteButton.current?.focus();
    }
    previous.current = mode;
  }, [mode]);

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
    <tr role="row">
      <th scope="row" role="rowheader">
        {item.label}
      </th>
      <td role="cell" data-label={t.colType}>
        {t.kinds[item.kind]}
        {item.host && item.host !== item.label ? ` · ${item.host}` : ''}
      </td>
      <td role="cell" data-label={t.colExpires}>
        {expiryText(item, t)}
      </td>
      <td role="cell" data-label={t.colStatus}>
        <span className={`chip chip-${status}`}>
          <span aria-hidden="true">{STATUS_SYMBOL[status]}</span> {t.chips[status]}
        </span>
      </td>
      <td role="cell" className="row-actions">
        {mode === 'edit' ? (
          <EditForm
            item={item}
            onCancel={() => setMode('view')}
            onSaved={(saved) => {
              onChanged(saved);
              setMode('view');
            }}
          />
        ) : readOnly ? (
          <span className="visually-hidden">{t.readOnlyDemo}</span>
        ) : mode === 'confirm' ? (
          <>
            <button type="button" onClick={() => void remove()}>
              {t.confirmDelete(item.label)}
            </button>{' '}
            <button type="button" autoFocus onClick={() => setMode('view')}>
              {t.keep}
            </button>
          </>
        ) : (
          <>
            {item.kind !== 'manual' && (
              <>
                <button type="button" disabled={checking} onClick={() => void checkNow()}>
                  {checking ? t.checking : t.checkNow}
                  <span className="visually-hidden"> {item.label}</span>
                </button>{' '}
              </>
            )}
            <button ref={editButton} type="button" onClick={() => setMode('edit')}>
              {t.edit}
              <span className="visually-hidden"> {item.label}</span>
            </button>{' '}
            <button ref={deleteButton} type="button" onClick={() => setMode('confirm')}>
              {t.delete}
              <span className="visually-hidden"> {item.label}</span>
            </button>
          </>
        )}
        {error && <p role="alert">{error}</p>}
        {item.status === 'error' && item.lastError && <p>{t.lastCheck(item.lastError)}</p>}
      </td>
    </tr>
  );
}

export function Dashboard() {
  const { user, logout } = useAuth();
  const { t } = useI18n();
  const [items, setItems] = useState<Item[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const readOnly = user?.isDemo ?? true;
  const announce = useAnnounce();
  // Alerts can appear whenever items change; the polite live region tells screen-reader users what happened.
  const itemsChanged = (message: string) => {
    setVersion((v) => v + 1);
    announce(message);
  };

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
      <h1>{t.dashboard}</h1>
      <p>{t.signedInAs(user?.email ?? '')}</p>
      <button type="button" onClick={() => void logout()}>
        {t.signOut}
      </button>

      <h2 id="items-heading" tabIndex={-1}>
        {t.yourItems}
      </h2>
      {error ? (
        <div role="alert">
          <p>{error}</p>
          <button type="button" onClick={() => void load()}>
            {t.tryAgain}
          </button>
        </div>
      ) : !items ? (
        <p role="status">{t.loadingItems}</p>
      ) : items.length === 0 ? (
        <p>{t.nothingTracked}</p>
      ) : (
        <table role="table">
          <caption className="visually-hidden">{t.tableCaption}</caption>
          <thead role="rowgroup">
            <tr role="row">
              <th scope="col" role="columnheader">
                {t.colItem}
              </th>
              <th scope="col" role="columnheader">
                {t.colType}
              </th>
              <th scope="col" role="columnheader">
                {t.colExpires}
              </th>
              <th scope="col" role="columnheader">
                {t.colStatus}
              </th>
              <th scope="col" role="columnheader">
                {t.colActions}
              </th>
            </tr>
          </thead>
          <tbody role="rowgroup">
            {items.map((item) => (
              <ItemRow
                key={item.id}
                item={item}
                readOnly={readOnly}
                onChanged={(saved) => {
                  setItems(items.map((i) => (i.id === saved.id ? saved : i)));
                  itemsChanged(t.updated(saved.label));
                }}
                onDeleted={(id) => {
                  setItems(items.filter((i) => i.id !== id));
                  itemsChanged(t.deleted(items.find((i) => i.id === id)?.label ?? t.itemFallback));
                  document.getElementById('items-heading')?.focus();
                }}
              />
            ))}
          </tbody>
        </table>
      )}

      {readOnly ? (
        <p>{t.demoReadOnly}</p>
      ) : error ? null : (
        <AddItemForm
          onAdded={(item) => {
            setItems((items) => [...(items ?? []), item]);
            itemsChanged(t.added(item.label));
          }}
        />
      )}

      <Alerts readOnly={readOnly} version={version} />
      <Settings readOnly={readOnly} />
      {!readOnly && <Account />}
      {!readOnly && <DeleteAccount />}
      <p>
        <Link to="/privacy">{t.privacy}</Link>
      </p>
    </main>
  );
}
