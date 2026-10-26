import { useState } from 'react';
import { Link } from 'react-router';
import { api } from './api';
import { useAuth } from './auth';
import { useI18n, type Lang } from './i18n';
import { applyTheme, currentTheme, type Theme } from './theme';

export function SiteHeader() {
  const [theme, setTheme] = useState<Theme>(currentTheme);
  const { lang, setLang, t } = useI18n();
  const { user } = useAuth();
  const next: Theme = theme === 'dark' ? 'light' : 'dark';

  const choose = (value: Lang) => {
    setLang(value);
    // The emails of a real account follow the language chosen here; failing to save it is harmless.
    if (user && !user.isDemo)
      void api('POST', '/me/language', { lang: value }).catch(() => undefined);
  };

  return (
    <header className="site-header">
      <Link to="/" className="brand">
        <span aria-hidden="true">◎</span> LAPSE RADAR
      </Link>
      <label className="lang-picker">
        <span className="visually-hidden">{t.language}</span>
        <select value={lang} onChange={(e) => choose(e.target.value as Lang)}>
          <option value="en" lang="en">
            English
          </option>
          <option value="es" lang="es">
            Español
          </option>
        </select>
      </label>
      <button
        type="button"
        onClick={() => {
          applyTheme(next);
          setTheme(next);
        }}
      >
        {t.useTheme(next)}
      </button>
    </header>
  );
}
