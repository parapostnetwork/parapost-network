'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

/** Auth callbacks only update React state: never await another auth operation inside them. */
export function useGroupSession() {
  const [session, setSession] = useState({ ready: false, userId: '', revision: 0 });
  useEffect(() => {
    let active = true;
    let receivedEvent = false;
    const accept = (userId: string, refresh = false) => {
      if (!active) return;
      setSession(previous => previous.ready && previous.userId === userId && !refresh
        ? previous
        : { ready: true, userId, revision: previous.revision + 1 });
    };
    const { data } = supabase.auth.onAuthStateChange((event, next) => {
      receivedEvent = true;
      accept(next?.user.id ?? '', event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED');
    });
    void supabase.auth.getSession().then(({ data }) => {
      if (!receivedEvent) accept(data.session?.user.id ?? '');
    }).catch(() => { if (!receivedEvent) accept(''); });
    return () => { active = false; data.subscription.unsubscribe(); };
  }, []);
  return session;
}
