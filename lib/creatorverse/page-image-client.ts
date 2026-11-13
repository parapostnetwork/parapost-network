'use client';

import { supabase } from '@/lib/supabase';
import {
  matchesPageImageSignature,
  PAGE_IMAGE_FORMATS,
} from './page-image-validation';

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function pageImageUploadsApproved(): boolean {
  // Do not unlock until SQL, RLS and cleanup are tested.
  return false;
}

export type PageImagePurpose = 'logo' | 'cover';

export async function uploadCreatorVersePageImage(
  pageIdentifier: string,
  purpose: PageImagePurpose,
  file: File
): Promise<{ mediaId: string; verification: 'verified' }> {
  if (!pageImageUploadsApproved()) {
    throw new Error('CreatorVerse page image uploads are not enabled yet.');
  }

  if (!uuidPattern.test(pageIdentifier)) {
    throw new Error('Invalid CreatorVerse page identifier.');
  }

  if (purpose !== 'logo' && purpose !== 'cover') {
    throw new Error('Invalid page image purpose.');
  }

  const format =
    PAGE_IMAGE_FORMATS[file.type as keyof typeof PAGE_IMAGE_FORMATS];

  if (
    !format ||
    !Number.isSafeInteger(file.size) ||
    file.size < 1 ||
    file.size > format.maxBytes
  ) {
    throw new Error('Unsupported image format or file size.');
  }

  const signature = new Uint8Array(
    await file.slice(0, 16).arrayBuffer()
  );

  if (!matchesPageImageSignature(file.type, signature)) {
    throw new Error('The selected file is not a valid image of that type.');
  }

  const pageId = pageIdentifier.toLowerCase();

  const { data: sessionData, error: sessionError } =
    await supabase.auth.getSession();

  const token = sessionData.session?.access_token;

  if (sessionError || !token) {
    throw new Error('Sign in to upload your page image.');
  }

  const reserveResponse = await fetch(
    `/api/creatorverse/pages/${pageId}/images/reserve`,
    {
      method: 'POST',
      cache: 'no-store',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        purpose,
        mimeType: file.type,
        byteSize: file.size,
      }),
    }
  );

  if (!reserveResponse.ok) {
    throw new Error('Page image reservation was denied.');
  }

  const result: unknown = await reserveResponse.json();

  const media =
    result && typeof result === 'object' && !Array.isArray(result)
      ? (result as Record<string, unknown>).media
      : null;

  if (!media || typeof media !== 'object' || Array.isArray(media)) {
    throw new Error('Invalid image reservation response.');
  }

  const reservation = media as Record<string, unknown>;
  const mediaId = reservation.mediaId;

  if (typeof mediaId !== 'string' || !uuidPattern.test(mediaId)) {
    throw new Error('Invalid reserved image identifier.');
  }

  const normalizedId = mediaId.toLowerCase();
  const expectedPath =
    `${pageId}/${purpose}/${normalizedId}.${format.extension}`;

  if (
    reservation.storagePath !== expectedPath ||
    reservation.bucket !== 'creatorverse-media' ||
    reservation.verification !== 'pending'
  ) {
    throw new Error('Invalid reserved image storage path.');
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
      'Image upload failed. The pending reservation requires cleanup.'
    );
  }

  const verifyResponse = await fetch(
    `/api/creatorverse/pages/${pageId}/images/${normalizedId}/verify`,
    {
      method: 'POST',
      cache: 'no-store',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  const verification: unknown =
    await verifyResponse.json().catch(() => null);

  const verifiedMedia =
    verification &&
    typeof verification === 'object' &&
    !Array.isArray(verification)
      ? (verification as Record<string, unknown>).media
      : null;

  if (
    !verifyResponse.ok ||
    !verifiedMedia ||
    typeof verifiedMedia !== 'object' ||
    Array.isArray(verifiedMedia) ||
    (verifiedMedia as Record<string, unknown>).id !== normalizedId ||
    (verifiedMedia as Record<string, unknown>).verification !== 'verified'
  ) {
    throw new Error(
      'Image uploaded but verification was not confirmed. ' +
      'The pending image requires cleanup.'
    );
  }

  return {
    mediaId: normalizedId,
    verification: 'verified',
  };
}
