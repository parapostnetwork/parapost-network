'use client';

/* eslint-disable @next/next/no-img-element */

import type {
  CreatorVersePublishedMedia as Media,
} from '@/lib/creatorverse/types';

type Props = {
  pageId: string;
  postId: string;
  media: Media;
};

export default function CreatorVersePublishedMedia({
  pageId,
  postId,
  media,
}: Props) {
  const source =
    `/api/creatorverse/pages/${encodeURIComponent(pageId)}` +
    `/posts/${encodeURIComponent(postId)}` +
    `/media/${encodeURIComponent(media.id)}`;

  const style = {
    display: 'block' as const,
    width: '100%',
    maxWidth: '100%',
    maxHeight: 520,
    objectFit: 'contain' as const,
    borderRadius: 12,
    background: '#17121e',
  };

  return media.media_type === 'video' ? (
    <video
      src={source}
      controls
      playsInline
      preload="metadata"
      style={style}
      aria-label="CreatorVerse published video"
    />
  ) : (
    <img
      src={source}
      alt="CreatorVerse published photo"
      loading="lazy"
      style={style}
    />
  );
}
