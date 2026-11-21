'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { livePlayerUrl } from '@/lib/live/youtube-player';
import LiveChatPanel from '@/components/live/LiveChatPanel';
import LiveStreamViewCount from '@/components/live/LiveStreamViewCount';
import { postCardStyle } from '@/components/postPresentation';

type Stream = {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  provider: string | null;
  embed_url: string | null;
  views: number;
  status: string;
};

type Props = {
  pageId: string;
  pageName: string;
  currentUserId: string | null;
};

function safePlayerUrl(value: string | null): string | null {
  if (!value || typeof window === 'undefined') return null;

  try {
    const url = new URL(
      livePlayerUrl(value, window.location.origin)
    );

    const allowed = new Set([
      'www.youtube.com',
      'youtube.com',
      'www.youtube-nocookie.com',
      'youtube-nocookie.com',
      'player.twitch.tv',
    ]);

    if (url.protocol !== 'https:' || !allowed.has(url.hostname)) {
      return null;
    }

    return url.toString();
  } catch {
    return null;
  }
}

export default function CreatorVerseLivePanel({
  pageId,
  pageName,
  currentUserId,
}: Props) {
  const [stream, setStream] = useState<Stream | null>(null);
  const [playing, setPlaying] = useState(false);

  const refresh = useCallback(async () => {
    const { data, error } = await supabase
      .from('live_streams')
      .select(
        'id,user_id,title,description,provider,embed_url,views,status'
      )
      .eq('creatorverse_page_id', pageId)
      .eq('status', 'live')
      .eq('visibility', 'public')
      .eq('is_hidden', false)
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      setStream(null);
      return;
    }

    const next = (data || null) as Stream | null;

    setStream(previous => {
      if (previous?.id !== next?.id) {
        setPlaying(false);
      }
      return next;
    });
  }, [pageId]);

  useEffect(() => {
    void refresh();

    const channel = supabase
      .channel(`creatorverse-live-${pageId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'live_streams',
          filter: `creatorverse_page_id=eq.${pageId}`,
        },
        () => { void refresh(); }
      )
      .subscribe();

    const onFocus = () => { void refresh(); };
    window.addEventListener('focus', onFocus);

    return () => {
      window.removeEventListener('focus', onFocus);
      void supabase.removeChannel(channel);
    };
  }, [pageId, refresh]);

  if (!stream) return null;

  const playerUrl = safePlayerUrl(stream.embed_url);
  const playerId = `creatorverse-live-player-${stream.id}`;

  return (
    <article
      style={{
        ...postCardStyle,
        marginBottom: 16,
        padding: 16,
      }}
      aria-label={`${pageName} live broadcast`}
    >
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 12,
        marginBottom: 12,
      }}>
        <strong>{pageName}</strong>
        <span style={{
          borderRadius: 8,
          padding: '5px 9px',
          background: '#b91c1c',
          color: '#ffffff',
          fontSize: 12,
          fontWeight: 800,
        }}>
          LIVE
        </span>
      </div>

      <h3 style={{ marginBottom: 10 }}>{stream.title}</h3>

      {stream.description && (
        <p style={{ marginBottom: 12 }}>
          {stream.description}
        </p>
      )}

      {!playing ? (
        <button
          type="button"
          disabled={!playerUrl}
          onClick={() => setPlaying(true)}
          style={{
            width: '100%',
            minHeight: 150,
            borderRadius: 12,
            border: '1px solid rgba(255,255,255,0.15)',
            background: '#10121c',
            color: '#ffffff',
            fontWeight: 700,
            cursor: playerUrl ? 'pointer' : 'default',
          }}
        >
          {playerUrl ? 'Watch Live' : 'Live player unavailable'}
        </button>
      ) : (
        <>
          <iframe
            id={playerId}
            src={playerUrl || undefined}
            title={`${pageName} live broadcast`}
            allow="autoplay; fullscreen; picture-in-picture"
            allowFullScreen
            style={{
              display: 'block',
              width: '100%',
              aspectRatio: '16 / 9',
              border: 0,
              background: '#05070a',
            }}
          />

          <div style={{ marginTop: 12 }}>
            <LiveStreamViewCount
              streamId={stream.id}
              initialViews={stream.views}
              shouldCount={true}
              playerElementId={playerId}
            />
          </div>

          <div style={{ marginTop: 12 }}>
            <LiveChatPanel
              liveStreamId={stream.id}
              creatorUserId={stream.user_id}
              currentUserId={currentUserId ?? ""}
              status="live"
              compact
              maxVisibleMessages={4}
            />
          </div>
        </>
      )}
    </article>
  );
}
