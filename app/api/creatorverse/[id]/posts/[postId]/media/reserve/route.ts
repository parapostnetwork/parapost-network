import { CreatorVerseError } from '@/lib/creatorverse/permissions';
import { pageId } from '@/lib/creatorverse/validation';
import {
  parseCreatorVerseOperation,
} from '@/lib/creatorverse/integration-contract';
import {
  validateCreatorVerseMediaReservation,
} from '@/lib/creatorverse/media-reservation';
import {
  requireCreatorVerseOwner,
  creatorVerseErrorResponse,
  creatorVerseHeaders,
} from '@/lib/creatorverse/server';

export const dynamic = 'force-dynamic';

/**
 * Independent launch lock.
 * Must remain false until the complete draft,
 * upload, verification and cleanup flow is approved.
 */
function mediaReservationsApproved(): boolean {
  return false;
}

type RouteContext = {
  params: Promise<{ id: string; postId: string }>;
};

export async function POST(
  request: Request,
  context: RouteContext
): Promise<Response> {
  try {
    if (!mediaReservationsApproved()) {
      throw new CreatorVerseError(
        503,
        'CreatorVerse media uploads are not enabled yet.'
      );
    }

    const { id, postId } = await context.params;
    const validatedPageId = pageId(id);
    const validatedPostId = pageId(postId);

    const contentType =
      request.headers.get('content-type')?.split(';')[0]
        .trim().toLowerCase();

    if (contentType !== 'application/json') {
      throw new CreatorVerseError(
        415, 'JSON request required.'
      );
    }

    const raw = await request.text();

    if (raw.length > 4096) {
      throw new CreatorVerseError(
        413, 'Reservation request is too large.'
      );
    }

    let input: unknown;

    try {
      input = JSON.parse(raw);
    } catch {
      throw new CreatorVerseError(400, 'Invalid JSON.');
    }

    const operation = parseCreatorVerseOperation(input);

    if (
      operation.action !== 'reserve_media' ||
      operation.postId !== validatedPostId
    ) {
      throw new CreatorVerseError(
        400, 'Invalid media reservation request.'
      );
    }

    const { client } = await requireCreatorVerseOwner(
      request,
      validatedPageId
    );

    const mediaType = operation.mimeType.startsWith(
      'image/'
    ) ? 'image' : 'video';

    const { data, error } = await client.rpc(
      'creatorverse_reserve_post_media',
      {
        p_page_id: validatedPageId,
        p_post_id: validatedPostId,
        p_media_type: mediaType,
        p_mime_type: operation.mimeType,
        p_display_order: operation.order,
      }
    );

    if (error || !data) {
      throw new CreatorVerseError(
        403, 'Media reservation was denied.'
      );
    }

    const reservation =
      validateCreatorVerseMediaReservation(
        data,
        validatedPageId,
        validatedPostId,
        operation.mimeType
      );

    return Response.json(
      { media: reservation },
      {
        status: 201,
        headers: creatorVerseHeaders,
      }
    );
  } catch (error) {
    return creatorVerseErrorResponse(error);
  }
}
