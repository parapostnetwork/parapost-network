import { createClient } from '@supabase/supabase-js';
import {
  requireCreatorVerseOwner,
  creatorVerseErrorResponse,
  creatorVerseHeaders,
} from '@/lib/creatorverse/server';
import { CreatorVerseError } from '@/lib/creatorverse/permissions';
import { pageId } from '@/lib/creatorverse/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function pageImageCancellationApproved(): boolean {
  // Remains locked until the staging cleanup lifecycle is ready.
  return false;
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
    if (!pageImageCancellationApproved()) {
      throw new CreatorVerseError(
        503,
        'Page image cancellation is not enabled yet.'
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
      throw new CreatorVerseError(
        401,
        'Sign in to continue.'
      );
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !key) {
      throw new CreatorVerseError(
        503,
        'Image cancellation is not configured.'
      );
    }

    const admin = createClient(url, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });

    // The database function enforces ownership again,
    // checks pending status and invalidates the reservation.
    const { data, error } = await admin.rpc(
      'creatorverse_cancel_page_media',
      {
        p_page_id: id,
        p_media_id: mediaId,
        p_owner_id: userId,
      }
    );

    if (error) {
      throw new CreatorVerseError(
        503,
        'Unable to cancel the pending page image.'
      );
    }

    if (data !== true) {
      throw new CreatorVerseError(
        409,
        'This image is no longer available for cancellation.'
      );
    }

    return Response.json(
      {
        media: {
          id: mediaId,
          verification: 'rejected',
        },
      },
      { headers: creatorVerseHeaders }
    );
  } catch (error) {
    return creatorVerseErrorResponse(error);
  }
}
