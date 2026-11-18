'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useGroupSession } from '@/lib/groups/useGroupSession';
import { usePublicRead } from '@/lib/creatorverse/usePublicRead';
import {
  submitCreatorVerseInteraction,
  CreatorVerseInteractionError,
  type CreatorVerseSocialRequest,
  type CreatorVerseSocialAction
} from '@/lib/creatorverse/social-client';
import { HeartIcon, CommentIcon, ShareIcon } from '@/components/PostActionIcons';
import styles from './CreatorVersePostActions.module.css';

type Comment = {
  id: string;
  author_id: string;
  post_id: string;
  parent_id: string | null;
  content: string;
  created_at: string;
};

type Engagement = {
  like_count: number;
  comment_count: number;
  share_count: number;
  liked_by_me: boolean;
  comments: Comment[];
};

type Props = {
  pageId: string;
  postId: string;
  commentsEnabled: boolean;
};

const stagingSocialReady =
  process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, '') ===
    'https://vmgelrgrtpghmvqgufzz.supabase.co' &&
  process.env.NEXT_PUBLIC_CREATORVERSE_SOCIAL_UI_ENABLED === 'true';

export default function CreatorVersePostActions(props: Props) {
  const session = useGroupSession();
  if (!stagingSocialReady || !session.ready) return null;

  // Reset drafts and pending actions on identity/source changes, not token refreshes.
  return <ViewerPostActions key={`${props.pageId}:${props.postId}:${session.userId}`}
    {...props} viewerId={session.userId} />;
}

