'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import CreatorVerseReplayCard from './CreatorVerseReplayCard';
import CreatorVerseLivePanel from './CreatorVerseLivePanel';
import { getLiveDisplayStatus } from '@/lib/live/status';
import liveStyles from './CreatorVerseLiveLayout.module.css';

type LiveShow = {
  id: string;
  user_id: string;
  provider: string | null;
  views: number;
  visibility: string | null;
  is_hidden: boolean | null;
  title: string | null;
  description: string | null;
  status: string;
  scheduled_at: string | null;
  started_at: string | null;
  ended_at: string | null;
  updated_at: string | null;
  external_url: string | null;
  embed_url: string | null;
  thumbnail_url: string | null;
};

export default function CreatorVerseLiveHub({
  pageId,
  pageName,
  currentUserId,
  onWatchLive,
}: {
  pageId: string;
  pageName: string;
  currentUserId: string | null;
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
          'id, user_id, provider, views, visibility, is_hidden, title, description, status, scheduled_at, started_at, ended_at, updated_at, external_url, embed_url, thumbnail_url'
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
    show => getLiveDisplayStatus(show) === 'live'
  );

  const upcomingShows = shows
    .filter(show => getLiveDisplayStatus(show) === 'upcoming')
    .sort((a, b) =>
      (Date.parse(a.scheduled_at ?? '') || 0) -
      (Date.parse(b.scheduled_at ?? '') || 0)
    );

  const pastShows = shows
    .filter(show => getLiveDisplayStatus(show) === 'ended')
    .sort((a, b) =>
      (Date.parse(b.ended_at ?? b.updated_at ?? '') || 0) -
      (Date.parse(a.ended_at ?? a.updated_at ?? '') || 0)
    );

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
            <div key={show.id}>
              <CreatorVerseLivePanel
                pageId={pageId}
                pageName={pageName}
                currentUserId={currentUserId}
                providedStream={show}
              />
              <button
                type="button"
                onClick={onWatchLive}
                style={{
                  padding: '10px 14px',
                  marginBottom: 16,
                  borderRadius: 9,
                  border: '1px solid rgba(185,150,225,.4)',
                  background: 'transparent',
                  color: 'inherit',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                View Live in Posts
              </button>
            </div>
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
            <CreatorVerseLivePanel
              key={show.id}
              pageId={pageId}
              pageName={pageName}
              currentUserId={currentUserId}
              providedStream={show}
            />
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
          pastShows.map(show => (
            <CreatorVerseReplayCard
              key={show.id}
              show={show}
              currentUserId={currentUserId}
            />
          ))
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
