import { useEffect, useState } from 'react';

// Routage minimal basé sur l'historique du navigateur (URL propres : /eleves, /bi/finances...)
const listeners = new Set();

export function navigate(path, { replace = false } = {}) {
  if (path === window.location.pathname + window.location.search) return;
  window.history[replace ? 'replaceState' : 'pushState']({}, '', path);
  listeners.forEach(fn => fn());
  window.scrollTo(0, 0);
}

export function useLocation() {
  const [loc, setLoc] = useState(() => window.location.pathname);
  useEffect(() => {
    const fn = () => setLoc(window.location.pathname);
    listeners.add(fn);
    window.addEventListener('popstate', fn);
    return () => { listeners.delete(fn); window.removeEventListener('popstate', fn); };
  }, []);
  return loc;
}
