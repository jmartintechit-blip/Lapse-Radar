import { useState, type FormEvent } from 'react';
import { useAnnounce } from './announce';
import { api, errorMessage } from './api';
import { useAuth } from './auth';
import { useI18n } from './i18n';

// One small form: posts the fields to a path, then shows a status message. Fields clear on success.
function ActionForm({
  title,
  path,
  done,
  fields,
  submit,
}: {
  title: string;
  path: string;
  done: string;
  fields: { name: string; label: string; type: string; autoComplete: string; min?: number }[];
  submit: string;
}) {
  const announce = useAnnounce();
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);
  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    setBusy(true);
    setError(null);
    setOk(false);
    try {
      await api('POST', path, Object.fromEntries(new FormData(form)));
      form.reset();
      setOk(true);
      announce(done);
    } catch (err) {
      setError(errorMessage(err));
    }
    setBusy(false);
  };
  const id = path.replace(/\W/g, '');
  return (
    <form onSubmit={onSubmit} aria-labelledby={`${id}-heading`}>
      <h3 id={`${id}-heading`}>{title}</h3>
      {fields.map((f) => (
        <p key={f.name}>
          <label htmlFor={`${id}-${f.name}`}>{f.label}</label>
          <br />
          <input
            id={`${id}-${f.name}`}
            name={f.name}
            type={f.type}
            autoComplete={f.autoComplete}
            minLength={f.min}
            maxLength={f.type === 'email' ? 254 : 128}
            required
          />
        </p>
      ))}
      {error && <p role="alert">{error}</p>}
      {ok && <p>{done}</p>}
      <button type="submit" disabled={busy}>
        {submit}
      </button>
    </form>
  );
}

export function Account() {
  const { user } = useAuth();
  const { t } = useI18n();
  const announce = useAnnounce();
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const resend = async () => {
    setError(null);
    setSent(false);
    try {
      await api('POST', '/me/verification');
      setSent(true);
      announce(t.confirmationSent);
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <section aria-labelledby="account-heading">
      <h2 id="account-heading">{t.accountTitle}</h2>
      {user?.emailVerified ? (
        <p>{t.emailVerified}</p>
      ) : (
        <>
          <p>{t.emailNotVerified}</p>
          <button type="button" onClick={() => void resend()}>
            {t.resendConfirmation}
          </button>
          {sent && <p>{t.confirmationSent}</p>}
          {error && <p role="alert">{error}</p>}
        </>
      )}
      <ActionForm
        title={t.changePassword}
        path="/me/password"
        done={t.passwordChanged}
        submit={t.changePassword}
        fields={[
          {
            name: 'currentPassword',
            label: t.currentPassword,
            type: 'password',
            autoComplete: 'current-password',
          },
          {
            name: 'newPassword',
            label: t.newPassword,
            type: 'password',
            autoComplete: 'new-password',
            min: 10,
          },
        ]}
      />
      <ActionForm
        title={t.changeEmail}
        path="/me/email"
        done={t.changeEmailSent}
        submit={t.changeEmail}
        fields={[
          { name: 'newEmail', label: t.newEmail, type: 'email', autoComplete: 'email' },
          {
            name: 'password',
            label: t.currentPassword,
            type: 'password',
            autoComplete: 'current-password',
          },
        ]}
      />
    </section>
  );
}
