'use client';

import { useEffect, useRef, useState } from 'react';
import PostComposerInput from '@/components/PostComposerInput';
import { composerCardStyle, composerActionPillStyle, composerFooterStyle, publishButtonStyle,
  postCardStyle, postHeaderStyle, postAuthorStyle, postAuthorNameStyle, postMetaStyle } from '@/components/postPresentation';
import CreatorVerseLocalPostMenu from './CreatorVerseLocalPostMenu';
import CreatorVerseLocalPostActions from './CreatorVerseLocalPostActions';
import CreatorVersePostMedia, { type LocalAttachment } from './CreatorVersePostMedia';
import { saveLocalMedia, loadLocalMedia, deleteLocalMedia } from './creatorVerseLocalMedia';
import { localPostKey, readLocalPosts, writeLocalPosts, localPreviewCanManage, validateLocalAttachment,
  MAX_LOCAL_ATTACHMENTS, type LocalPostRecord, type LocalPreviewRole } from './creatorVerseLocalPosts';
import styles from './CreatorVersePosting.module.css';

type LocalPost = LocalPostRecord & { attachments: LocalAttachment[]; mediaError?: boolean };
/** Local simulation only. This component never calls CreatorVerse APIs or Supabase. */
export default function CreatorVersePostComposer({ pageName = 'CreatorVerse Page', avatarUrl,
  previewRole = 'visitor', pageHref = '/groups-local-preview/creatorverse/draft' }: {
  pageName?: string; avatarUrl?: string | null; previewRole?: LocalPreviewRole; pageHref?: string;
}) {
  const canManage = localPreviewCanManage(previewRole, process.env.NODE_ENV);
  const [content, setContent] = useState('');
  const [attachments, setAttachments] = useState<LocalAttachment[]>([]);
  const [posts, setPosts] = useState<LocalPost[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const urls = useRef(new Set<string>());
  const busy = useRef(false);
  const permitted = useRef(false);
  const key = localPostKey(pageName);
  // Event handlers and pending saves must also deny writes after switching to Visitor.
  useEffect(() => { permitted.current = canManage; return () => { permitted.current = false; }; }, [canManage]);
  useEffect(() => {
    let cancelled = false;
    const ownedUrls = urls.current;
    async function restore() {
      try {
        const saved = readLocalPosts(localStorage, key, pageName);
        const restored = await Promise.all(saved.posts.map(async (post): Promise<LocalPost> => {
          try {
            const media = await loadLocalMedia(`${key}:${post.id}`);
            if (cancelled) return { ...post, attachments: [] };
            if (post.attachmentCount && media.length !== post.attachmentCount) throw new Error('Missing media');
            return { ...post, attachments: media.map(item => {
              const url = URL.createObjectURL(item.blob); ownedUrls.add(url); return { ...item, url };
            }) };
          } catch {
            return { ...post, attachments: [], mediaError: true };
          }
        }));
        if (!cancelled) {
          setContent(saved.content); setPosts(restored); setReady(true);
          if (restored.some(post => post.mediaError)) setError('Some saved media could not be restored. Reload to retry. Existing saved data has been kept.');
        }
      } catch {
        if (!cancelled) setError('Saved posts could not be read. Nothing has been overwritten. Reload after checking browser storage.');
      }
    }
    void restore();
    return () => { cancelled = true; ownedUrls.forEach(url => URL.revokeObjectURL(url)); ownedUrls.clear(); };
  }, [key, pageName]);

  function persist(next: LocalPost[], draft = content) {
    writeLocalPosts(localStorage, key, draft, next);
  }
  function updateDraft(next: string) {
    if (!permitted.current || !ready || busy.current) return;
    setContent(next);
    try { persist(posts, next); setError(''); } catch { setError('Your draft could not be saved in this browser. Keep a copy before refreshing.'); }
  }
  function addFiles(files: FileList | null) {
    if (!permitted.current || !ready || busy.current || !files) return;
    try {
      if (attachments.length + files.length > MAX_LOCAL_ATTACHMENTS) throw new Error('Choose up to 4 attachments per post.');
      const validated = Array.from(files).map(file => ({ file, kind: validateLocalAttachment(file) }));
      const next = validated.map(({ file, kind }) => {
        const url = URL.createObjectURL(file); urls.current.add(url);
        return { name: file.name, kind, blob: file, url };
      });
      setAttachments(previous => [...previous, ...next]); setError('');
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Unable to select media.'); }
  }
  function removeFile(index: number) {
    if (!permitted.current || busy.current) return;
    URL.revokeObjectURL(attachments[index].url); urls.current.delete(attachments[index].url);
    setAttachments(previous => previous.filter((_, i) => i !== index));
  }
  async function createPost() {
    if (!permitted.current || !ready || busy.current || (!content.trim() && !attachments.length)) return;
    busy.current = true; setSaving(true); setError('');
    const id = `local-${crypto.randomUUID()}`;
    const mediaKey = `${key}:${id}`;
    try {
      await saveLocalMedia(mediaKey, attachments.map(item => ({ name: item.name, kind: item.kind, blob: item.blob! })));
      if (!permitted.current) { await deleteLocalMedia(mediaKey); return; }
      const post: LocalPost = { id, content: content.trim(), createdAt: new Date().toISOString(), attachmentCount: attachments.length, attachments };
      const next = [post, ...posts];
      persist(next, ''); // Failure leaves the draft and attachments intact.
      setPosts(next); setContent(''); setAttachments([]);
    } catch {
      try { await deleteLocalMedia(mediaKey); } catch { /* An unreferenced blob is safer than losing an existing post. */ }
      setError('The local post could not be saved. Your draft and selected media are still here; check browser storage and retry.');
    } finally { busy.current = false; setSaving(false); }
  }
  function editPost(id: string, text: string) {
    if (!permitted.current || !ready || busy.current) return false;
    const post = posts.find(item => item.id === id);
    if (!post || post.mediaError || (!text.trim() && !post.attachments.length) || text.length > 5000) return false;
    try { const next = posts.map(item => item.id === id ? { ...item, content: text.trim() } : item);
      persist(next); setPosts(next); setError(''); return true;
    } catch { setError('The edit could not be saved. The original post has been kept.'); return false; }
  }
  function deletePost(id: string) {
    if (!permitted.current || !ready || busy.current) return;
    const post = posts.find(item => item.id === id);
    try {
      const next = posts.filter(item => item.id !== id); persist(next); setPosts(next); setError('');
      post?.attachments.forEach(item => { URL.revokeObjectURL(item.url); urls.current.delete(item.url); });
      void deleteLocalMedia(`${key}:${id}`).catch(() => setError('Post removed. Its unused media could not be cleared from this browser.'));
    } catch { setError('The deletion could not be saved. The original post has been kept.'); }
  }
  const avatar = <span className={styles.avatar}>
    {avatarUrl
      // eslint-disable-next-line @next/next/no-img-element
      ? <img src={avatarUrl} alt={`${pageName} avatar`} /> : <span aria-hidden="true">{pageName.trim()[0]?.toUpperCase() || 'C'}</span>}
  </span>;
  if (process.env.NODE_ENV !== 'development') return null;
  return <div className={styles.root}>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {!ready && !error && <p role="status">Restoring local posts…</p>}
    {canManage && <section aria-label="Create a local page post" className={styles.composer} style={composerCardStyle}>
      <PostComposerInput className={styles.composerRow} avatar={avatar} disabled={!ready || saving}
        inputProps={{ value: content, onChange: event => updateDraft(event.target.value),
          'aria-label': `Write a post as ${pageName}`, placeholder: `What's on your mind, ${pageName}?`, maxLength: 5000 }}
        onSelectMedia={() => fileInput.current?.click()} mediaLabel="Add photos or videos" />
      <input ref={fileInput} type="file" hidden multiple accept="image/jpeg,image/png,image/webp,video/mp4,video/webm"
        disabled={!ready || saving} onChange={event => { addFiles(event.target.files); event.target.value = ''; }} />
      <CreatorVersePostMedia attachments={attachments} onRemove={removeFile} disabled={saving} />
      <div style={composerFooterStyle}>
        <button type="button" style={composerActionPillStyle} disabled={!ready || saving} onClick={() => fileInput.current?.click()}>Photos / Videos</button>
        <span className={styles.note}>{content.length}/5000 · {attachments.length}/4 media</span>
        <button type="button" style={publishButtonStyle} disabled={!ready || saving || (!content.trim() && !attachments.length)}
          onClick={() => void createPost()}>{saving ? 'Saving…' : 'Add Local Post'}</button>
      </div>
      <p className={styles.note}>Posting as {pageName}. Local preview only; live publishing is locked. JPEG, PNG, WebP up to 8 MB; MP4, WebM up to 32 MB. Selected media is saved when you add the local post.</p>
    </section>}
    <div className={styles.posts}>
      {posts.map(post => <article key={post.id} id={post.id} aria-label={`${pageName} local post`} className={styles.postCard} style={postCardStyle}>
        <header style={{ ...postHeaderStyle, paddingRight: 36 }}><div style={postAuthorStyle}>{avatar}<div style={{ minWidth: 0 }}>
          <a href={pageHref} style={postAuthorNameStyle}>{pageName}</a>
          <div style={postMetaStyle}>{post.createdAt ? <time dateTime={post.createdAt}>{new Date(post.createdAt).toLocaleString()}</time> : 'Saved local post'}</div>
        </div></div></header>
        <p className={styles.note}>LOCAL TEST POST — NOT PUBLISHED</p>
        <CreatorVerseLocalPostMenu content={post.content} hasAttachments={post.attachments.length > 0 || !!post.mediaError}
          canManage={canManage && !saving && !post.mediaError} onSave={text => editPost(post.id, text)} onDelete={() => deletePost(post.id)} />
        {post.mediaError && <p role="status" className={styles.error}>Saved media is unavailable. Reload to retry before editing this post.</p>}
        <CreatorVersePostMedia attachments={post.attachments} />
        <CreatorVerseLocalPostActions pageName={pageName} postId={post.id} postText={post.content} pageHref={pageHref} ownerPreview={canManage} attachments={post.attachments} />
      </article>)}
    </div>
  </div>;
}
