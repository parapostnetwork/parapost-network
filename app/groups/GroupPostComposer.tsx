'use client';

import { useEffect, useRef, useState } from 'react';
import PostComposerInput from '@/components/PostComposerInput';
import { composerCardStyle, composerFooterStyle, publishButtonStyle,
  imagePreviewWrapStyle, composerPreviewGridStyle, composerPreviewSingleGridStyle,
  composerPreviewTileStyle, composerPreviewSingleTileStyle, composerPreviewImageStyle,
  composerPreviewCounterStyle } from '@/components/postPresentation';
import { validateUpload } from '@/lib/groups/validation';
import type { PostProfile } from './PostIdentity';
import type { GroupsTransport } from '@/lib/groups/transport';
import GroupCover from './GroupCover';
import styles from './groupPosting.module.css';


function GroupComposerAvatar({
  name, coverPath, read, viewerId, cacheable
}: {
  name: string;
  coverPath: string | null;
  read: GroupsTransport['read'];
  viewerId: string;
  cacheable: boolean;
}) {
  const initial = name.trim().charAt(0).toUpperCase() || 'G';

  return (
    <span
      className={styles.groupComposerAvatar}
      role="img"
      aria-label={`${name} Group`}
    >
      <span className={styles.groupComposerInitial} aria-hidden="true">
        {initial}
      </span>
      {coverPath && (
        <span aria-hidden="true" className={styles.groupComposerCover}>
          <GroupCover
            path={coverPath}
            name={name}
            load={read}
            viewerId={viewerId}
            cacheable={cacheable}
          />
        </span>
      )}
    </span>
  );
}

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

export default function GroupPostComposer({ userId, profile,
  groupName, coverPath, read, cacheable,
  content, setContent, files, setFiles, busy, onPublish }: {
  userId: string; profile: PostProfile | null;
  groupName: string; coverPath: string | null;
  read: GroupsTransport['read']; cacheable: boolean;
  content: string; setContent: (value: string) => void;
  files: File[]; setFiles: (files: File[]) => void; busy: boolean; onPublish: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState('');
  const firstName = (profile?.full_name || profile?.username || 'there').trim().split(' ')[0];
  return <form data-posting className={`${styles.posting} ${styles.composer}`} style={composerCardStyle}
    onSubmit={event => { event.preventDefault(); if (!busy) onPublish(); }} aria-label="Create a Group post">
    <PostComposerInput className={styles.composerTop}
      avatar={<GroupComposerAvatar
        name={groupName}
        coverPath={coverPath}
        read={read}
        viewerId={userId}
        cacheable={cacheable}
      />}
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
