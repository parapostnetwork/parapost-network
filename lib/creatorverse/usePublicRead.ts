'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
/** Anonymous visitors can read; signed-in requests retain their identity for block enforcement. */
export function usePublicRead<T>(path: string) {
  const [state, setState] = useState<{ path: string; data: T | null; error: string; loading: boolean }>({ path, data: null, error: '', loading: true });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true, receivedEvent = false, revision = 0;
    let lastToken: string | null | undefined;
    let pending: AbortController | undefined;
    const load = (token: string | null) => {
      if (!active || lastToken === token) return;
      lastToken = token;
      const version = ++revision;
      pending?.abort();
      const controller = new AbortController(); pending = controller;
      setState({ path, data: null, error: '', loading: true });
      // No auth/session call inside the Supabase callback. Fetch only uses its supplied token.
      void fetch(path, { cache: 'no-store', signal: controller.signal, headers: token ? { Authorization: `Bearer ${token}` } : {} })
        .then(async response => { if (!response.ok) throw Error('unavailable'); return response.json() as Promise<T>; })
        .then(data => { if (active && version === revision) setState({ path, data, error: '', loading: false }); })
        .catch(() => { if (active && version === revision && !controller.signal.aborted) setState({ path, data: null, error: 'This content is unavailable. Please try again.', loading: false }); });
    };
    const { data } = supabase.auth.onAuthStateChange((_event, session) => { receivedEvent = true; load(session?.access_token ?? null); });
    void supabase.auth.getSession().then(result => {
      if (result.error) throw result.error;
      if (!receivedEvent) load(result.data.session?.access_token ?? null);
    }).catch(() => {
      // An unknown/failed session is not silently downgraded to a public anonymous request.
      if (active && !receivedEvent) setState({ path, data: null, error: 'Your session could not be checked. Please try again.', loading: false });
    });
    return () => { active = false; revision++; pending?.abort(); data.subscription.unsubscribe(); };
  }, [path, attempt]);
  return { ...(state.path === path ? state : { data: null, error: '', loading: true }), retry: () => setAttempt(value => value + 1) };
}
