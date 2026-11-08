'use client';

import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import PostComposerInput from '@/components/PostComposerInput';
import CreatorVersePostMedia, {
  type LocalAttachment,
} from './CreatorVersePostMedia';
import {
  composerCardStyle,
  composerActionPillStyle,
  composerFooterStyle,
  publishButtonStyle,
} from '@/components/postPresentation';
import styles from './CreatorVersePosting.module.css';
import {
  uploadAndVerifyCreatorVerseMedia,
} from '@/lib/creatorverse/post-media-workflow';

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
  const [attachments, setAttachments] = useState<LocalAttachment[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);
  const previewUrls = useRef(new Set<string>());

  useEffect(() => {
    const ownedUrls = previewUrls.current;

    return () => {
      ownedUrls.forEach(url => URL.revokeObjectURL(url));
      ownedUrls.clear();
    };
  }, []);
  const [pending, setPending] = useState<{
    id: string;
    content: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // Prevent duplicate reservations following an uncertain upload.
  const mediaAttempted = useRef(false);
  const mediaVerified = useRef(false);

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

      if (attachments.length > 0 && !mediaVerified.current) {
        if (mediaAttempted.current) {
          throw new Error(
            'An earlier upload did not finish verification. ' +
            'Do not upload again until the draft is recovered.'
          );
        }

        const files = attachments.map(item => {
          if (!(item.blob instanceof File)) {
            throw new Error('Selected media is no longer available.');
          }
          return item.blob;
        });

        mediaAttempted.current = true;
        await uploadAndVerifyCreatorVerseMedia(
          pageId,
          draft.id,
          files
        );
        mediaVerified.current = true;
      }

      await sendPost(
        `${base}/posts/${encodeURIComponent(draft.id)}/publish`,
        token
      );

      attachments.forEach(item => {
        URL.revokeObjectURL(item.url);
        previewUrls.current.delete(item.url);
      });
      setAttachments([]);
      mediaAttempted.current = false;
      mediaVerified.current = false;
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

  function selectMedia(files: FileList | null) {
    if (busy || !files?.length) return;
    if (mediaAttempted.current) {
      setError('Refresh before changing a previously attempted upload.');
      return;
    }

    const selected = Array.from(files);
    const created: LocalAttachment[] = [];

    try {
      if (attachments.length + selected.length > 4) {
        throw new Error('Choose up to four photos or videos.');
      }

      for (const file of selected) {
        const imageTypes = [
          'image/jpeg',
          'image/png',
          'image/webp',
        ];

        const videoTypes = [
          'video/mp4',
          'video/webm',
        ];

        const isImage = imageTypes.includes(file.type);
        const isVideo = videoTypes.includes(file.type);

        if (!isImage && !isVideo) {
          throw new Error('Unsupported photo or video format.');
        }

        const limit = isImage
          ? 8 * 1024 * 1024
          : 32 * 1024 * 1024;

        if (file.size < 1 || file.size > limit) {
          throw new Error(
            isImage
              ? 'Photos must be 8 MB or smaller.'
              : 'Videos must be 32 MB or smaller.'
          );
        }

        const url = URL.createObjectURL(file);

        created.push({
          name: file.name,
          kind: isImage ? 'image' : 'video',
          url,
          blob: file,
        });
      }

      created.forEach(item => {
        previewUrls.current.add(item.url);
      });

      setAttachments(previous => [...previous, ...created]);
      setPending(null);
      setError('');
    } catch (failure) {
      created.forEach(item => {
        URL.revokeObjectURL(item.url);
      });

      setError(
        failure instanceof Error
          ? failure.message
          : 'Unable to select media.'
      );
    }
  }

  function removeMedia(index: number) {
    if (busy) return;
    if (mediaAttempted.current) {
      setError('Refresh before changing a previously attempted upload.');
      return;
    }

    const item = attachments[index];
    if (!item) return;

    URL.revokeObjectURL(item.url);
    previewUrls.current.delete(item.url);

    setAttachments(previous =>
      previous.filter((_, position) => position !== index)
    );

    setPending(null);
    setError('');
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
        showMediaButton
        mediaLabel="Add photos or videos"
        onSelectMedia={() => fileInput.current?.click()}
        inputProps={{
          value: content,
          maxLength: 5000,
          'aria-label': `Write a post as ${pageName}`,
          placeholder: `What's on your mind, ${pageName}?`,
          onChange: event => {
            if (mediaAttempted.current) {
              setError(
                'This upload has already been attempted. ' +
                'Finish or recover the current draft before editing.'
              );
              return;
            }
            const next = event.target.value;
            setContent(next);
            if (pending?.content !== next.trim()) {
              setPending(null);
            }
          },
        }}
      />

      <input
        ref={fileInput}
        type="file"
        hidden
        multiple
        accept="image/jpeg,image/png,image/webp,video/mp4,video/webm"
        disabled={busy}
        onChange={event => {
          selectMedia(event.currentTarget.files);
          event.currentTarget.value = '';
        }}
      />

      <CreatorVersePostMedia
        attachments={attachments}
        onRemove={removeMedia}
        disabled={busy}
      />

      {attachments.length > 0 && (
        <p className={styles.note} role="status">
          Media preview only. Files have not been uploaded.
          Publishing with attachments remains disabled.
        </p>
      )}

      {error && (
        <p role="alert" className={styles.error}>{error}</p>
      )}

      <div style={composerFooterStyle}>
        <button
          type="button"
          style={composerActionPillStyle}
          disabled={busy || attachments.length >= 4}
          onClick={() => fileInput.current?.click()}
        >
          Photos / Videos
        </button>
        <span className={styles.note}>
          {content.length}/5000 · {attachments.length}/4 media
        </span>

        <button
          type="button"
          style={publishButtonStyle}
          disabled={busy || !content.trim() || attachments.length > 0}
          onClick={() => void publish()}
        >
          {busy ? 'Publishing…' : 'Publish Post'}
        </button>
      </div>
    </section>
  );
}
