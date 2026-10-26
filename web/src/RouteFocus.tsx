import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router';
import { useI18n } from './i18n';

// Each route gets its own title, and after a route change focus moves to the page heading so
// keyboard and screen-reader users start at the top of the new page instead of on a vanished button.
export function RouteFocus() {
  const { pathname } = useLocation();
  const first = useRef(true);
  const { t } = useI18n();
  // Separate effects: switching language retitles the page but must not pull focus off the selector.
  useEffect(() => {
    document.title = (t.titles as Record<string, string>)[pathname] ?? t.titles.notFound;
  }, [pathname, t]);
  useEffect(() => {
    if (first.current) {
      first.current = false; // do not steal focus on the first load
      return;
    }
    const heading = document.querySelector<HTMLElement>('main h1');
    heading?.setAttribute('tabindex', '-1');
    heading?.focus();
  }, [pathname]);
  return null;
}
