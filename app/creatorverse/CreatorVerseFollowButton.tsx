'use client';
import { communityClientTargetAllowed } from '@/lib/community/release-target';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

export default function CreatorVerseFollowButton({
  pageId,
  isOwner
}: {
  pageId: string;
  isOwner: boolean;
}) {
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [following, setFollowing] = useState(false);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [retryVersion, setRetryVersion] = useState(0);

  const staging =
    communityClientTargetAllowed() &&
    process.env.NEXT_PUBLIC_CREATORVERSE_SOCIAL_UI_ENABLED === 'true';

  useEffect(() => {
    if (!staging) return;

    let active = true;
    let sequence = 0;

    async function load(userId: string | null) {
      const current = ++sequence;
      if (!active) return;

      setReady(false);
      setViewerId(userId);
      setFollowing(false);
      setError('');

      if (!userId) {
        setReady(true);
        return;
      }

      try {
        const { data, error: failure } = await supabase
          .from('creatorverse_follows')
          .select('page_id')
          .eq('page_id', pageId)
          .eq('user_id', userId)
          .limit(1);

        if (!active || sequence !== current) return;
        if (failure) throw failure;
        setFollowing(Boolean(data?.length));
      } catch {
        if (active && sequence === current) {
          setError('Unable to check follow status. Please retry.');
        }
      } finally {
        if (active && sequence === current) setReady(true);
      }
    }

    void supabase.auth.getSession().then(({ data, error: failure }) => {
      if (failure) throw failure;
      if (active) void load(data.session?.user?.id ?? null);
    }).catch(() => {
      if (active) {
        setError('Unable to check your session. Please retry.');
        setReady(true);
      }
    });

    const { data: subscription } =
      supabase.auth.onAuthStateChange((_event, session) => {
        Promise.resolve().then(() => {
          if (active) void load(session?.user?.id ?? null);
        });
      });

    return () => {
      active = false;
      sequence++;
      subscription.subscription.unsubscribe();
    };
  }, [pageId, staging, retryVersion]);

  async function toggleFollow() {
    if (!viewerId || !ready || busy || isOwner || error) return;

    setBusy(true);
    setError('');

    try {
      const result = following
        ? await supabase
            .from('creatorverse_follows')
            .delete()
            .eq('page_id', pageId)
            .eq('user_id', viewerId)
        : await supabase
            .from('creatorverse_follows')
            .insert({
              page_id: pageId,
              user_id: viewerId
            });

      if (result.error) throw result.error;
      window.dispatchEvent(new Event(`creatorverse-follow-change:${pageId}`));

      const verification = await supabase
        .from('creatorverse_follows')
        .select('page_id')
        .eq('page_id', pageId)
        .eq('user_id', viewerId)
        .limit(1);

      if (verification.error) throw verification.error;

      setFollowing(Boolean(verification.data?.length));
    } catch {
      setError('Unable to confirm follow status. Retry to check before trying again.');
    } finally {
      setBusy(false);
    }
  }

  if (!staging || isOwner) return null;

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'flex-end',
      gap: 8,
      padding: 0,
      minWidth: 0,
      maxWidth: '100%',
      boxSizing: 'border-box'
    }}>
      {!viewerId && ready ? (
        <Link href="/" style={{
          background: '#8750e9',
          borderRadius: 999,
          padding: '9px 18px',
          color: '#fff',
          textDecoration: 'none'
        }}>
          Sign in to Follow
        </Link>
      ) : (
        <button
          type="button"
          disabled={!viewerId || !ready || busy || Boolean(error)}
          aria-pressed={following}
          onClick={() => void toggleFollow()}
          style={{
            minWidth: 110,
            padding: '9px 18px',
            borderRadius: 999,
            background: following ? '#30213f' : '#8750e9',
            border: '1px solid #8750e9',
            color: '#fff',
            fontWeight: 700,
            cursor: busy ? 'wait' : 'pointer'
          }}
        >
          {busy ? 'Saving...' : !ready ? 'Checking...' :
            following ? 'Following' : 'Follow'}
        </button>
      )}
      {error && (
        <>
        <span role="alert" style={{
          color: '#ffb6b6',
          fontSize: 12,
          overflowWrap: 'anywhere'
        }}>
          {error}
        </span>
        <button type="button" disabled={busy || !ready} onClick={() => {
          setReady(false);
          setRetryVersion(value => value + 1);
        }} style={{ minHeight: 44, padding: '9px 18px' }}>
          Retry follow status
        </button>
        </>
      )}
    </div>
  );
}
