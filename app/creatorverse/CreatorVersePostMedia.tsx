'use client';

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
  if (!attachments.length) return null;
  const single = attachments.length === 1;
  if (onRemove) return (
    <div style={imagePreviewWrapStyle}>
      <div style={{ ...composerPreviewGridStyle, ...(single ? composerPreviewSingleGridStyle : {}) }}>
        {attachments.map((item, index) => (
          <button key={item.url} type="button" disabled={disabled}
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
  function media(item: LocalAttachment, grid: boolean) {
    const style = grid ? { ...postImageGridImageStyle, position: 'absolute' as const, inset: 0, minHeight: 0 }
      : { ...postImageStyle, objectFit: 'contain' as const, height: 'auto' };
    return item.kind === 'video'
      ? <video src={item.url} controls playsInline preload="metadata" aria-label={item.name} className={grid ? undefined : styles.singleMedia}
          style={{ ...style, objectFit: 'contain' }} />
      // eslint-disable-next-line @next/next/no-img-element
      : <img src={item.url} alt={item.name} loading="lazy" className={grid ? undefined : styles.singleMedia} style={style} />;
  }
  if (single) return media(attachments[0], false);
  return <div className={styles.mediaGrid} style={postImageGridStyle}>
    {attachments.map((item, index) => <div key={item.url} className={styles.mediaTile}
      style={{ ...postImageGridTileStyle, ...(attachments.length === 3 && index === 0 ? postImageGridLargeTileStyle : {}),
        minHeight: attachments.length === 3 && index === 0 ? 'calc(var(--cv-media-tile) * 2 + var(--cv-media-gap, 8px))' : 'var(--cv-media-tile)' }}>
      {media(item, true)}
    </div>)}
  </div>;
}
