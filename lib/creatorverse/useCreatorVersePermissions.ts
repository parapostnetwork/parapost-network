'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useGroupSession } from '@/lib/groups/useGroupSession';

/** Preserve the same owner's form during token refresh; never carry access across accounts. */
export function useCreatorVersePermissions(pageId: string) {
  const session = useGroupSession();
  const key = `${pageId}:${session.userId}`;
  const [verified, setVerified] = useState({ key: '', canPublish: false, canManage: false });

  useEffect(() => {
    let active = true;
    if (!session.ready || !session.userId) return;
    const denied = { key, canPublish: false, canManage: false };
    void (async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error || !data.session || data.session.user.id !== session.userId) {
          if (active) setVerified(denied);
          return;
        }
        if (!active) return;
        const response = await fetch(`/api/creatorverse/${encodeURIComponent(pageId)}/permissions`, {
          cache: 'no-store', headers: { Authorization: `Bearer ${data.session.access_token}` },
        });
        if (!response.ok) throw new Error('Permissions unavailable');
        const permissions = await response.json();
        if (active) setVerified({ key,
          canPublish: permissions?.can_publish === true,
          canManage: permissions?.can_edit_details === true,
        });
      } catch {
        if (active) setVerified(denied);
      }
    })();
    return () => { active = false; };
  }, [key, pageId, session.ready, session.userId, session.revision]);

  const current = session.ready && !!session.userId && verified.key === key;
  return { viewerId: session.userId,
    canPublish: current && verified.canPublish,
    canManage: current && verified.canManage,
  };
}
