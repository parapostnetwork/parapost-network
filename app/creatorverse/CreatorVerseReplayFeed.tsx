'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import CreatorVerseReplayCard, {
  type CreatorVerseReplayShow,
} from './CreatorVerseReplayCard';

export default function CreatorVerseReplayFeed({
  pageId,
  currentUserId,
  children,
}: {
  pageId: string;
  currentUserId: string | null;
  children?: (replays: CreatorVerseReplayShow[]) => ReactNode;
}) {
  const [replays, setReplays] = useState<CreatorVerseReplayShow[]>([]);

  useEffect(() => {
    let active = true;

    async function refresh() {
      const { data, error } = await supabase
        .from('live_streams')
        .select('id, user_id, title, description, provider, views, status, scheduled_at, started_at, ended_at, updated_at, external_url, embed_url, thumbnail_url')
        .eq('creatorverse_page_id', pageId)
        .eq('visibility', 'public')
        .eq('is_hidden', false)
        .eq('status', 'ended')
        .order('ended_at', { ascending: false, nullsFirst: false })
        .limit(5);

      if (active && !error) {
        setReplays((data ?? []) as CreatorVerseReplayShow[]);
      }
    }

    void refresh();
    const interval = window.setInterval(() => void refresh(), 45000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [pageId]);

  if (children) return <>{children(replays)}</>;

  return (
    <>
      {replays.map(show => (
        <CreatorVerseReplayCard
          key={show.id}
          show={show}
          currentUserId={currentUserId}
        />
      ))}
    </>
  );
}
