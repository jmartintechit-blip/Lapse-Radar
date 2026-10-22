import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router';

const TITLES: Record<string, string> = {
  '/': 'Lapse Radar: know what expires before it breaks',
  '/login': 'Sign in · Lapse Radar',
  '/signup': 'Create account · Lapse Radar',
  '/dashboard': 'Dashboard · Lapse Radar',
  '/privacy': 'Privacy · Lapse Radar',
};

// Each route gets its own title, and after a route change focus moves to the page heading so
// keyboard and screen-reader users start at the top of the new page instead of on a vanished button.
export function RouteFocus() {
  const { pathname } = useLocation();
  const first = useRef(true);
  useEffect(() => {
    document.title = TITLES[pathname] ?? 'Page not found · Lapse Radar';
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
