import { useState, useEffect } from 'react';

// Shared breakpoint values for the app's table<->card responsive dashboards
// (Admin/Home/Ops). A single source of truth so breakpoints can't drift out
// of sync between screens the way they previously did (768/1100/1024/640px
// scattered across independent copies).
export const BREAKPOINTS = {
  mobile: 768,
  compact: 1200,
};

export const useMediaQuery = (query) => {
  const [matches, setMatches] = useState(() => typeof window !== 'undefined' ? window.matchMedia(query).matches : false);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia(query);
    const h = (e) => setMatches(e.matches);
    mq.addEventListener ? mq.addEventListener('change', h) : mq.addListener(h);
    return () => mq.removeEventListener ? mq.removeEventListener('change', h) : mq.removeListener(h);
  }, [query]);
  return matches;
};

export default useMediaQuery;
