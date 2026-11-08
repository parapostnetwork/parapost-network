'use client';

import { supabase } from '@/lib/supabase';
import {
  uploadCreatorVersePostMedia,
} from './post-media-client';

export type VerifiedCreatorVerseMedia = {
  mediaId: string;
  verification: 'verified';
};

/**
 * Upload and verify selected attachments sequentially.
 * Existing server and client safety locks remain authoritative.
 *
 * A failed verification never silently publishes a post.
 * The draft and its pending media remain available for
 * controlled recovery or deferred cleanup.
 */
export async function uploadAndVerifyCreatorVerseMedia(
  pageId: string,
  postId: string,
  files: readonly File[]
): Promise<VerifiedCreatorVerseMedia[]> {
  if (files.length > 4) {
    throw new Error('Select no more than four attachments.');
  }

  if (files.length === 0) {
    return [];
  }

  const { data, error } = await supabase.auth.getSession();

  const token = data.session?.access_token;

  if (error || !token) {
    throw new Error('Sign in to upload photos or videos.');
  }

  const verified: VerifiedCreatorVerseMedia[] = [];

  for (const [index, file] of files.entries()) {
    const pending = await uploadCreatorVersePostMedia(
      pageId,
      postId,
      file,
      index
    );

    const response = await fetch(
      `/api/creatorverse/${encodeURIComponent(pageId)}` +
      `/posts/${encodeURIComponent(postId)}` +
      `/media/${encodeURIComponent(pending.mediaId)}/verify`,
      {
        method: 'POST',
        cache: 'no-store',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    if (!response.ok) {
      throw new Error(
        `Attachment ${index + 1} could not be verified. ` +
        'The post has not been published.'
      );
    }

    const body: unknown = await response.json();

    if (
      !body ||
      typeof body !== 'object' ||
      !('media' in body)
    ) {
      throw new Error('Invalid media verification response.');
    }

    const media = body.media;

    if (
      !media ||
      typeof media !== 'object' ||
      !('id' in media) ||
      !('verification' in media) ||
      media.id !== pending.mediaId ||
      media.verification !== 'verified'
    ) {
      throw new Error('Media verification was not confirmed.');
    }

    verified.push({
      mediaId: pending.mediaId,
      verification: 'verified',
    });
  }

  return verified;
}