function ViewerPostActions({ pageId, postId, commentsEnabled, viewerId }:
  Props & { viewerId: string }) {
  const read = usePublicRead<Engagement>(
    `/api/creatorverse/${encodeURIComponent(pageId)}/posts/${encodeURIComponent(postId)}/interactions`
  );
  const engagement = read.data;
  const active = useRef(true);
  const sending = useRef(false);
  const pending = useRef<CreatorVerseSocialRequest | null>(null);
  const [retryPending, setRetryPending] = useState(false);
  useEffect(() => {
    active.current = true;
    return () => { active.current = false; };
  }, []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [comment, setComment] = useState('');
  const [shareCaption, setShareCaption] = useState('');
  const [showComments, setShowComments] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [replyTo, setReplyTo] = useState<string | null>(null);

  async function act(
    action: CreatorVerseSocialAction,
    content = '',
    targetId: string | null = null
  ) {
    if (sending.current || !viewerId) return;
    // An uncertain result must be retried with the same payload and request ID.
    if (pending.current && (pending.current.action !== action ||
        pending.current.content !== content || pending.current.targetId !== targetId)) {
      setError('Retry the previous action before sending another.');
      return;
    }
    const request = pending.current ?? {
      pageId, postId, action, content, targetId, requestId: crypto.randomUUID(),
    };
    pending.current = request;
    sending.current = true;
    setBusy(true);
    setError('');

    try {
      await submitCreatorVerseInteraction(request, viewerId);
      if (!active.current) return;
      pending.current = null;
      setRetryPending(false);

      // A failed count refresh must never make a successful write look unsent.
      if (action === 'comment') {
        setComment('');
        setReplyTo(null);
        setShowComments(true);
      }
      if (action === 'share') {
        window.dispatchEvent(new Event('parapost-creatorverse-shared'));
        setShareCaption('');
        setShowShare(false);
      }
      read.retry();
    } catch (failure) {
      if (!active.current) return;
      if (failure instanceof CreatorVerseInteractionError && !failure.uncertain) {
        pending.current = null;
      }
      setRetryPending(pending.current !== null);
      setError(failure instanceof Error ? failure.message : 'Unable to complete this action.');
    } finally {
      sending.current = false;
      if (active.current) setBusy(false);
    }
  }

  const comments = engagement?.comments ?? [];

  return (
    <section className={styles.section} aria-label="Post interactions">

      <div
        aria-live="polite"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-start',
          flexWrap: 'wrap',
          gap: 12,
          padding: '8px 0',
          fontSize: 13
        }}
      >
        <span>
          {engagement
            ? `${engagement.like_count} ${engagement.like_count === 1 ? 'Like' : 'Likes'}`
            : 'Likes'}
        </span>

        <span style={{ marginLeft: 'auto' }}>
          {engagement
            ? `${engagement.comment_count} ${engagement.comment_count === 1 ? 'Comment' : 'Comments'}`
            : 'Comments'}
        </span>

        <span>
          {engagement
            ? `${engagement.share_count} ${engagement.share_count === 1 ? 'Share' : 'Shares'}`
            : 'Shares'}
        </span>
      </div>

      <div className={styles.actions}>

        <button
          type="button"
          disabled={busy || retryPending || read.loading || !engagement || !viewerId}
          aria-label={engagement?.liked_by_me ? 'Unlike post' : 'Like post'}
          aria-pressed={engagement?.liked_by_me ?? false}
          onClick={() =>
            void act(engagement?.liked_by_me ? 'unlike' : 'like')
          }
        >
          <HeartIcon filled={engagement?.liked_by_me ?? false} />
        </button>

        {commentsEnabled && (
          <button
            type="button"
            disabled={busy || retryPending}
            aria-label="Comments"
            aria-expanded={showComments}
            onClick={() => setShowComments(value => !value)}
          >
            <CommentIcon />
          </button>
        )}

        <button
          type="button"
          disabled={busy || retryPending || read.loading || !engagement || !viewerId}
          aria-label="Share post"
          aria-expanded={showShare}
          onClick={() => setShowShare(value => !value)}
        >
          <ShareIcon />
        </button>

      </div>

      {showComments && commentsEnabled && (

        <div className={styles.panel}>

          {comments.map(item => (

            <div className={styles.comment} key={item.id}>

              <div className={styles.commentHeading}>

                <Link href={`/profile/${encodeURIComponent(item.author_id)}`}>
                  Member profile
                </Link>

                <time dateTime={item.created_at}>
                  {new Date(item.created_at).toLocaleString()}
                </time>

              </div>

              {item.parent_id && (
                <span className={styles.replyLabel}>Reply</span>
              )}

              <p>{item.content}</p>

              {viewerId && (
                <button
                  type="button"
                  disabled={busy || retryPending}
                  onClick={() => {
                    setReplyTo(item.parent_id ?? item.id);
                    setComment('');
                  }}
                >
                  Reply
                </button>
              )}

              {viewerId === item.author_id && (

                <button
                  type="button"
                  disabled={busy || retryPending}
                  onClick={() =>
                    void act('delete_comment', '', item.id)
                  }
                >
                  Delete
                </button>

              )}

            </div>

          ))}

          {viewerId && (
            <>
              <label htmlFor={`cv-comment-${postId}`}>
                {replyTo ? 'Write a reply' : 'Write a comment'}
              </label>

              <textarea
                id={`cv-comment-${postId}`}
                maxLength={1200}
                rows={3}
                value={comment}
                placeholder="Write a comment..."
                onChange={event => setComment(event.target.value)}
                disabled={busy || retryPending}
              />

              <div className={styles.controls}>

                {replyTo && (
                  <button
                    type="button"
                    onClick={() => setReplyTo(null)}
                  >
                    Cancel reply
                  </button>
                )}

                <button
                  type="button"
                  disabled={busy || retryPending || read.loading || !engagement || !comment.trim()}
                  onClick={() =>
                    void act('comment', comment.trim(), replyTo)
                  }
                >
                  {busy ? 'Sending...' : 'Post comment'}
                </button>

              </div>
            </>
          )}

        </div>
      )}

      {showShare && viewerId && (

        <div className={styles.panel}>

          <label htmlFor={`cv-share-${postId}`}>
            Add a caption (optional)
          </label>

          <textarea
            id={`cv-share-${postId}`}
            rows={2}
            maxLength={1000}
            value={shareCaption}
            onChange={event => setShareCaption(event.target.value)}
            disabled={busy || retryPending}
          />

          <div className={styles.controls}>

            <button
              type="button"
              onClick={() => setShowShare(false)}
            >
              Cancel
            </button>

            <button
              type="button"
              disabled={busy || retryPending}
              onClick={() =>
                void act('share', shareCaption.trim())
              }
            >
              {busy ? 'Sharing...' : 'Share post'}
            </button>

          </div>

        </div>

      )}

      {read.loading && <p role="status">Loading interactions…</p>}
      {read.error && (
        <div role="alert" className={styles.error}>
          <p>Post interactions could not be loaded. Please try again.</p>
          <button type="button" disabled={busy} onClick={read.retry}>Retry loading</button>
        </div>
      )}
      {retryPending && (
        <div className={styles.panel}>
          <p>The previous action could not be confirmed. Retry it before sending another.</p>
          <button type="button" disabled={busy} onClick={() => {
            const request = pending.current;
            if (request) void act(request.action, request.content, request.targetId);
          }}>Retry action</button>
        </div>
      )}
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

    </section>
  );
}
