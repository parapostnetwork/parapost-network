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

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function mediaVerificationApproved(): boolean {
  // Keep disabled until staging security tests are complete.
  return false;
}

type RouteContext = {
  params: Promise<{
    id: string;
    postId: string;
    mediaId: string;
  }>;
};

const extensions: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
};

export async function POST(
  request: Request,
  context: RouteContext
): Promise<Response> {
  try {
    if (!mediaVerificationApproved()) {
      throw new CreatorVerseError(
        503, 'Media verification is not enabled yet.'
      );
    }

    const params = await context.params;
    const validatedPageId = pageId(params.id);
    const validatedPostId = pageId(params.postId);
    const validatedMediaId = pageId(params.mediaId);

    const { userId } = await requireCreatorVerseOwner(
      request, validatedPageId
    );

    if (!userId) {
      throw new CreatorVerseError(401, 'Sign in to continue.');
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !key) {
      throw new CreatorVerseError(
        503, 'Media verification is not configured.'
      );
    }

    // Server-only privileged client. Never expose its key.
    const admin = createClient(url, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });

    const { data: post, error: postError } = await admin
      .from('creatorverse_posts')
      .select('id,page_id,author_id,status')
      .eq('id', validatedPostId)
      .eq('page_id', validatedPageId)
      .eq('author_id', userId)
      .eq('status', 'draft')
      .maybeSingle();

    if (postError || !post) {
      throw new CreatorVerseError(
        403, 'Owned draft post not found.'
      );
    }

    // IMPORTANT: One literal select string for Supabase types.
    const { data: media, error: mediaError } = await admin
      .from('creatorverse_media')
      .select('id,page_id,post_id,purpose,storage_path,mime_type,media_type,verification')
      .eq('id', validatedMediaId)
      .eq('page_id', validatedPageId)
      .eq('post_id', validatedPostId)
      .eq('purpose', 'post')
      .eq('verification', 'pending')
      .maybeSingle();

    if (mediaError || !media) {
      throw new CreatorVerseError(
        404, 'Pending media reservation not found.'
      );
    }

    const extension = extensions[media.mime_type];
    const expectedType = media.mime_type.startsWith('image/')
      ? 'image'
      : 'video';

    const expectedPath =
      `${validatedPageId}/${validatedPostId}/` +
      `${validatedMediaId}.${extension}`;

    if (
      !extension ||
      media.media_type !== expectedType ||
      media.storage_path !== expectedPath
    ) {
      throw new CreatorVerseError(
        400, 'Invalid reserved media record.'
      );
    }

    // Download using the path from the database only.
    const { data: blob, error: downloadError } =
      await admin.storage
        .from('creatorverse-media')
        .download(media.storage_path);

    if (downloadError || !blob) {
      throw new CreatorVerseError(
        404, 'Uploaded media is unavailable.'
      );
    }

    const maximumBytes =
      expectedType === 'image' ? 8388608 : 33554432;

    if (
      !Number.isSafeInteger(blob.size) ||
      blob.size < 16 ||
      blob.size > maximumBytes
    ) {
      throw new CreatorVerseError(
        400, 'Uploaded media exceeds its size limits.'
      );
    }

    let inspected;

    try {
      inspected = await inspectCreatorVerseMediaBlob(
        blob, media.mime_type, 120
      );
    } catch {
      throw new CreatorVerseError(
        422, 'Media failed trusted file inspection.'
      );
    }

    if (
      inspected.mimeType !== media.mime_type ||
      inspected.kind !== expectedType
    ) {
      throw new CreatorVerseError(
        422, 'Verified media type mismatch.'
      );
    }

    // Recheck authorization after file inspection.
    const currentOwner = await requireCreatorVerseOwner(
      request, validatedPageId
    );

    if (currentOwner.userId !== userId) {
      throw new CreatorVerseError(
        403, 'Page ownership has changed.'
      );
    }

    const { data: currentPost, error: currentPostError } =
      await admin
        .from('creatorverse_posts')
        .select('id')
        .eq('id', validatedPostId)
        .eq('page_id', validatedPageId)
        .eq('author_id', userId)
        .eq('status', 'draft')
        .maybeSingle();

    if (currentPostError || !currentPost) {
      throw new CreatorVerseError(
        403, 'Draft is no longer eligible.'
      );
    }

    const { data: finalized, error: finalizeError } =
      await admin.rpc('creatorverse_finalize_post_media', {
        p_media_id: validatedMediaId,
        p_verified_bytes: blob.size,
        p_detected_mime_type: inspected.mimeType,
        p_verified_duration_seconds:
          inspected.kind === 'video'
            ? inspected.durationSeconds
            : null,
      });

    if (finalizeError || finalized !== true) {
      throw new CreatorVerseError(
        409, 'Media finalization was not confirmed.'
      );
    }

    return Response.json(
      {
        media: {
          id: validatedMediaId,
          verification: 'verified',
        },
      },
      { status: 200, headers: creatorVerseHeaders }
    );
  } catch (error) {
    return creatorVerseErrorResponse(error);
  }
}
