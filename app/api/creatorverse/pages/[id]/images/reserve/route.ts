import { CreatorVerseError } from '@/lib/creatorverse/permissions';
import { pageId } from '@/lib/creatorverse/validation';
import {
  validatePageImageRequest,
  PAGE_IMAGE_FORMATS,
} from '@/lib/creatorverse/page-image-validation';
import {
  requireCreatorVerseOwner,
  creatorVerseErrorResponse,
} from '@/lib/creatorverse/server';

export const dynamic = 'force-dynamic';

/**
 * Fail-closed launch gate.
 * Do not enable until server-side reservation,
 * byte verification, attachment and cleanup are complete.
 */
const PAGE_IMAGE_RESERVATIONS_ENABLED = (
    process.env.CREATORVERSE_PAGE_IMAGES_ENABLED === 'true' &&
    process.env.NEXT_PUBLIC_SUPABASE_URL === 'https://vmgelrgrtpghmvqgufzz.supabase.co'
);

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(
  request: Request,
  context: RouteContext
): Promise<Response> {
  try {
    const id = pageId((await context.params).id);

    const contentType = request.headers
      .get('content-type')
      ?.split(';')[0]
      .trim()
      .toLowerCase();

    if (contentType !== 'application/json') {
      throw new CreatorVerseError(
        415,
        'JSON request required.'
      );
    }

    const raw = await request.text();

    if (raw.length > 4096) {
      throw new CreatorVerseError(
        413,
        'Image request too large.'
      );
    }

    let input: unknown;

    try {
      input = JSON.parse(raw);
    } catch {
      throw new CreatorVerseError(
        400,
        'Invalid JSON.'
      );
    }

    const image = validatePageImageRequest(input);

    const { client } = await requireCreatorVerseOwner(
      request,
      id
    );

    if (!PAGE_IMAGE_RESERVATIONS_ENABLED) {
      throw new CreatorVerseError(
        503,
        'CreatorVerse profile and cover uploads are not enabled yet.'
      );
    }

    const { data, error } = await client.rpc(
      'creatorverse_reserve_page_media',
      {
        p_page_id: id,
        p_purpose: image.purpose,
        p_mime_type: image.mimeType,
        p_byte_size: image.byteSize,
      }
    );

    if (error || !data) {
      throw new CreatorVerseError(
        403,
        'Page image reservation was denied.'
      );
    }

    const reservation = data as Record<string, unknown>;

    const mediaId = reservation.media_id;

    if (
      typeof mediaId !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(mediaId)
    ) {
      throw new CreatorVerseError(
        503,
        'Invalid reserved media identifier.'
      );
    }

    const extension = PAGE_IMAGE_FORMATS[image.mimeType].extension;

    const expectedPath =
      `${id.toLowerCase()}/${image.purpose}/${mediaId.toLowerCase()}.${extension}`;

    if (
      reservation.verification !== 'pending' ||
      reservation.storage_path !== expectedPath
    ) {
      throw new CreatorVerseError(
        503,
        'Invalid reserved storage location.'
      );
    }

    return Response.json(
      {
        media: {
          mediaId: mediaId.toLowerCase(),
          storagePath: expectedPath,
          bucket: 'creatorverse-media',
          verification: 'pending',
        },
      },
      { status: 201 }
    );
  } catch (error) {
    return creatorVerseErrorResponse(error);
  }
}
