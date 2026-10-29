'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { SharedGroupPost } from '@/app/groups/SharedGroupPostCard';
import { fetchGroupShares } from './sharedFeed';
import { createGroupReadQueue } from './readQueue';
import { useGroupSession } from './useGroupSession';

/** One lifecycle for the existing Group-share feed on Dashboard and Profile. */
export function useSharedGroupFeed(sharerId: string | null, limit = 60) {
  const session = useGroupSession();
  const scope = JSON.stringify([session.userId, sharerId, limit]);
  const [state, setState] = useState<{ scope: string; shares: SharedGroupPost[]; loading: boolean; error: string }>({
    scope: '', shares: [], loading: true, error: '',
  });
  const refreshRef = useRef<() => void>(() => {});
  const refresh = useCallback(() => refreshRef.current(), []);
  useEffect(() => {
    if (!session.ready || !session.userId || sharerId === '') {
      setState({ scope, shares: [], loading: !session.ready, error: '' });
      return;
    }
    const update = (patch: Partial<typeof state>) => setState(previous => ({
      ...(previous.scope === scope ? previous : { scope, shares: [], loading: true, error: '' }), ...patch,
    }));
    const queue = createGroupReadQueue({
      read: async (signal) => {
        const { data, error } = await fetchGroupShares(sharerId, limit, signal);
        if (error) throw error;
        return (data ?? []).filter(share => share.share_id && share.sharer_id &&
          (share.promotion || (share.post_id && share.original_author_id)) &&
          (!sharerId || share.sharer_id === sharerId));
      },
      apply: shares => update({ shares, error: '' }),
      // Failed authorization must never keep a previously permitted private projection visible.
      fail: () => update({ shares: [], error: 'Group shares could not be loaded. Please try again.' }),
      loading: loading => update({ loading }),
    });
    const revalidate = () => { if (document.visibilityState !== 'hidden') queue.refresh(); };
    const clear = () => { queue.invalidate(); update({ shares: [], loading: true }); };
    const visibility = () => { if (document.visibilityState === 'hidden') clear(); else revalidate(); };
    refreshRef.current = revalidate;
    revalidate();
    window.addEventListener('focus', revalidate);
    window.addEventListener('pageshow', revalidate);
    window.addEventListener('pagehide', clear);
    window.addEventListener('parapost-group-shared', revalidate);
    document.addEventListener('visibilitychange', visibility);
    // Preserve the existing 30s permission recheck, once per feed instead of once per promotion card.
    const timer = window.setInterval(revalidate, 30000);
    return () => {
      queue.dispose(); refreshRef.current = () => {};
      window.clearInterval(timer);
      window.removeEventListener('focus', revalidate);
      window.removeEventListener('pageshow', revalidate);
      window.removeEventListener('pagehide', clear);
      window.removeEventListener('parapost-group-shared', revalidate);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [scope, session.ready, session.userId, session.revision, sharerId, limit]);
  return {
    shares: session.userId && state.scope === scope ? state.shares : [],
    loading: !session.ready || state.scope !== scope || state.loading,
    error: state.scope === scope ? state.error : '', refresh,
  };
}
