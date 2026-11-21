'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { livePlayerUrl } from '@/lib/live/youtube-player';
import { canPlayPublishedStream } from '@/lib/live/playback';
import { getLiveDisplayStatus } from '@/lib/live/status';
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
  thumbnail_url: string | null;
  views: number;
  status: string;
  visibility: string | null;
  is_hidden: boolean | null;
  scheduled_at: string | null;
  started_at: string | null;
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

function formatSchedule(value: string | null) {
  if (!value) return 'Time to be announced';

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return 'Time to be announced';
  }

  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function CreatorVerseLivePanel({
  pageId,
  pageName,
  currentUserId,
}: Props) {
  const [stream, setStream] = useState<Stream | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const refresh = useCallback(async () => {
    const { data, error } = await supabase
      .from('live_streams')
      .select(
        'id,user_id,title,description,provider,embed_url,thumbnail_url,views,status,visibility,is_hidden,scheduled_at,started_at'
      )
      .eq('creatorverse_page_id', pageId)
      .in('status', ['upcoming', 'live'])
      .eq('visibility', 'public')
      .eq('is_hidden', false)
      .order('scheduled_at', { ascending: true })
      .limit(30);

    if (error) {
      console.error(
        'Unable to load CreatorVerse broadcast:',
        error.message
      );
      return;
    }

    const rows = (data ?? []) as Stream[];
    const timestamp = Date.now();

    const eligible = rows.filter(row => {
      const status = getLiveDisplayStatus(row, timestamp);
      return status === 'upcoming' || status === 'live';
    });

    eligible.sort((a, b) => {
      const aLive =
        getLiveDisplayStatus(a, timestamp) === 'live' ? 0 : 1;

      const bLive =
        getLiveDisplayStatus(b, timestamp) === 'live' ? 0 : 1;

      if (aLive !== bLive) return aLive - bLive;

      const aTime = Date.parse(a.scheduled_at ?? '') || 0;
      const bTime = Date.parse(b.scheduled_at ?? '') || 0;

      return aTime - bTime;
    });

    setStream(eligible[0] ?? null);
    setNow(timestamp);
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
        () => {
          void refresh();
        }
      )
      .subscribe();

    // Keep scheduled/live status fresh, including when
    // database realtime delivery is unavailable.
    const interval = window.setInterval(() => {
      setNow(Date.now());
      void refresh();
    }, 30000);

    const onFocus = () => {
      void refresh();
    };

    window.addEventListener('focus', onFocus);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', onFocus);
      void supabase.removeChannel(channel);
    };
  }, [pageId, refresh]);

  if (!stream) return null;

  const status = getLiveDisplayStatus(stream, now);
  const isLive = status === 'live';

  if (status !== 'live' && status !== 'upcoming') {
    return null;
  }

  const canEmbed = canPlayPublishedStream(stream);
  const playerUrl = canEmbed
    ? safePlayerUrl(stream.embed_url)
    : null;

  const playerId = `creatorverse-live-player-${stream.id}`;

  return (
    <article
      style={{
        ...postCardStyle,
        position: 'relative',
        overflow: 'hidden',
        minWidth: 0,
        marginBottom: 18,
        padding: 16,
        borderColor: isLive
          ? 'rgba(74,222,128,0.38)'
          : 'rgba(251,191,36,0.26)',
        boxShadow: '0 18px 46px rgba(0,0,0,0.30)',
      }}
      aria-label={`${pageName} live broadcast`}
    >
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 10,
          marginBottom: 14,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <strong>{pageName}</strong>
          <div
            style={{
              opacity: 0.75,
              fontSize: 13,
              marginTop: 4,
            }}
          >
            {isLive
              ? 'is live now'
              : 'scheduled a live show'}
          </div>
        </div>

        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            padding: '7px 11px',
            borderRadius: 999,
            border: isLive
              ? '1px solid rgba(74,222,128,0.30)'
              : '1px solid rgba(251,191,36,0.26)',
            background: isLive
              ? 'rgba(34,197,94,0.18)'
              : 'rgba(245,158,11,0.16)',
            color: isLive ? '#dcfce7' : '#fef3c7',
            fontSize: 12,
            fontWeight: 800,
            letterSpacing: '0.04em',
          }}
        >
          {isLive ? '● LIVE' : '◎ LIVE SOON'}
        </span>
      </header>

      <div
        style={{
          fontSize: 13,
          opacity: 0.85,
          marginBottom: 12,
        }}
      >
        Live from <strong>{pageName}</strong>
      </div>

      <div
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: 760,
          aspectRatio: '16 / 9',
          margin: '0 auto',
          borderRadius: 14,
          overflow: 'hidden',
          background: '#05070a',
          border: '1px solid rgba(255,255,255,0.12)',
        }}
      >
        {playerUrl ? (
          <iframe
            id={playerId}
            src={playerUrl}
            title={`${pageName}: ${stream.title}`}
            allow="autoplay; fullscreen; picture-in-picture"
            allowFullScreen
            loading="lazy"
            style={{
              display: 'block',
              width: '100%',
              height: '100%',
              border: 0,
              background: '#05070a',
            }}
          />
        ) : stream.thumbnail_url ? (
          <div
            style={{
              position: 'relative',
              width: '100%',
              height: '100%',
            }}
          >
            <img
              src={stream.thumbnail_url}
              alt={`${stream.title} broadcast thumbnail`}
              loading="lazy"
              style={{
                display: 'block',
                width: '100%',
                height: '100%',
                objectFit: 'contain',
              }}
            />

            <div
              style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                alignItems: 'flex-end',
                padding: 14,
                background:
                  'linear-gradient(180deg, transparent, rgba(0,0,0,0.72))',
              }}
            >
              <strong style={{ color: '#fff' }}>
                {isLive
                  ? 'Broadcast player unavailable'
                  : 'Scheduled Live Show'}
              </strong>
            </div>
          </div>
        ) : (
          <div
            style={{
              display: 'grid',
              placeItems: 'center',
              width: '100%',
              height: '100%',
              minHeight: 140,
              padding: 12,
              textAlign: 'center',
            }}
          >
            <span>
              {isLive ? 'Live broadcast' : 'Live show coming soon'}
            </span>
          </div>
        )}
      </div>

      <div style={{ marginTop: 14 }}>
        <div
          style={{
            color: isLive ? '#bbf7d0' : '#fde68a',
            fontSize: 12,
            fontWeight: 800,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            marginBottom: 8,
          }}
        >
          {isLive
            ? 'Live Now'
            : `Scheduled ${formatSchedule(stream.scheduled_at)}`}
        </div>

        <h3
          style={{
            margin: '0 0 10px',
            fontSize: '1.18rem',
            lineHeight: 1.25,
            overflowWrap: 'anywhere',
          }}
        >
          {stream.title || 'Parapost Live Show'}
        </h3>

        {stream.description && (
          <p
            style={{
              margin: 0,
              lineHeight: 1.55,
              overflowWrap: 'anywhere',
            }}
          >
            {stream.description}
          </p>
        )}

        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            marginTop: 14,
            padding: '8px 12px',
            borderRadius: 999,
            background: isLive
              ? 'rgba(34,197,94,0.14)'
              : 'rgba(245,158,11,0.14)',
            color: isLive ? '#dcfce7' : '#fef3c7',
            fontSize: 12,
            fontWeight: 700,
            lineHeight: 1.4,
          }}
        >
          {isLive
            ? 'Watch and comment here on Parapost.'
            : 'The broadcast will play here when it starts.'}
        </div>
      </div>

      {isLive && playerUrl && (
        <>
          <div style={{ marginTop: 14 }}>
            <LiveStreamViewCount
              streamId={stream.id}
              initialViews={stream.views}
              shouldCount={true}
              playerElementId={playerId}
            />
          </div>

          <div style={{ marginTop: 14 }}>
            <LiveChatPanel
              liveStreamId={stream.id}
              creatorUserId={stream.user_id}
              currentUserId={currentUserId ?? ''}
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
