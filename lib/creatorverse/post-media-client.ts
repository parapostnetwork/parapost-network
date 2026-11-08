'use client';

import { supabase } from '@/lib/supabase';

const formats = {
  'image/jpeg': { extension: 'jpg', maxBytes: 8388608 },
  'image/png': { extension: 'png', maxBytes: 8388608 },
  'image/webp': { extension: 'webp', maxBytes: 8388608 },
  'video/mp4': { extension: 'mp4', maxBytes: 33554432 },
  'video/webm': { extension: 'webm', maxBytes: 33554432 },
} as const;

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Independent client lock. Must stay disabled until
 * draft creation, media verification and failure cleanup
 * are reviewed and tested on staging.
 */
function mediaUploadClientApproved(): boolean {
  return false;
}

export type PendingCreatorVerseUpload = Readonly<{
  mediaId: string;
  storagePath: string;
  verification: 'pending';
}>;

export async function uploadCreatorVersePostMedia(
  pageIdentifier: string,
  postIdentifier: string,
  file: File,
  order: number
): Promise<PendingCreatorVerseUpload> {
  if (!mediaUploadClientApproved()) {
    throw new Error(
      'CreatorVerse media uploads are not enabled yet.'
    );
  }

  if (
    !uuidPattern.test(pageIdentifier) ||
    !uuidPattern.test(postIdentifier)
  ) {
    throw new Error('Invalid page or post identifier.');
  }

  if (!Number.isInteger(order) || order < 0 || order > 3) {
    throw new Error('Invalid attachment position.');
  }

  const format = formats[file.type as keyof typeof formats];

  if (
    !format ||
    !Number.isSafeInteger(file.size) ||
    file.size < 1 ||
    file.size > format.maxBytes
  ) {
    throw new Error('Unsupported media type or file size.');
  }

  const pageId = pageIdentifier.toLowerCase();
  const postId = postIdentifier.toLowerCase();

  const { data, error: authError } =
    await supabase.auth.getSession();

  if (authError || !data.session?.access_token) {
    throw new Error('Sign in to upload page media.');
  }

  const response = await fetch(
    `/api/creatorverse/${pageId}/posts/${postId}/media/reserve`,
    {
      method: 'POST',
      cache: 'no-store',
      headers: {
        Authorization: `Bearer ${data.session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'reserve_media',
        postId,
        mimeType: file.type,
        byteSize: file.size,
        order,
      }),
    }
  );

  if (!response.ok) {
    throw new Error(
      'Media reservation was denied. No file was uploaded.'
    );
  }

  const body: unknown = await response.json();

  const media =
    body && typeof body === 'object' && !Array.isArray(body)
      ? (body as Record<string, unknown>).media
      : null;

  if (!media || typeof media !== 'object' ||
      Array.isArray(media)) {
    throw new Error('Invalid reservation response.');
  }

  const reservation = media as Record<string, unknown>;
  const mediaId = reservation.mediaId;

  if (
    typeof mediaId !== 'string' ||
    !uuidPattern.test(mediaId)
  ) {
    throw new Error('Invalid reserved media identifier.');
  }

  const expectedPath =
    `${pageId}/${postId}/${mediaId.toLowerCase()}.${format.extension}`;

  if (
    reservation.bucket !== 'creatorverse-media' ||
    reservation.verification !== 'pending' ||
    reservation.storagePath !== expectedPath
  ) {
    throw new Error('Reserved storage location is invalid.');
  }

  const { error: uploadError } = await supabase.storage
    .from('creatorverse-media')
    .upload(expectedPath, file, {
      contentType: file.type,
      cacheControl: '0',
      upsert: false,
    });

  if (uploadError) {
    throw new Error(
      'Upload failed. The reservation may remain pending; ' +
      'cleanup is required before retrying this position.'
    );
  }

  // Upload success is NOT media verification or publication.
  return {
    mediaId: mediaId.toLowerCase(),
    storagePath: expectedPath,
    verification: 'pending',
  };
}
