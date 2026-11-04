'use client';

import { useEffect, useRef, useState } from 'react';
import { HeartIcon, CommentIcon, ShareIcon } from '@/components/PostActionIcons';
import { postStatsSummaryStyle, postActionsStyle, dashboardCommentTextareaStyle,
  dashboardCommentSubmitButtonStyle, dashboardCommentBubbleStyle, dashboardCommentTextStyle,
  dashboardCommentRowStyle, dashboardCommentTopLineStyle, dashboardCommentAuthorStyle,
  dashboardCommentTimeStyle, dashboardCommentActionRowStyle,
  sharedPostFrameStyle } from '@/components/postPresentation';
import CreatorVersePostMedia, { type LocalAttachment } from './CreatorVersePostMedia';
import { commitLocalInteraction, interactionKey, mayDeleteLocalComment, previewActor, readInteractions,
  type LocalComment, type LocalInteractionAction } from './creatorVerseLocalInteractions';
import styles from './CreatorVerseLocalPostActions.module.css';

const buttonStyle = { ...dashboardCommentSubmitButtonStyle, cursor: 'pointer' };
const fieldStyle = { ...dashboardCommentTextareaStyle, boxSizing: 'border-box' as const };

/** Development-only local adapter. Role simulation never authorizes a real request. */
export default function CreatorVerseLocalPostActions({ pageName, postId, postText, pageHref, ownerPreview = false, attachments = [] }: {
  pageName: string; postId: string; postText: string; pageHref: string; ownerPreview?: boolean; attachments?: LocalAttachment[];
}) {
  const key = interactionKey(pageName, postId);
  const actor = previewActor(ownerPreview);
  const [initial] = useState(() => {
    try { return { readable: true, data: readInteractions(localStorage.getItem(key), postId) }; }
    catch { return { readable: false, data: readInteractions(null, postId) }; }
  });
  const [data, setData] = useState(initial.data);
  const [readable, setReadable] = useState(initial.readable);
  const [error, setError] = useState(initial.readable ? '' : 'Saved interactions could not be read. Reload to retry; existing data has been kept.');
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const activeActor = useRef(actor.id);
  const [commentOpen, setCommentOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const intent = useRef<string | null>(null);
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [caption, setCaption] = useState('');
  const liked = data.likes.includes(actor.id);
  const shared = data.shares.some(share => share.actorId === actor.id);
  useEffect(() => { activeActor.current = actor.id; }, [actor.id]);
  useEffect(() => {
    function changed(event: StorageEvent) {
      if (event.key !== key) return;
      try { setData(readInteractions(event.newValue, postId)); setReadable(true); setError(''); }
      catch { setReadable(false); setError('Saved interactions could not be read. Existing data has been kept.'); }
    }
    window.addEventListener('storage', changed);
    return () => window.removeEventListener('storage', changed);
  }, [key, postId]);
  async function save(action: LocalInteractionAction) {
    if (process.env.NODE_ENV !== 'development' || !readable || inFlight.current) return false;
    inFlight.current = true; setBusy(true);
    try {
      if (!navigator.locks) throw new Error('This browser cannot safely save concurrent local interactions. Use a browser with Web Locks support.');
      const next = await navigator.locks.request(key, () => {
        if (activeActor.current !== actor.id) throw new Error('Preview identity changed. Please retry.');
        return commitLocalInteraction(localStorage, key, postId, actor, ownerPreview, action);
      });
      setData(next); setError(''); return true;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'This interaction could not be saved. Please retry.'); return false;
    } finally { inFlight.current = false; setBusy(false); }
  }
  async function submitComment() {
    if (!draft.trim()) return;
    intent.current ??= `comment-${crypto.randomUUID()}`;
    if (await save({ action: 'comment', id: intent.current, parentId: replyTo, text: draft, createdAt: new Date().toISOString() })) {
      setDraft(''); setReplyTo(null); intent.current = null;
    }
  }
  async function deleteComment(id: string) {
    if (await save({ action: 'delete_comment', id }) && replyTo === id) { setReplyTo(null); setDraft(''); intent.current = null; }
  }
  function renderComment(comment: LocalComment, reply = false) {
    return <div key={comment.id} className={reply ? styles.reply : undefined} style={dashboardCommentRowStyle}>
      <span className={styles.commentAvatar} aria-label={`${comment.authorName} avatar`}>{comment.authorName.charAt(0)}</span>
      <div style={dashboardCommentBubbleStyle}>
        <div className={styles.commentTop} style={dashboardCommentTopLineStyle}><strong style={dashboardCommentAuthorStyle}>{comment.authorName}</strong>
          <span style={dashboardCommentTimeStyle}>{comment.createdAt ? <time dateTime={comment.createdAt}>{new Date(comment.createdAt).toLocaleString()}</time> : 'Saved local comment'}</span>
        </div>
        <span className={styles.username}>@{comment.username}</span>
        <p style={dashboardCommentTextStyle}>{comment.text}</p>
        <div style={dashboardCommentActionRowStyle}>
          {!reply && <button type="button" disabled={busy || !readable} className={styles.commentDelete}
            onClick={() => { setReplyTo(comment.id); setDraft(''); intent.current = null; }}>Reply</button>}
          {mayDeleteLocalComment(comment, actor, ownerPreview) && <button type="button" disabled={busy || !readable}
            className={styles.commentDelete} aria-label={reply ? 'Delete local reply' : 'Delete local comment and replies'}
            onClick={() => void deleteComment(comment.id)}>Delete</button>}
        </div>
      </div>
    </div>;
  }
  if (process.env.NODE_ENV !== 'development') return null;
  return <div aria-busy={busy}>
    <div className={styles.cleanStats} style={postStatsSummaryStyle} aria-live="polite">
      <span>{data.likes.length} {data.likes.length === 1 ? 'Like' : 'Likes'}</span>
      <button type="button" onClick={() => setCommentOpen(value => !value)}>{data.comments.length} {data.comments.length === 1 ? 'Comment' : 'Comments'}</button>
      <span>{data.shares.length} {data.shares.length === 1 ? 'Share preview' : 'Share previews'}</span>
    </div>
    <div className={styles.actionRow} style={postActionsStyle}>
      <button type="button" className={styles.cleanAction} disabled={!readable || busy}
        aria-label={liked ? 'Unlike post' : 'Like post'} aria-pressed={liked} onClick={event => { if (event.detail < 2) void save({ action: liked ? 'unlike' : 'like' }); }}>
        <HeartIcon filled={liked} /><span>{liked ? 'Liked' : 'Like'}</span>
      </button>
      <button type="button" className={styles.cleanAction} aria-label={commentOpen ? 'Hide comments' : 'Show comments'}
        aria-expanded={commentOpen} onClick={() => setCommentOpen(value => !value)}><CommentIcon /><span>Comment</span></button>
      <button type="button" className={styles.cleanAction} disabled={!readable || busy}
        aria-label="Share CreatorVerse post to Dashboard and your Profile" aria-expanded={shareOpen}
        onClick={() => setShareOpen(value => !value)}><ShareIcon /><span>{shared ? 'Shared' : 'Share'}</span></button>
    </div>
    {commentOpen && <section aria-label="Local comments" style={{ marginTop: 16 }}>
      {!data.comments.length && <p className={styles.notice}>No comments yet. Start the conversation.</p>}
      {data.comments.filter(comment => comment.parentId === null).map(comment => <div key={comment.id}>
        {renderComment(comment)}
        {data.comments.filter(reply => reply.parentId === comment.id).map(reply => renderComment(reply, true))}
      </div>)}
      {replyTo && <p>Replying to {data.comments.find(comment => comment.id === replyTo)?.authorName ?? 'a removed comment'}. <button type="button" onClick={() => { setReplyTo(null); intent.current = null; }}>Cancel reply</button></p>}
      <label className={styles.notice}>Commenting as {actor.name} (local preview)
        <textarea style={fieldStyle} rows={2} maxLength={1200} aria-label={replyTo ? 'Write reply' : 'Write comment'} disabled={busy || !readable}
          placeholder={replyTo ? 'Write a reply…' : 'Write a comment…'} value={draft} onChange={event => { setDraft(event.target.value); intent.current = null; }} />
      </label>
      <button type="button" style={{ ...buttonStyle, marginTop: 10, minHeight: 44 }} disabled={!readable || busy || !draft.trim() || data.comments.length >= 50}
        onClick={() => void submitComment()}>{busy ? 'Saving…' : replyTo ? 'Add Reply' : 'Add Comment'}</button>
      {data.comments.length >= 50 && <p role="status">Local preview comment limit reached. Existing comments are preserved.</p>}
    </section>}
    {shareOpen && <section aria-label="Local share preview" style={sharedPostFrameStyle} onKeyDown={event => { if (event.key === 'Escape') setShareOpen(false); }}>
      <strong>Share {pageName}&apos;s post</strong><p>One shared reference appears on the main Dashboard and your Profile. Local preview only.</p>
      {shared ? <p role="status">Already shared in this local preview. No duplicate will be created.</p> : <>
        <textarea style={fieldStyle} rows={2} maxLength={1000} aria-label="Optional share caption" disabled={busy}
          placeholder="Say something…" value={caption} onChange={event => setCaption(event.target.value)} />
        <button type="button" style={{ ...buttonStyle, minHeight: 44 }} disabled={busy || !readable}
          onClick={() => { void save({ action: 'share', id: `share-${crypto.randomUUID()}`, caption, createdAt: new Date().toISOString() }).then(saved => { if (saved) setShareOpen(false); }); }}>Preview Share</button>
      </>}
      <button type="button" style={{ ...buttonStyle, minHeight: 44, margin: 8 }} onClick={() => setShareOpen(false)}>Close share preview</button>
    </section>}
    {data.shares.map(share => <div key={share.id} style={sharedPostFrameStyle}>
      <strong>LOCAL SHARE PREVIEW — NOT PUBLISHED</strong><p>One reference for Dashboard and sharer&apos;s Profile.</p>
      {share.caption && <p style={dashboardCommentTextStyle}>{share.caption}</p>}
      <p style={{ overflowWrap: 'anywhere' }}>Original post by <a href={`${pageHref}#${encodeURIComponent(postId)}`}>{pageName}</a></p>
      <p style={dashboardCommentTextStyle}>{postText || 'Media post'}</p>
      <CreatorVersePostMedia attachments={attachments} />
    </div>)}
    {error && <p role="alert">{error}</p>}
    <p className={styles.notice}>Local testing only. No real interactions, shares or notifications are sent.</p>
  </div>;
}
