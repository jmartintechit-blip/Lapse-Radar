import { useState } from 'react';
import { Link } from 'react-router';
import { applyTheme, currentTheme, type Theme } from './theme';

export function SiteHeader() {
  const [theme, setTheme] = useState<Theme>(currentTheme);
  const next: Theme = theme === 'dark' ? 'light' : 'dark';
  return (
    <header className="site-header">
      <Link to="/" className="brand">
        <span aria-hidden="true">◎</span> LAPSE RADAR
      </Link>
      <button
        type="button"
        onClick={() => {
          applyTheme(next);
          setTheme(next);
        }}
      >
        Use {next} theme
      </button>
    </header>
  );
}
