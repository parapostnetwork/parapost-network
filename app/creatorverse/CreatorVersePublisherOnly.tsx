'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { supabase } from '@/lib/supabase';

type Props = {
  pageId: string;
  children: ReactNode;
};

export default function CreatorVersePublisherOnly({
  pageId,
  children,
}: Props) {
  const [canPublish, setCanPublish] = useState(false);

  useEffect(() => {
    let active = true;
    let sequence = 0;

    async function verify(token?: string) {
      const requestId = ++sequence;

      if (active) setCanPublish(false);
      if (!token) return;

      try {
        const response = await fetch(
          `/api/creatorverse/${encodeURIComponent(pageId)}/permissions`,
          {
            cache: 'no-store',
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        if (!response.ok) return;

        const permissions = await response.json() as {
          can_publish?: boolean;
        };

        if (active && requestId === sequence) {
          setCanPublish(permissions.can_publish === true);
        }
      } catch {
        if (active && requestId === sequence) {
          setCanPublish(false);
        }
      }
    }

    void supabase.auth.getSession().then(({ data }) => {
      if (active) {
        void verify(data.session?.access_token);
      }
    });

    const { data } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        void verify(session?.access_token);
      }
    );

    return () => {
      active = false;
      sequence++;
      data.subscription.unsubscribe();
    };
  }, [pageId]);

  if (!canPublish) return null;

  return <>{children}</>;
}
