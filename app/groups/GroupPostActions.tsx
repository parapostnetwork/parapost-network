'use client';

import { type FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { HeartIcon, CommentIcon, ShareIcon } from '@/components/PostActionIcons';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import styles from './groupPosting.module.css';
import { PostAvatar, profileName, type PostProfile } from './PostIdentity';
import { dashboardCommentTextareaStyle, dashboardCommentSubmitButtonStyle, dashboardCommentRowStyle, dashboardCommentBubbleStyle, dashboardCommentTopLineStyle, dashboardCommentAuthorStyle, dashboardCommentTimeStyle, dashboardCommentTextStyle } from '@/components/postPresentation';
import type { GroupsTransport } from '@/lib/groups/transport';

type GroupComment = {
  id: string;
  author_id: string;
  parent_id: string | null;
  content: string;
  created_at: string;
  updated_at?: string | null;
  like_count: number;
  liked: boolean;
};

type Stats = {
  comments: GroupComment[];
  comments_limited: boolean;
  liked: boolean;
  like_count: number;
  comment_count: number;
};

type Props = {
  groupId: string;
  postId: string;
  viewerId: string;
  ownerId: string;
  canInteract: boolean;
  canShare: boolean;
  read: GroupsTransport['read'];
  action: GroupsTransport['action'];
};

export default function GroupPostActions({
  groupId, postId, viewerId, ownerId, canInteract, canShare, read, action
}: Props) {
  const marker = useRef<HTMLDivElement>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [shareNotice, setShareNotice] = useState('');
  const [profiles, setProfiles] = useState<Record<string,PostProfile>>({});
  const [shareOpen, setShareOpen] = useState(false);
  const [caption, setCaption] = useState('');


  const reload = useCallback(async () => {
    const url = `/api/groups?kind=interactions&group=${groupId}&post=${postId}`;
    const response = await read(url);
    const data = await response.json() as Stats;
    if (typeof data.like_count !== 'number' ||
        typeof data.comment_count !== 'number' || !Array.isArray(data.comments)) {
      throw new Error('Invalid interaction response');
    }
    setStats(data);
    setError('');
  }, [groupId, postId, read]);

  useEffect(() => {
    const element = marker.current;
    if (!element) return;
    let active = true;
    const observer = new IntersectionObserver(entries => {
      if (!entries[0]?.isIntersecting) return;
      observer.disconnect();
      void reload().catch(() => {
        if (active) setError('Unable to load reactions.');
      });
    }, { rootMargin: '200px' });
    observer.observe(element);
    return () => { active = false; observer.disconnect(); };
  }, [reload]);

  async function toggleLike() {
    if (!canInteract || !stats || busy) return;
    setBusy(true);
    try {
      await action(stats.liked ? 'unlike' : 'like', groupId, {
        post_id: postId
      });
      await reload();
    } catch {
      setError('Unable to update Like. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function toggleCommentLike(comment: GroupComment) {
    if (!canInteract || !stats || busy) return;
    setBusy(true);
    setError('');
    try {
      await action(
        comment.liked ? 'unlike_comment' : 'like_comment',
        groupId,
        {
          post_id: postId,
          parent_id: comment.id
        }
      );
      await reload();
    } catch {
      setError('Unable to update comment Like. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!commentsOpen || !stats?.comments.length) return;
    let active = true;
    const ids = [...new Set(stats.comments.map(c => c.author_id))];
    void supabase.from('profiles')
      .select('id,full_name,username,avatar_url')
      .in('id',ids)
      .then(({data,error}) => {
        if (!active || error) return;
        setProfiles(Object.fromEntries((data ?? []).map(profile => [profile.id, profile])));
      });
    return () => { active = false; };
  }, [commentsOpen, stats?.comments]);

  async function submitShare() {
    if (!canShare || busy) return;

    setBusy(true);
    setError('');
    setShareNotice('');

    try {
      const result = await action('share_post', groupId, {
        post_id: postId, caption: caption.trim() || null
      });

      if (!result || typeof result.id !== 'string') {
        throw new Error('Share was not confirmed');
      }

      setShareNotice('Shared to Dashboard and your Profile.');
      setShareOpen(false); setCaption('');
    } catch {
      setError('Unable to share this Group post. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function submitComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const content = draft.trim();
    if (!canInteract || busy || !content || content.length > 1200) return;
    setBusy(true);
    setError('');
    try {
      await action(replyTo ? 'reply' : 'comment', groupId, {
        post_id: postId,
        content,
        ...(replyTo ? { parent_id: replyTo } : {})
      });
      setDraft('');
      setReplyTo(null);
      await reload();
    } catch {
      setError('Unable to post your comment. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function manageComment(
    comment: GroupComment,
    mode: 'edit_comment' | 'delete_comment'
  ) {
    if (!canInteract || busy) return;

    const isAuthor = comment.author_id === viewerId;
    const isOwner = viewerId === ownerId;

    if (mode === 'edit_comment' && !isAuthor) return;
    if (mode === 'delete_comment' && !isAuthor && !isOwner) return;

    const content = editDraft.trim();

    if (mode === 'edit_comment' &&
        (!content || content.length > 1200)) {
      setError('Comments must contain 1 to 1200 characters.');
      return;
    }

    if (mode === 'delete_comment') {
      const message = comment.parent_id
        ? 'Delete this reply permanently?'
        : 'Delete this comment and all its replies permanently?';

      if (!window.confirm(message)) return;
    }

    setBusy(true);
    setError('');

    try {
      await action(mode, groupId, {
        post_id: postId,
        comment_id: comment.id,
        ...(mode === 'edit_comment' ? { content } : {})
      });

      setEditingId(null);
      setEditDraft('');

      if (mode === 'delete_comment' &&
          replyTo === comment.id) {
        setReplyTo(null);
        setDraft('');
      }

      await reload();
    } catch {
      setError(
        mode === 'edit_comment'
          ? 'Unable to edit comment.'
          : 'Unable to delete comment.'
      );
    } finally {
      setBusy(false);
    }
  }

  const commentForm = (parentId: string | null) => (
    <form className={styles.commentForm} onSubmit={submitComment}>
      <textarea id={`group-comment-input-${postId}-${parentId || 'new'}`}
        aria-label={parentId ? 'Write a reply' : 'Write a comment'}
        placeholder={parentId ? 'Write a reply...' : 'Write a comment...'}
        value={draft} onChange={event => setDraft(event.target.value)} maxLength={1200}
        rows={2} disabled={!canInteract || busy} style={dashboardCommentTextareaStyle} autoFocus={!!parentId} />
      <button type="submit" style={dashboardCommentSubmitButtonStyle}
        disabled={!canInteract || busy || !draft.trim()}>{busy ? 'Posting…' : parentId ? 'Reply' : 'Post'}</button>
    </form>
  );
  const renderComment = (comment: GroupComment) => (
    <div style={dashboardCommentRowStyle}>
      <PostAvatar id={comment.author_id} profile={profiles[comment.author_id]} size={32} />
      <div className={styles.commentBody}>
        <div style={dashboardCommentBubbleStyle}>
          <div className={styles.commentTop} style={dashboardCommentTopLineStyle}>
            <Link href={`/profile/${comment.author_id}`} style={dashboardCommentAuthorStyle}>{profileName(profiles[comment.author_id])}</Link>
            <time dateTime={comment.created_at} style={dashboardCommentTimeStyle}>{new Date(comment.created_at).toLocaleString()}</time>
          </div>
          {editingId === comment.id ? (
              <form className={styles.editForm}
                onSubmit={event => {
                  event.preventDefault();
                  void manageComment(comment, 'edit_comment');
                }}>
                <textarea
                  aria-label="Edit comment"
                  value={editDraft}
                  maxLength={1200}
                  rows={2}
                  disabled={busy}
                  onChange={event => setEditDraft(event.target.value)}
                />
                <button type="submit"
                  disabled={busy || !editDraft.trim()}>
                  Save
                </button>
                <button type="button" disabled={busy}
                  onClick={() => {
                    setEditingId(null);
                    setEditDraft('');
                  }}>
                  Cancel
                </button>
              </form>
            ) : (
              <div style={dashboardCommentTextStyle}>
                {comment.content}
                {comment.updated_at &&
                  new Date(comment.updated_at).getTime() >
                  new Date(comment.created_at).getTime() + 1500 &&
                  <small> · Edited</small>}
              </div>
            )}
        </div>
        <div className={styles.commentActions}>
          <button type="button" className={styles.commentAction} disabled={!canInteract || busy}
            aria-pressed={comment.liked} aria-label={comment.liked ? 'Unlike comment' : 'Like comment'}
            onClick={() => void toggleCommentLike(comment)}>
            <HeartIcon filled={comment.liked} /> {comment.liked ? 'Liked' : 'Like'}{comment.like_count > 0 ? ` · ${comment.like_count}` : ''}
          </button>
          {!comment.parent_id && canInteract && <button type="button" className={styles.commentAction} disabled={busy}
            onClick={() => { setReplyTo(comment.id); setDraft(''); }}>Reply</button>}
            {canInteract && comment.author_id === viewerId &&
              <button type="button" className={styles.commentAction}
                disabled={busy}
                onClick={() => {
                  setEditingId(comment.id);
                  setEditDraft(comment.content);
                }}>
                Edit
              </button>}
            {canInteract &&
              (comment.author_id === viewerId || viewerId === ownerId) &&
              <button type="button" className={styles.commentAction}
                disabled={busy}
                onClick={() => void manageComment(comment, 'delete_comment')}>
                Delete
              </button>}
        </div>
      </div>
    </div>
  );

  return <div ref={marker}>
    <div className={styles.stats} aria-live="polite">
      <span>{stats ? `${stats.like_count} ${stats.like_count === 1 ? 'Like' : 'Likes'}` : 'Loading reactions…'}</span>
      <button type="button" disabled={!stats} onClick={() => setCommentsOpen(open => !open)}>
        {stats ? `${stats.comment_count} ${stats.comment_count === 1 ? 'Comment' : 'Comments'}` : 'Comments'}
      </button>
    </div>
    <div className={styles.actions} data-private={!canShare}>
      <button type="button" className={styles.action} disabled={!canInteract || !stats || busy}
        aria-label={stats?.liked ? 'Unlike post' : 'Like post'} aria-pressed={stats?.liked ?? false} onClick={() => void toggleLike()}>
        <HeartIcon filled={stats?.liked ?? false} />
      </button>
      <button type="button" className={styles.action} disabled={!stats} aria-expanded={commentsOpen}
        aria-label={commentsOpen ? 'Hide comments' : 'Show comments'} aria-controls={`group-comments-${postId}`} onClick={() => setCommentsOpen(open => !open)}>
        <CommentIcon />
      </button>
      {canShare && <button type="button" className={styles.action} disabled={busy} aria-expanded={shareOpen}
        onClick={() => setShareOpen(open => !open)} aria-label="Share Group post to Dashboard and your Profile">
        <ShareIcon />
      </button>}
    </div>
    {canShare && shareOpen && <section className={styles.comments} aria-label="Share Group post">
      <div className={styles.commentsHeader}><h3>Share to Dashboard and your Profile</h3>
        <button type="button" className={styles.textButton} disabled={busy} onClick={() => setShareOpen(false)}>Cancel</button></div>
      <form className={styles.commentForm} onSubmit={event => { event.preventDefault(); void submitShare(); }}>
        <textarea aria-label="Share caption" placeholder="Say something about this..." value={caption}
          onChange={event => setCaption(event.target.value)} maxLength={1000} rows={2}
          disabled={busy} style={dashboardCommentTextareaStyle} />
        <button type="submit" disabled={busy} style={dashboardCommentSubmitButtonStyle}>{busy ? 'Sharing…' : 'Share post'}</button>
      </form>
    </section>}
    {shareNotice && <p role="status" className={styles.notice}>{shareNotice}</p>}
    {commentsOpen && <section className={styles.comments} id={`group-comments-${postId}`} aria-label="Group post comments">
      <div className={styles.commentsHeader}><h3>Comments</h3>
        <button type="button" className={styles.textButton} onClick={() => setCommentsOpen(false)}>Hide</button></div>
      {canInteract ? !replyTo && commentForm(null) : <p className={styles.empty}>Join this Group to comment.</p>}
      <div className={styles.thread}>
        {!stats?.comments.length && <p className={styles.empty}>No comments yet. Start the conversation.</p>}
        {stats?.comments.filter(comment => !comment.parent_id).map(parent => <div key={parent.id}>
          {renderComment(parent)}
          <div className={styles.replies}>
            {stats.comments.filter(comment => comment.parent_id === parent.id).map(reply => <div key={reply.id}>{renderComment(reply)}</div>)}
            {replyTo === parent.id && <div>
              <div className={styles.replyLabel}>Replying to {profileName(profiles[parent.author_id])}
                <button type="button" className={styles.textButton} disabled={busy} onClick={() => { setReplyTo(null); setDraft(''); }}>Cancel</button></div>
              {commentForm(parent.id)}
            </div>}
          </div>
        </div>)}
        {stats?.comments_limited && <p className={styles.empty}>Showing the first 100 comments.</p>}
      </div>
    </section>}
    {error && <p role="alert" className={styles.error}>{error}{' '}
      <button type="button" className={styles.textButton} disabled={busy} onClick={() => void reload().catch(() => setError('Unable to load reactions.'))}>Refresh reactions</button></p>}
  </div>;
}
