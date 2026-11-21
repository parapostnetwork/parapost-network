'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import CreatorVerseReplayCard, {
  type CreatorVerseReplayShow,
} from './CreatorVerseReplayCard';

export default function CreatorVerseReplayFeed({
  pageId,
  currentUserId,
}: {
  pageId: string;
  currentUserId: string | null;
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
        .order('updated_at', { ascending: false })
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
