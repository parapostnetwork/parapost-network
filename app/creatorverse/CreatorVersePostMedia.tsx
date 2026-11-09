'use client';
import PostVideoOverlay from '@/components/PostVideoOverlay';
import { useState } from 'react';
import PostMediaViewer, { type PostMediaViewerState } from '@/components/PostMediaViewer';

import {
  imagePreviewWrapStyle, composerPreviewGridStyle, composerPreviewSingleGridStyle,
  composerPreviewTileStyle, composerPreviewSingleTileStyle, composerPreviewImageStyle,
  composerPreviewCounterStyle, postImageStyle, postImageGridStyle,
  postImageGridTileStyle, postImageGridLargeTileStyle, postImageGridImageStyle,
} from '@/components/postPresentation';
import styles from './CreatorVersePosting.module.css';

export type LocalAttachment = { name: string; url: string; kind: 'image' | 'video'; blob?: Blob };
export default function CreatorVersePostMedia({ attachments, onRemove, disabled = false }: {
  attachments: LocalAttachment[]; onRemove?: (index: number) => void; disabled?: boolean;
}) {
  const [viewer, setViewer] =
    useState<PostMediaViewerState | null>(null);

  if (!attachments.length) return null;
  const single = attachments.length === 1;
  if (onRemove) return (
    <div className={styles.compactPreview} style={imagePreviewWrapStyle}>
      <div className={styles.compactPreviewGrid} style={{ ...composerPreviewGridStyle, ...(single ? composerPreviewSingleGridStyle : {}) }}>
        {attachments.map((item, index) => (
          <button key={item.url} className={styles.compactPreviewTile} type="button" disabled={disabled}
            aria-label={`Remove selected media ${index + 1}: ${item.name}`}
            onClick={() => onRemove(index)}
            style={{ ...composerPreviewTileStyle, ...(single ? composerPreviewSingleTileStyle : {}) }}>
            {item.kind === 'video' ? <video src={item.url} muted playsInline preload="metadata" style={composerPreviewImageStyle} />
              // Blob URLs are browser-local and cannot pass through the Next image optimizer.
              // eslint-disable-next-line @next/next/no-img-element
              : <img src={item.url} alt={item.name} style={composerPreviewImageStyle} />}
            <span style={composerPreviewCounterStyle}>{index + 1} of {attachments.length} · Remove</span>
          </button>
        ))}
      </div>
    </div>
  );
  const imageUrls = attachments
    .filter(item => item.kind === 'image')
    .map(item => item.url);

  function media(item: LocalAttachment, grid: boolean) {
    const style = grid ? { ...postImageGridImageStyle, position: 'absolute' as const, inset: 0, minHeight: 0 }
      : { ...postImageStyle, objectFit: 'contain' as const, height: 'auto' };
    return item.kind === 'video'
      ? <PostVideoOverlay
          src={item.url}
          label={item.name}
          className={grid ? undefined : styles.singleMedia}
          style={grid
            ? { ...style, width: '100%', height: '100%' }
            : {
                width: '100%',
                maxWidth: '100%',
                height: 'min(380px, 68dvh)'
              }}
        />
      // eslint-disable-next-line @next/next/no-img-element
      : <button type="button"
          className={styles.postImageOpen}
          aria-label="Open post image"
          onClick={() => setViewer({
            urls: imageUrls,
            initialIndex: imageUrls.indexOf(item.url),
            alt: item.name
          })}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={item.url} alt={item.name} loading="lazy"
            className={grid ? undefined : styles.singleMedia}
            style={style} />
        </button>;
  }
  if (single) return <>
    {media(attachments[0], false)}
    <PostMediaViewer viewer={viewer} onClose={() => setViewer(null)} />
  </>;
  return <>
  <div className={styles.mediaGrid} style={postImageGridStyle}>
    {attachments.map((item, index) => <div key={item.url} className={styles.mediaTile}
      style={{ ...postImageGridTileStyle, ...(attachments.length === 3 && index === 0 ? postImageGridLargeTileStyle : {}),
        minHeight: attachments.length === 3 && index === 0 ? 'calc(var(--cv-media-tile) * 2 + var(--cv-media-gap, 8px))' : 'var(--cv-media-tile)' }}>
      {media(item, true)}
    </div>)}
  </div>
  <PostMediaViewer viewer={viewer} onClose={() => setViewer(null)} />
  </>;
}