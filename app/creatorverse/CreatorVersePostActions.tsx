'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import {
  submitCreatorVerseInteraction,
  type CreatorVerseSocialAction
} from '@/lib/creatorverse/social-client';
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

export default function CreatorVersePostActions({
  pageId,
  postId,
  commentsEnabled
}: Props) {

  const stagingSocialReady =
    process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, '') ===
      'https://vmgelrgrtpghmvqgufzz.supabase.co' &&
    process.env.NEXT_PUBLIC_CREATORVERSE_SOCIAL_UI_ENABLED === 'true';

  const [engagement, setEngagement] = useState<Engagement | null>(null);
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [comment, setComment] = useState('');
  const [shareCaption, setShareCaption] = useState('');
  const [showComments, setShowComments] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [replyTo, setReplyTo] = useState<string | null>(null);

  const refresh = useCallback(async () => {

    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;

    setViewerId(data.session?.user?.id ?? null);

    const response = await fetch(
      `/api/creatorverse/${encodeURIComponent(pageId)}/posts/${encodeURIComponent(postId)}/interactions`,
      {
        cache: 'no-store',
        headers: token
          ? { Authorization: `Bearer ${token}` }
          : {}
      }
    );

    if (!response.ok) {
      throw new Error('Post interactions are unavailable.');
    }

    const result: unknown = await response.json();

    if (!result || typeof result !== 'object' || Array.isArray(result)) {
      throw new Error('Invalid engagement response.');
    }

    const item = result as Partial<Engagement>;

    if (!Array.isArray(item.comments)) {
      throw new Error('Invalid comments response.');
    }

    setEngagement({
      like_count: Number(item.like_count ?? 0),
      comment_count: Number(item.comment_count ?? 0),
      share_count: Number(item.share_count ?? 0),
      liked_by_me: item.liked_by_me === true,
      comments: item.comments
    });

  }, [pageId, postId]);

  useEffect(() => {
    if (!stagingSocialReady) return;

    let active = true;

    void refresh().catch(() => {
      if (active) setEngagement(null);
    });

    return () => {
      active = false;
    };
  }, [refresh, stagingSocialReady]);

  async function act(
    action: CreatorVerseSocialAction,
    content = '',
    targetId: string | null = null
  ) {

    if (busy) return;

    setBusy(true);
    setError('');

    try {

      await submitCreatorVerseInteraction({
        pageId,
        postId,
        action,
        requestId: crypto.randomUUID(),
        content,
        ...(targetId ? { targetId } : {})
      });

      await refresh();

      if (action === 'comment') {
        setComment('');
        setReplyTo(null);
        setShowComments(true);
      }

      if (action === 'share') {
        setShareCaption('');
        setShowShare(false);
      }

    } catch (failure) {

      setError(
        failure instanceof Error
          ? failure.message
          : 'Unable to complete this action.'
      );

    } finally {
      setBusy(false);
    }
  }

  const comments = engagement?.comments ?? [];

  if (!stagingSocialReady) return null;

  return (
    <section className={styles.section} aria-label="Post interactions">

      <div className={styles.actions}>

        <button
          type="button"
          disabled={busy || !viewerId}
          onClick={() =>
            void act(engagement?.liked_by_me ? 'unlike' : 'like')
          }
        >
          {engagement?.liked_by_me ? 'Unlike' : 'Like'}
          {engagement ? ` (${engagement.like_count})` : ''}
        </button>

        {commentsEnabled && (
          <button
            type="button"
            disabled={busy}
            onClick={() => setShowComments(value => !value)}
          >
            Comment
            {engagement ? ` (${engagement.comment_count})` : ''}
          </button>
        )}

        <button
          type="button"
          disabled={busy || !viewerId}
          onClick={() => setShowShare(value => !value)}
        >
          Share
          {engagement ? ` (${engagement.share_count})` : ''}
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
                  disabled={busy}
                  onClick={() => {
                    setReplyTo(item.id);
                    setComment('');
                  }}
                >
                  Reply
                </button>
              )}

              {viewerId === item.author_id && (

                <button
                  type="button"
                  disabled={busy}
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
                disabled={busy}
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
                  disabled={busy || !comment.trim()}
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
            disabled={busy}
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
              disabled={busy}
              onClick={() =>
                void act('share', shareCaption.trim())
              }
            >
              {busy ? 'Sharing...' : 'Share post'}
            </button>

          </div>

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
