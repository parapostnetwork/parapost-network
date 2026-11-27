'use client';

/* eslint-disable @next/next/no-img-element */

import { useState } from 'react';
import PostVideoOverlay from '@/components/PostVideoOverlay';
import PostMediaViewer, { type PostMediaViewerState } from '@/components/PostMediaViewer';
import type {
  CreatorVersePublishedMedia as Media,
} from '@/lib/creatorverse/types';

type Props = {
  pageId: string;
  postId: string;
  media: Media;
  galleryMedia?: Media[];
};

export default function CreatorVersePublishedMedia({
  pageId,
  postId,
  media,
  galleryMedia,
}: Props) {
  const [viewer, setViewer] = useState<PostMediaViewerState | null>(null);
  const mediaSource = (item: Media) =>
    `/api/creatorverse/pages/${encodeURIComponent(pageId)}` +
    `/posts/${encodeURIComponent(postId)}` +
    `/media/${encodeURIComponent(item.id)}`;
  const gallery = (galleryMedia ?? [media]).filter(item => item.media_type === 'image');
  const photoUrls = gallery.map(mediaSource);
  const source = mediaSource(media);

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
    <PostVideoOverlay
      src={source}
      thumbnailSrc={source + '#t=0.001'}
      generatePoster
      label="CreatorVerse published video"
      style={style}
    />
  ) : (
    <>
      <button
        type="button"
        aria-label="Open CreatorVerse photo"
        onClick={() => setViewer({
          urls: photoUrls,
          initialIndex: Math.max(0, gallery.findIndex(item => item.id === media.id)),
          alt: 'CreatorVerse published photo',
        })}
        style={{ display: 'block', width: '100%', padding: 0, border: 0,
          borderRadius: 12, background: 'transparent', cursor: 'zoom-in' }}
      >
        <img src={source} alt="CreatorVerse published photo" loading="lazy" style={style} />
      </button>
      <PostMediaViewer viewer={viewer} onClose={() => setViewer(null)} />
    </>
  );
}
