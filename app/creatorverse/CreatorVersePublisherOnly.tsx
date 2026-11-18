'use client';

import { Fragment, type ReactNode } from 'react';
import { useCreatorVersePermissions } from '@/lib/creatorverse/useCreatorVersePermissions';

export default function CreatorVersePublisherOnly({ pageId, children }: {
  pageId: string;
  children: ReactNode;
}) {
  const { canPublish, viewerId } = useCreatorVersePermissions(pageId);
  if (!canPublish) return null;
  return <Fragment key={`${pageId}:${viewerId}`}>{children}</Fragment>;
}
