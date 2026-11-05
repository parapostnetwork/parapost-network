'use client';

import type { ReactNode } from 'react';
import { usePublicRead } from '@/lib/creatorverse/usePublicRead';
import type { PagePermissions } from '@/lib/creatorverse/types';

type Props = {
  pageId: string;
  children: ReactNode;
};

/**
 * Presentation-only permission gate.
 * The server and database must independently authorize every write.
 */
export default function CreatorVersePublisherOnly({
  pageId,
  children,
}: Props) {
  const { data, loading, error } = usePublicRead<PagePermissions>(
    `/api/creatorverse/${encodeURIComponent(pageId)}/permissions`
  );

  // Never expose owner controls while identity or permission is uncertain.
  if (loading || error || data?.can_publish !== true) {
    return null;
  }

  return <>{children}</>;
}
