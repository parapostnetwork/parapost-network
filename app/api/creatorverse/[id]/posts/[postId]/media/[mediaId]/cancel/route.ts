import 'server-only';

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

function mediaCancellationApproved(): boolean {
  // Must remain disabled until staging lifecycle testing.
  return false;
}

type RouteContext = {
  params: Promise<{
    id: string;
    postId: string;
    mediaId: string;
  }>;
};

export async function POST(
  request: Request,
  context: RouteContext
): Promise<Response> {
  try {
    if (!mediaCancellationApproved()) {
      throw new CreatorVerseError(
        503, 'Media cancellation is not enabled yet.'
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
        503, 'Media cancellation is not configured.'
      );
    }

    // Privileged credentials stay on the server.
    const admin = createClient(url, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });

    // Future database RPC — NOT installed or enabled yet.
    //
    // The RPC must atomically:
    // - lock the media row;
    // - confirm page.owner_id and post.author_id match
    //   p_owner_id;
    // - confirm the post is still a draft;
    // - confirm media belongs to this page and post;
    // - change only pending media to rejected;
    // - refuse verified or already-published media.
    //
    // SECURITY INVOKER; EXECUTE for service_role only.
    // No direct service-role table update from this route.
    const { data: cancelled, error: cancelError } =
      await admin.rpc('creatorverse_cancel_post_media', {
        p_page_id: validatedPageId,
        p_post_id: validatedPostId,
        p_media_id: validatedMediaId,
        p_owner_id: userId,
      });

    if (cancelError || cancelled !== true) {
      throw new CreatorVerseError(
        409, 'Pending media could not be cancelled.'
      );
    }

    // No storage deletion here: an in-flight upload could
    // finish later. Rejected records must be retained until
    // deferred storage cleanup is safely completed.
    //
    // Rejected records still occupy their display_order
    // until the planned database index change is approved.

    return Response.json(
      {
        media: {
          id: validatedMediaId,
          verification: 'rejected',
          cleanup: 'pending',
        },
      },
      { status: 200, headers: creatorVerseHeaders }
    );
  } catch (error) {
    return creatorVerseErrorResponse(error);
  }
}
