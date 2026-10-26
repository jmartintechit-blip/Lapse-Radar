import { Link } from 'react-router';
import { useI18n } from './i18n';

export function Privacy() {
  const { t } = useI18n();
  return (
    <main>
      <h1>{t.privacy}</h1>
      <p>{t.privacyIntro}</p>
      <h2>{t.privacyStoredTitle}</h2>
      <ul>
        {t.privacyStored.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      <h2>{t.privacySeenTitle}</h2>
      <ul>
        {t.privacySeen.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      <h2>{t.privacyControlTitle}</h2>
      <p>{t.privacyControl}</p>
      <p>
        <Link to="/">{t.backHome}</Link>
      </p>
    </main>
  );
}
