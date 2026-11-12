'use client';

import { useEffect, useRef, useState } from 'react';
import PostComposerInput from '@/components/PostComposerInput';
import { composerCardStyle, composerFooterStyle, publishButtonStyle,
  imagePreviewWrapStyle, composerPreviewGridStyle, composerPreviewSingleGridStyle,
  composerPreviewTileStyle, composerPreviewSingleTileStyle, composerPreviewImageStyle,
  composerPreviewCounterStyle } from '@/components/postPresentation';
import { validateUpload } from '@/lib/groups/validation';
import type { PostProfile } from './PostIdentity';
import GroupAvatarView from './GroupAvatarView';
import styles from './groupPosting.module.css';



function Preview({ file, index, count, disabled, onRemove }: {
  file: File; index: number; count: number; disabled: boolean; onRemove: () => void;
}) {
  const [url, setUrl] = useState('');
  const [thumbnail, setThumbnail] = useState('');

  useEffect(() => {
    const src = URL.createObjectURL(file);
    let active = true;

    // eslint-disable-next-line react-hooks/set-state-in-effect -- synchronize browser-owned preview URL
    setUrl(src);
    setThumbnail('');

    if (file.type.startsWith('video/')) {
      const video = document.createElement('video');
      video.muted = true;
      video.playsInline = true;
      video.preload = 'auto';

      const capture = () => {
        if (!active || !video.videoWidth || !video.videoHeight) return;
        try {
          const canvas = document.createElement('canvas');
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          const ctx = canvas.getContext('2d');
          if (!ctx) return;
          ctx.drawImage(video, 0, 0);
          const image = canvas.toDataURL('image/jpeg', 0.85);
          if (active) setThumbnail(image);
        } catch {
          // Retain the native video fallback.
        }
      };

      video.onloadedmetadata = () => {
        if (!active) return;
        try {
          video.currentTime = Number.isFinite(video.duration)
            ? Math.min(0.2, video.duration / 2)
            : 0.2;
        } catch {
          // Some browsers cannot seek this file.
        }
      };

      video.onseeked = capture;
      video.onloadeddata = capture;
      video.src = src;
      video.load();

      return () => {
        active = false;
        video.onloadedmetadata = null;
        video.onseeked = null;
        video.onloadeddata = null;
        video.removeAttribute('src');
        video.load();
        URL.revokeObjectURL(src);
      };
    }

    return () => {
      active = false;
      URL.revokeObjectURL(src);
    };
  }, [file]);
  return <button type="button" className={styles.previewTile} disabled={disabled}
    style={{ ...composerPreviewTileStyle, ...(count === 1 ? composerPreviewSingleTileStyle : {}) }}
    onClick={onRemove} aria-label={`Remove selected media ${index + 1}: ${file.name}`}>
    {url && (file.type.startsWith('video/')
      ? thumbnail
          ? (
              // Browser-generated local thumbnail, not a remote image.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={thumbnail} alt={`Video preview ${index + 1}`} style={composerPreviewImageStyle} />
            )
          : <video src={url} muted playsInline preload="auto" style={composerPreviewImageStyle} />
      // Browser-owned preview URL; no public storage URL is generated.
      // eslint-disable-next-line @next/next/no-img-element
      : <img src={url} alt={`Selected preview ${index + 1}`} style={composerPreviewImageStyle} />)}
    <span style={composerPreviewCounterStyle}>{index + 1} of {count} · ×</span>
    {file.type.startsWith('video/') && <span className={styles.videoBadge}>Video</span>}
  </button>;
}

export default function GroupPostComposer({ profile,
  groupName, avatarPath,
  content, setContent, files, setFiles, busy, onPublish }: {
  userId: string; profile: PostProfile | null;
  groupName: string; avatarPath: string | null;
  content: string; setContent: (value: string) => void;
  files: File[]; setFiles: (files: File[]) => void; busy: boolean; onPublish: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState('');
  const firstName = (profile?.full_name || profile?.username || 'there').trim().split(' ')[0];
  return <form data-posting className={`${styles.posting} ${styles.composer}`} style={composerCardStyle}
    onSubmit={event => { event.preventDefault(); if (!busy) onPublish(); }} aria-label="Create a Group post">
    <PostComposerInput className={styles.composerTop}
      avatar={<GroupAvatarView path={avatarPath} name={groupName} size={48} />}
      inputProps={{ value: content, onChange: event => setContent(event.target.value), maxLength: 5000,
        placeholder: `What's on your mind, ${firstName}?`, 'aria-label': 'Write a Group post' }}
      onSelectMedia={() => input.current?.click()} mediaLabel="Upload photos or videos" disabled={busy} />
    <p className={styles.characterCounter} aria-live="polite">
      {(5000 - content.length).toLocaleString()} characters remaining
    </p>
    <input ref={input} hidden type="file" multiple disabled={busy}
      accept="image/jpeg,image/png,image/webp,video/mp4,video/webm"
      onChange={event => {
        const selected = Array.from(event.target.files ?? []);
        event.target.value = '';
        if (!selected.length) return;
        try {
          const next = [...files, ...selected];
          if (next.length > 4) throw new Error('Choose up to four files. Remove an attachment to add another.');
          selected.forEach(file => validateUpload(file.type, file.size));
          setFiles(next); setError('');
        } catch (err) { setError(err instanceof Error ? err.message : 'Invalid media'); }
      }} />
    {files.length > 0 && <div className={styles.previewWrap} style={imagePreviewWrapStyle}>
      <div className={styles.previewGrid} style={{ ...composerPreviewGridStyle, ...(files.length === 1 ? composerPreviewSingleGridStyle : {}) }}>
        {files.map((file, index) => <Preview key={`${file.name}-${file.lastModified}-${index}`} file={file}
          count={files.length} index={index} disabled={busy} onRemove={() => setFiles(files.filter((_, i) => i !== index))} />)}
      </div>
      <div className={styles.previewMeta}><span>{files.length} of 4 selected</span>
        <button type="button" disabled={busy} onClick={() => setFiles([])}>Remove media</button></div>
    </div>}
    {error && <p role="alert">{error}</p>}
    <div className={styles.composerFooter} style={composerFooterStyle}>
      <span className={styles.composerHint}>{files.length?`${files.length} of 4 attachments`:"Text, photos or videos"}</span>
      <button type="submit" style={{
        ...publishButtonStyle,
        padding: '8px 12px',
        minHeight: 44,
        width: 'auto',
        maxWidth: '100%',
        flexShrink: 0,
        borderRadius: 999,
        fontSize: 'clamp(12px, 1vw + 8px, 13px)',
        fontWeight: 600,
        lineHeight: 1.2,
        whiteSpace: 'nowrap'
      }} disabled={busy || (!content.trim() && !files.length)}>
        {busy ? 'Publishing…' : 'Publish post'}
      </button>
    </div>
  </form>;
}
