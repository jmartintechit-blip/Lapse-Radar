import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { en, type Dict } from './locales/en';
import { es } from './locales/es';

export type Lang = 'en' | 'es';
const DICTS: Record<Lang, Dict> = { en, es };
const KEY = 'lang';

// Storage can throw (private windows, blocked site data); the choice then lasts for this visit only.
function initial(): Lang {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === 'en' || saved === 'es') return saved;
  } catch {
    // fall through to the browser language
  }
  return navigator.language.toLowerCase().startsWith('es') ? 'es' : 'en';
}

// Module-level copy so code outside React (api.ts) reads the same language the screens show.
let current: Lang = initial();
export const getLang = () => current;
export const getDict = () => DICTS[current];

// Server errors arrive in English; show the Spanish text when there is one.
export const serverMessage = (message: string) => getDict().serverMessages[message] ?? message;

type I18n = { lang: Lang; setLang: (lang: Lang) => void; t: Dict };
const I18nContext = createContext<I18n | null>(null);

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n needs an I18nProvider');
  return ctx;
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setState] = useState<Lang>(current);
  useEffect(() => void (document.documentElement.lang = lang), [lang]);
  const setLang = useCallback((next: Lang) => {
    current = next;
    try {
      localStorage.setItem(KEY, next);
    } catch {
      // not persisted, still applied for this visit
    }
    setState(next);
  }, []);
  const value = useMemo(() => ({ lang, setLang, t: DICTS[lang] }), [lang, setLang]);
  return <I18nContext value={value}>{children}</I18nContext>;
}
