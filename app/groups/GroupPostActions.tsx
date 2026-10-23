'use client';

import { type FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { HeartIcon, CommentIcon } from '@/components/PostActionIcons';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import styles from './groups.module.css';
import type { GroupsTransport } from '@/lib/groups/transport';

type GroupComment = {
  id: string;
  author_id: string;
  parent_id: string | null;
  content: string;
  created_at: string;
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
  canInteract: boolean;
  canShare: boolean;
  read: GroupsTransport['read'];
  action: GroupsTransport['action'];
};

export default function GroupPostActions({
  groupId, postId, canInteract, canShare, read, action
}: Props) {
  const marker = useRef<HTMLDivElement>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [shareNotice, setShareNotice] = useState('');
  const [authorNames, setAuthorNames] = useState<Record<string,string>>({});


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
      .select('id,full_name,username')
      .in('id',ids)
      .then(({data,error}) => {
        if (!active || error) return;
        setAuthorNames(Object.fromEntries(
          (data ?? []).map(profile => [
            profile.id,
            profile.full_name?.trim() ||
            profile.username?.trim() || 'Member'
          ])
        ));
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
        post_id: postId
      });

      if (!result || typeof result.id !== 'string') {
        throw new Error('Share was not confirmed');
      }

      setShareNotice('Shared to Dashboard and your Profile.');
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

  return (
    <div ref={marker} className={styles.groupPostActions}>
      <button type="button" className={styles.groupActionButton}
        disabled={!canInteract || !stats || busy}
        aria-pressed={stats?.liked ?? false}
        onClick={() => void toggleLike()}>
        <HeartIcon filled={stats?.liked ?? false}/>
        {' '}{stats ? `${stats.like_count} ${stats.liked ? 'Liked' : 'Like'}` : 'Like'}
      </button>
      <button
        type="button" className={styles.groupActionButton}
        disabled={!stats}
        aria-expanded={commentsOpen}
        aria-controls={`group-comments-${postId}`}
        onClick={() => setCommentsOpen(open => !open)}
      >
        <CommentIcon/>
        {' '}{stats ? stats.comment_count : '—'} Comments
      </button>
        {canShare && (
          <button
            type="button"
            className={styles.groupActionButton}
            disabled={busy}
            onClick={() => void submitShare()}
            aria-label="Share Group post to Dashboard and your Profile"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M12 16V3"/>
              <path d="m7 8 5-5 5 5"/>
              <path d="M4 14v5a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5"/>
            </svg>
            Share
          </button>
        )}
        {shareNotice && (
          <p role="status" className={styles.groupShareNotice}>
            {shareNotice}
          </p>
        )}


      {commentsOpen && (
        <section
          className={styles.groupCommentsPanel}
          id={`group-comments-${postId}`}
          aria-label="Group post comments"
        >
          <div className={styles.groupCommentThread}>
            {!stats?.comments.length && <p>No comments yet.</p>}
            {stats?.comments.filter(c => !c.parent_id).map(parent => (
              <div key={parent.id} className={styles.groupComment}>
                <Link href={`/profile/${parent.author_id}`}>{authorNames[parent.author_id] ?? 'Member'}</Link>
                <p>{parent.content}</p>
                <time dateTime={parent.created_at}>
                  {new Date(parent.created_at).toLocaleString()}
                </time>
                <button
                  type="button"
                  className={styles.groupCommentAction}
                  disabled={!canInteract || busy}
                  aria-pressed={parent.liked}
                  aria-label={parent.liked ? 'Unlike comment' : 'Like comment'}
                  onClick={() => void toggleCommentLike(parent)}
                >
                  <HeartIcon filled={parent.liked}/>
                  {' '}{parent.like_count} {parent.liked ? 'Liked' : 'Like'}
                </button>
                {canInteract && (
                  <button type="button" className={styles.groupCommentAction} disabled={busy} onClick={() => setReplyTo(parent.id)}>
                    Reply
                  </button>
                )}
                {stats.comments.filter(c => c.parent_id === parent.id)
                  .map(reply => (
                    <div key={reply.id} className={styles.groupReply}>
                      <Link href={`/profile/${reply.author_id}`}>{authorNames[reply.author_id] ?? 'Member'}</Link>
                      <p>{reply.content}</p>
                      <time dateTime={reply.created_at}>
                        {new Date(reply.created_at).toLocaleString()}
                      </time>
                      <button
                        type="button"
                        className={styles.groupCommentAction}
                        disabled={!canInteract || busy}
                        aria-pressed={reply.liked}
                        aria-label={reply.liked ? 'Unlike reply' : 'Like reply'}
                        onClick={() => void toggleCommentLike(reply)}
                      >
                        <HeartIcon filled={reply.liked}/>
                        {' '}{reply.like_count} {reply.liked ? 'Liked' : 'Like'}
                      </button>
                    </div>
                  ))}
              </div>
            ))}
            {stats?.comments_limited && (
              <p>Showing the first 100 comments.</p>
            )}
          </div>
          <form onSubmit={submitComment}>
            {replyTo && (
              <p>
                Replying to a comment
                {' '}
                <button type="button" onClick={() => setReplyTo(null)}>
                  Cancel reply
                </button>
              </p>
            )}
            <label htmlFor={`group-comment-input-${postId}`}>
              {replyTo ? 'Write a reply' : 'Write a comment'}
            </label>
            <textarea
              id={`group-comment-input-${postId}`}
              value={draft}
              onChange={event => setDraft(event.target.value)}
              maxLength={1200}
              rows={2}
              disabled={!canInteract || busy}
            />
            <button
              type="submit"
              disabled={!canInteract || busy || !draft.trim()}
            >
              {busy ? 'Posting…' : replyTo ? 'Post reply' : 'Post comment'}
            </button>
          </form>
        </section>
      )}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
