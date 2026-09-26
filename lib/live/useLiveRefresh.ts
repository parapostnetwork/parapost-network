"use client";

import { useEffect, useRef } from "react";

// Realtime is the fast path. Polling and foreground events recover missed events
// after a mobile webview is suspended or a desktop tab loses its connection.
export function useLiveRefresh(refresh: () => Promise<unknown>, enabled: boolean) {
  const latest = useRef(refresh);
  useEffect(() => { latest.current = refresh; }, [refresh]);
  useEffect(() => {
    if (!enabled) return;
    let inFlight = false;
    const run = async () => {
      if (document.visibilityState !== "visible" || inFlight) return;
      inFlight = true;
      try { await latest.current(); }
      catch { console.warn("Live status refresh failed; will retry."); }
      finally { inFlight = false; }
    };
    const interval = window.setInterval(run, 10000);
    window.addEventListener("focus", run);
    window.addEventListener("pageshow", run);
    document.addEventListener("visibilitychange", run);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", run);
      window.removeEventListener("pageshow", run);
      document.removeEventListener("visibilitychange", run);
    };
  }, [enabled]);
}
