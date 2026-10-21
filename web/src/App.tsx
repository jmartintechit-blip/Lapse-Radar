import { useEffect, useState } from 'react';
import { Route, Routes } from 'react-router';

type ApiStatus = 'loading' | 'ok' | 'error';

function Home() {
  const [status, setStatus] = useState<ApiStatus>('loading');

  useEffect(() => {
    fetch('/api/health')
      .then((res) => setStatus(res.ok ? 'ok' : 'error'))
      .catch(() => setStatus('error'));
  }, []);

  return (
    <main>
      <h1>Lapse Radar</h1>
      <p>Know what expires before it breaks.</p>
      <p role="status">API status: {status}</p>
    </main>
  );
}

function NotFound() {
  return (
    <main>
      <h1>Page not found</h1>
    </main>
  );
}

export function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
