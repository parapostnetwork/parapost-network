'use client';

import { useEffect, useRef, useState } from 'react';
import PostComposerInput, { PhotoIcon } from '@/components/PostComposerInput';
import { composerCardStyle, composerActionPillStyle, composerFooterStyle, publishButtonStyle,
  imagePreviewWrapStyle, composerPreviewGridStyle, composerPreviewSingleGridStyle,
  composerPreviewTileStyle, composerPreviewSingleTileStyle, composerPreviewImageStyle,
  composerPreviewCounterStyle } from '@/components/postPresentation';
import { validateUpload } from '@/lib/groups/validation';
import { PostAvatar, type PostProfile } from './PostIdentity';
import styles from './groupPosting.module.css';

function Preview({ file, index, count, disabled, onRemove }: {
  file: File; index: number; count: number; disabled: boolean; onRemove: () => void;
}) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    const src = URL.createObjectURL(file);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- browser-owned object URL, revoked on cleanup
    setUrl(src);
    return () => URL.revokeObjectURL(src);
  }, [file]);
  return <button type="button" className={styles.previewTile} disabled={disabled}
    style={{ ...composerPreviewTileStyle, ...(count === 1 ? composerPreviewSingleTileStyle : {}) }}
    onClick={onRemove} aria-label={`Remove selected media ${index + 1}: ${file.name}`}>
    {url && (file.type.startsWith('video/')
      ? <video src={url} muted playsInline preload="metadata" style={composerPreviewImageStyle} />
      // Browser-owned preview URL; no public storage URL is generated.
      // eslint-disable-next-line @next/next/no-img-element
      : <img src={url} alt={`Selected preview ${index + 1}`} style={composerPreviewImageStyle} />)}
    <span style={composerPreviewCounterStyle}>{index + 1} of {count} · ×</span>
    {file.type.startsWith('video/') && <span className={styles.videoBadge}>Video</span>}
  </button>;
}

export default function GroupPostComposer({ userId, profile, content, setContent, files, setFiles, busy, onPublish }: {
  userId: string; profile: PostProfile | null; content: string; setContent: (value: string) => void;
  files: File[]; setFiles: (files: File[]) => void; busy: boolean; onPublish: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState('');
  const firstName = (profile?.full_name || profile?.username || 'there').trim().split(' ')[0];
  return <form data-posting className={`${styles.posting} ${styles.composer}`} style={composerCardStyle}
    onSubmit={event => { event.preventDefault(); if (!busy) onPublish(); }} aria-label="Create a Group post">
    <PostComposerInput className={styles.composerTop}
      avatar={<PostAvatar id={userId} profile={profile} size={48} />}
      inputProps={{ value: content, onChange: event => setContent(event.target.value), maxLength: 10000,
        placeholder: `What's on your mind, ${firstName}?`, 'aria-label': 'Write a Group post' }}
      onSelectMedia={() => input.current?.click()} mediaLabel="Upload photos or videos" disabled={busy} />
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
    <div className={styles.composerActions}>
      <button type="button" style={composerActionPillStyle} disabled={busy} onClick={() => input.current?.click()}>
        <PhotoIcon /> Photos / Videos
      </button>
      <span>Up to 4 files · Images 8 MB · Videos 32 MB</span>
    </div>
    {error && <p role="alert">{error}</p>}
    <div className={styles.composerFooter} style={composerFooterStyle}>
      <button type="submit" style={publishButtonStyle} disabled={busy || (!content.trim() && !files.length)}>
        {busy ? 'Publishing…' : 'Publish post'}
      </button>
    </div>
  </form>;
}
