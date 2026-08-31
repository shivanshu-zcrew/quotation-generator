import { useEffect, useRef, useState } from 'react';

// This app builds PDF/print HTML entirely client-side (see pdfGenerator.js) —
// a deployed backend/frontend fix does nothing for a tab that's been open
// since before the deploy, since a single-page app only ever picks up new
// code on an actual page load, not just by the user clicking around. That
// mismatch (dev tests in a freshly loaded tab and sees the fix; a user who
// left the app open all day keeps hitting the pre-fix bug indefinitely) is
// exactly what caused a real, hard-to-diagnose PDF layout complaint to look
// like it wasn't fixed when it actually was. Polling version.json (emitted
// fresh per build by vite.config.js, served with Cache-Control: no-cache so
// it can't get stuck stale itself) lets an open tab notice a new deploy and
// prompt a reload instead of silently running stale code forever.
const CHECK_INTERVAL_MS = 5 * 60 * 1000;

async function fetchBuildId() {
  const res = await fetch('/version.json', { cache: 'no-store' });
  if (!res.ok) return null;
  const data = await res.json();
  return data.buildId || null;
}

export function useVersionCheck() {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const initialBuildIdRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      const buildId = await fetchBuildId().catch(() => null);
      if (!buildId || cancelled) return;
      if (initialBuildIdRef.current === null) {
        initialBuildIdRef.current = buildId;
        return;
      }
      if (buildId !== initialBuildIdRef.current) setUpdateAvailable(true);
    };

    check();
    const intervalId = setInterval(check, CHECK_INTERVAL_MS);
    // Also check right away when the user comes back to this tab — the
    // common real-world case (left open overnight/all day) would otherwise
    // wait up to a full CHECK_INTERVAL_MS after they resume working in it.
    const onVisibilityChange = () => { if (document.visibilityState === 'visible') check(); };
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);

  return updateAvailable;
}
