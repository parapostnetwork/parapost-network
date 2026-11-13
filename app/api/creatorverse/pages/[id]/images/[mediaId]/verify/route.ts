import { createClient } from '@supabase/supabase-js';
import {
  requireCreatorVerseOwner,
  creatorVerseErrorResponse,
  creatorVerseHeaders,
} from '@/lib/creatorverse/server';
import { CreatorVerseError } from '@/lib/creatorverse/permissions';
import { pageId } from '@/lib/creatorverse/validation';
import {
  inspectCreatorVerseMediaBlob,
} from '@/lib/creatorverse/media-verification';
import {
  PAGE_IMAGE_FORMATS,
} from '@/lib/creatorverse/page-image-validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function pageImageVerificationApproved(): boolean {
  return (
    process.env.CREATORVERSE_PAGE_IMAGES_ENABLED === 'true' &&
    process.env.NEXT_PUBLIC_SUPABASE_URL === 'https://vmgelrgrtpghmvqgufzz.supabase.co'
  );
}

type RouteContext = {
  params: Promise<{
    id: string;
    mediaId: string;
  }>;
};

export async function POST(
  request: Request,
  context: RouteContext
): Promise<Response> {
  try {
    if (!pageImageVerificationApproved()) {
      throw new CreatorVerseError(
        503,
        'Page image verification is not enabled yet.'
      );
    }

    const params = await context.params;
    const id = pageId(params.id).toLowerCase();
    const mediaId = pageId(params.mediaId).toLowerCase();

    const { userId } = await requireCreatorVerseOwner(
      request,
      id
    );

    if (!userId) {
      throw new CreatorVerseError(401, 'Sign in to continue.');
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !key) {
      throw new CreatorVerseError(
        503,
        'Page image verification is not configured.'
      );
    }

    const admin = createClient(url, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });

    const { data: ownerPage, error: pageError } = await admin
      .from('creatorverse_pages')
      .select('id,owner_id,status')
      .eq('id', id)
      .eq('owner_id', userId)
      .in('status', ['draft', 'active'])
      .maybeSingle();

    if (pageError || !ownerPage) {
      throw new CreatorVerseError(
        403,
        'Owned CreatorVerse page unavailable.'
      );
    }

    const { data: media, error: mediaError } = await admin
      .from('creatorverse_media')
      .select('id,page_id,post_id,purpose,storage_path,mime_type,media_type,verification')
      .eq('id', mediaId)
      .eq('page_id', id)
      .eq('verification', 'pending')
      .maybeSingle();

    if (
      mediaError ||
      !media ||
      media.post_id !== null ||
      media.media_type !== 'image' ||
      (media.purpose !== 'logo' && media.purpose !== 'cover')
    ) {
      throw new CreatorVerseError(
        404,
        'Pending page image not found.'
      );
    }

    const format = PAGE_IMAGE_FORMATS[
      media.mime_type as keyof typeof PAGE_IMAGE_FORMATS
    ];

    if (!format) {
      throw new CreatorVerseError(
        400,
        'Unsupported reserved image format.'
      );
    }

    const expectedPath =
      `${id}/${media.purpose}/${mediaId}.${format.extension}`;

    if (media.storage_path !== expectedPath) {
      throw new CreatorVerseError(
        400,
        'Invalid reserved image location.'
      );
    }

    const { data: blob, error: downloadError } =
      await admin.storage
        .from('creatorverse-media')
        .download(expectedPath);

    if (
      downloadError ||
      !blob ||
      !Number.isSafeInteger(blob.size) ||
      blob.size < 16 ||
      blob.size > format.maxBytes
    ) {
      throw new CreatorVerseError(
        400,
        'Uploaded image is unavailable or invalid.'
      );
    }

    let inspected;

    try {
      inspected = await inspectCreatorVerseMediaBlob(
        blob,
        media.mime_type,
        120
      );
    } catch {
      throw new CreatorVerseError(
        422,
        'Image failed trusted file inspection.'
      );
    }

    if (
      inspected.kind !== 'image' ||
      inspected.mimeType !== media.mime_type
    ) {
      throw new CreatorVerseError(
        422,
        'Image verification failed.'
      );
    }

    const currentOwner = await requireCreatorVerseOwner(
      request,
      id
    );

    if (currentOwner.userId !== userId) {
      throw new CreatorVerseError(
        403,
        'Page ownership has changed.'
      );
    }

    const { data: finalized, error: finalizeError } =
      await admin.rpc('creatorverse_finalize_page_media', {
        p_media_id: mediaId,
        p_verified_bytes: blob.size,
        p_detected_mime_type: inspected.mimeType,
      });

    if (finalizeError || finalized !== true) {
      throw new CreatorVerseError(
        409,
        'Page image finalization was not confirmed.'
      );
    }

    return Response.json(
      {
        media: {
          id: mediaId,
          purpose: media.purpose,
          verification: 'verified',
        },
      },
      {
        status: 200,
        headers: creatorVerseHeaders,
      }
    );
  } catch (error) {
    return creatorVerseErrorResponse(error);
  }
}
