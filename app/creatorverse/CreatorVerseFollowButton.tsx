'use client';

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

  const staging =
    process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, '') ===
      'https://vmgelrgrtpghmvqgufzz.supabase.co' &&
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

      const { data, error: failure } = await supabase
        .from('creatorverse_follows')
        .select('page_id')
        .eq('page_id', pageId)
        .eq('user_id', userId)
        .maybeSingle();

      if (!active || sequence !== current) return;

      if (failure) {
        setError(failure.message);
      } else {
        setFollowing(Boolean(data));
      }

      setReady(true);
    }

    void supabase.auth.getSession().then(({ data }) => {
      if (active) void load(data.session?.user?.id ?? null);
    }).catch(() => {
      if (active) {
        setError('Unable to check your session.');
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
  }, [pageId, staging]);

  async function toggleFollow() {
    if (!viewerId || !ready || busy || isOwner) return;

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

      const verification = await supabase
        .from('creatorverse_follows')
        .select('page_id')
        .eq('page_id', pageId)
        .eq('user_id', viewerId)
        .maybeSingle();

      if (verification.error) throw verification.error;

      setFollowing(Boolean(verification.data));
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : 'Unable to update follow status.'
      );
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
      padding: '0 20px 14px'
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
        <span role="alert" style={{
          color: '#ffb6b6',
          fontSize: 12
        }}>
          {error}
        </span>
      )}
    </div>
  );
}
