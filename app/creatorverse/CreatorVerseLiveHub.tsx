'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import liveStyles from './CreatorVerseLiveLayout.module.css';

type LiveShow = {
  id: string;
  title: string | null;
  description: string | null;
  status: string;
  scheduled_at: string | null;
  started_at: string | null;
  ended_at: string | null;
  updated_at: string | null;
  external_url: string | null;
};

function formatDate(value: string | null) {
  if (!value) return 'Date to be announced';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Date to be announced';
  }

  return date.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function safeSourceUrl(value: string | null) {
  if (!value) return null;

  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();

    if (
      url.protocol === 'https:' &&
      (
        host === 'youtube.com' ||
        host.endsWith('.youtube.com') ||
        host === 'youtu.be' ||
        host === 'twitch.tv' ||
        host.endsWith('.twitch.tv')
      )
    ) {
      return url.href;
    }
  } catch {
    return null;
  }

  return null;
}

export default function CreatorVerseLiveHub({
  pageId,
  onWatchLive,
}: {
  pageId: string;
  onWatchLive: () => void;
}) {
  const [shows, setShows] = useState<LiveShow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    async function loadShows() {
      const result = await supabase
        .from('live_streams')
        .select(
          'id, title, description, status, scheduled_at, started_at, ended_at, updated_at, external_url'
        )
        .eq('creatorverse_page_id', pageId)
        .eq('visibility', 'public')
        .eq('is_hidden', false)
        .in('status', ['upcoming', 'live', 'ended'])
        .order('updated_at', { ascending: false })
        .limit(40);

      if (!active) return;

      if (result.error) {
        setError('Unable to load broadcasts right now.');
      } else {
        setShows((result.data ?? []) as LiveShow[]);
        setError('');
      }

      setLoading(false);
    }

    void loadShows();

    // Refresh only while the Live tab is mounted.
    const interval = window.setInterval(() => {
      void loadShows();
    }, 45000);

    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [pageId]);

  const activeShows = shows.filter(
    show => show.status === 'live'
  );

  const upcomingShows = shows
    .filter(show => show.status === 'upcoming')
    .sort((a, b) =>
      (Date.parse(a.scheduled_at ?? '') || 0) -
      (Date.parse(b.scheduled_at ?? '') || 0)
    );

  const pastShows = shows
    .filter(show => show.status === 'ended')
    .sort((a, b) =>
      (Date.parse(b.ended_at ?? b.updated_at ?? '') || 0) -
      (Date.parse(a.ended_at ?? a.updated_at ?? '') || 0)
    );

  const cardStyle: React.CSSProperties = {
    border: '1px solid rgba(185,150,225,0.2)',
    borderRadius: 12,
    padding: 16,
    marginTop: 12,
    background: 'rgba(255,255,255,0.025)',
    overflowWrap: 'anywhere',
  };

  if (loading) {
    return <p role="status">Loading live shows...</p>;
  }

  if (error) {
    return <p role="alert">{error}</p>;
  }

  return (
    <div className={liveStyles.liveHub}>
      <section
        aria-label="Current live broadcasts"
        style={{ marginBottom: 28 }}
      >
        <h3 style={{ marginBottom: 10 }}>Live Now</h3>

        {activeShows.length === 0 ? (
          <p style={{ opacity: 0.7 }}>
            No one is broadcasting right now.
          </p>
        ) : (
          activeShows.map(show => (
            <article key={show.id} style={cardStyle}>
              <p style={{
                color: '#d3a5ff',
                fontWeight: 800,
                fontSize: 12,
                marginTop: 0,
              }}>
                LIVE NOW
              </p>

              <h4 style={{ margin: '8px 0' }}>
                {show.title || 'Live Broadcast'}
              </h4>

              <button
                type="button"
                onClick={onWatchLive}
                style={{
                  padding: '10px 14px',
                  border: '1px solid rgba(185,150,225,.5)',
                  borderRadius: 9,
                  background: '#8246c6',
                  color: '#fff',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Watch Live in Posts
              </button>
            </article>
          ))
        )}
      </section>

      <section
        aria-label="Upcoming live shows"
        style={{ marginBottom: 28 }}
      >
        <h3 style={{ marginBottom: 10 }}>
          Upcoming Live Shows
        </h3>

        {upcomingShows.length === 0 ? (
          <p style={{ opacity: 0.7 }}>
            No upcoming broadcasts scheduled yet.
          </p>
        ) : (
          upcomingShows.map(show => (
            <article key={show.id} style={cardStyle}>
              <h4 style={{ margin: '0 0 8px' }}>
                {show.title || 'Upcoming Broadcast'}
              </h4>

              <p style={{
                opacity: 0.8,
                fontSize: 13,
                margin: '0 0 8px',
              }}>
                {formatDate(show.scheduled_at)}
              </p>

              {show.description && (
                <p style={{
                  marginBottom: 0,
                  overflowWrap: 'anywhere',
                }}>
                  {show.description}
                </p>
              )}
            </article>
          ))
        )}
      </section>

      <section aria-label="Previous live broadcasts">
        <h3 style={{ marginBottom: 10 }}>
          Previous Broadcasts
        </h3>

        {pastShows.length === 0 ? (
          <p style={{ opacity: 0.7 }}>
            No previous broadcasts available yet.
          </p>
        ) : (
          pastShows.map(show => {
            const sourceUrl = safeSourceUrl(show.external_url);

            return (
              <article key={show.id} style={cardStyle}>
                <h4 style={{ margin: '0 0 8px' }}>
                  {show.title || 'Previous Broadcast'}
                </h4>

                <p style={{
                  opacity: 0.75,
                  fontSize: 13,
                  margin: '0 0 10px',
                }}>
                  Ended {formatDate(show.ended_at || show.updated_at)}
                </p>

                {show.description && (
                  <p style={{ overflowWrap: 'anywhere' }}>
                    {show.description}
                  </p>
                )}

                {sourceUrl && (
                  <a
                    href={sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      color: '#d3a5ff',
                      fontWeight: 600,
                    }}
                  >
                    Open original broadcast
                  </a>
                )}
              </article>
            );
          })
        )}

        {pastShows.length > 0 && (
          <p style={{
            opacity: 0.65,
            fontSize: 12,
            marginTop: 14,
          }}>
            Recording availability depends on the
            original streaming provider.
          </p>
        )}
      </section>
    </div>
  );
}
