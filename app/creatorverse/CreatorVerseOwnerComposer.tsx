'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import PostComposerInput from '@/components/PostComposerInput';
import {
  composerCardStyle,
  composerFooterStyle,
  publishButtonStyle,
} from '@/components/postPresentation';
import styles from './CreatorVersePosting.module.css';

type PostResponse = {
  error?: string;
  post?: { id?: string };
};

async function sendPost(
  path: string,
  token: string,
  content?: string
): Promise<PostResponse> {
  const response = await fetch(path, {
    method: 'POST',
    cache: 'no-store',
    headers: {
      Authorization: `Bearer ${token}`,
      ...(content === undefined
        ? {}
        : { 'Content-Type': 'application/json' }),
    },
    ...(content === undefined
      ? {}
      : { body: JSON.stringify({ content }) }),
  });

  const result = await response.json().catch(
    () => ({}) as PostResponse
  ) as PostResponse;

  if (!response.ok) {
    throw new Error(
      typeof result.error === 'string'
        ? result.error
        : 'Unable to complete your post.'
    );
  }

  return result;
}

/**
 * Authenticated API-based composer.
 * Not mounted or enabled until staging backend approval.
 * Server authorization is required independently.
 */
export default function CreatorVerseOwnerComposer({
  pageId,
  pageName,
  onPublished,
}: {
  pageId: string;
  pageName: string;
  onPublished?: () => void;
}) {
  const [content, setContent] = useState('');
  const [pending, setPending] = useState<{
    id: string;
    content: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function publish() {
    const text = content.trim();

    if (busy || !text || text.length > 5000) return;

    setBusy(true);
    setError('');

    try {
      const { data, error: authError } =
        await supabase.auth.getSession();

      const token = data.session?.access_token;

      if (authError || !token) {
        throw new Error('Sign in to publish a page post.');
      }

      const base =
        `/api/creatorverse/${encodeURIComponent(pageId)}`;

      let draft =
        pending?.content === text ? pending : null;

      if (!draft) {
        const result = await sendPost(
          `${base}/posts/draft`,
          token,
          text
        );

        const id = result.post?.id;

        if (
          typeof id !== 'string' ||
          !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)
        ) {
          throw new Error('The saved post could not be verified.');
        }

        draft = { id, content: text };
        setPending(draft);
      }

      await sendPost(
        `${base}/posts/${encodeURIComponent(draft.id)}/publish`,
        token
      );

      setContent('');
      setPending(null);
      onPublished?.();
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : 'Unable to publish. Your text was preserved.'
      );
    } finally {
      setBusy(false);
    }
  }

  const avatar = (
    <span className={styles.avatar}>
      <span aria-hidden="true">
        {pageName.trim().charAt(0).toUpperCase() || 'C'}
      </span>
    </span>
  );

  return (
    <section
      aria-label="Create a CreatorVerse post"
      className={styles.composer}
      style={composerCardStyle}
    >
      <PostComposerInput
        className={styles.composerRow}
        avatar={avatar}
        disabled={busy}
        showMediaButton={false}
        onSelectMedia={() => {}}
        inputProps={{
          value: content,
          maxLength: 5000,
          'aria-label': `Write a post as ${pageName}`,
          placeholder: `What's on your mind, ${pageName}?`,
          onChange: event => {
            const next = event.target.value;
            setContent(next);
            if (pending?.content !== next.trim()) {
              setPending(null);
            }
          },
        }}
      />

      {error && (
        <p role="alert" className={styles.error}>{error}</p>
      )}

      <div style={composerFooterStyle}>
        <span className={styles.note}>
          {content.length}/5000
        </span>

        <button
          type="button"
          style={publishButtonStyle}
          disabled={busy || !content.trim()}
          onClick={() => void publish()}
        >
          {busy ? 'Publishing…' : 'Publish Post'}
        </button>
      </div>
    </section>
  );
}
