import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';

const AnnounceContext = createContext<(message: string) => void>(() => undefined);
export const useAnnounce = () => useContext(AnnounceContext);

// One polite live region that stays mounted for the whole visit, so screen readers pick up every
// message. A changing invisible suffix makes the same text twice in a row count as a new message.
export function AnnounceProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState({ message: '', count: 0 });
  const announce = useCallback(
    (message: string) => setState((s) => ({ message, count: s.count + 1 })),
    [],
  );
  return (
    <AnnounceContext value={announce}>
      {children}
      <div aria-live="polite" className="visually-hidden">
        {state.message}
        {state.count % 2 ? '\u200b' : ''}
      </div>
    </AnnounceContext>
  );
}
