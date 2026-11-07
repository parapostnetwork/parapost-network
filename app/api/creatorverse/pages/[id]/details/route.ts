import {
  creatorVerseClient,
  creatorVerseErrorResponse,
  creatorVerseHeaders,
} from '@/lib/creatorverse/server';
import { CreatorVerseError } from '@/lib/creatorverse/permissions';
import {
  pageId,
  validatePageFields,
} from '@/lib/creatorverse/validation';

export const dynamic = 'force-dynamic';

const editable = new Set([
  'name',
  'category',
  'short_bio',
  'description',
  'website',
  'public_email',
  'location',
  'social_links',
]);

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const id = pageId((await context.params).id);

    if (!request.headers.get('content-type')
      ?.toLowerCase().startsWith('application/json')) {
      throw new CreatorVerseError(
        415, 'JSON request required.'
      );
    }

    const raw = await request.text();

    if (new TextEncoder().encode(raw).byteLength > 65536) {
      throw new CreatorVerseError(
        413, 'Page information is too large.'
      );
    }

    const input: unknown = JSON.parse(raw);

    if (
      !input ||
      typeof input !== 'object' ||
      Array.isArray(input)
    ) {
      throw new CreatorVerseError(400, 'Invalid page details.');
    }

    const record = input as Record<string, unknown>;
    const keys = Object.keys(record);

    if (
      keys.length !== editable.size ||
      keys.some(key => !editable.has(key))
    ) {
      throw new CreatorVerseError(
        400, 'Only approved page information can be edited.'
      );
    }

    const fields = validatePageFields(input);
    const { client, userId } = await creatorVerseClient(request);

    if (!userId) {
      throw new CreatorVerseError(401, 'Sign in to continue.');
    }

    const permission = await client.rpc(
      'creatorverse_details_can_edit',
      { p_page_id: id }
    );

    if (permission.error) {
      throw new CreatorVerseError(
        503, 'Editing permissions are unavailable.'
      );
    }

    if (permission.data !== true) {
      throw new CreatorVerseError(
        403, 'Page editing is not permitted.'
      );
    }

    const result = await client.rpc(
      'creatorverse_update_page_profile',
      {
        p_page_id: id,
        p_name: fields.name,
        p_category: fields.category,
        p_short_bio: fields.short_bio,
        p_description: fields.description,
        p_website: fields.website,
        p_public_email: fields.public_email,
        p_location: fields.location,
        p_social_links: fields.social_links,
      }
    );

    if (result.error) {
      if (result.error.code === '42501') {
        throw new CreatorVerseError(
          403, 'Page editing is not permitted.'
        );
      }

      if (
        ['23514', '23502', '22023'].includes(result.error.code)
      ) {
        throw new CreatorVerseError(
          400, 'Invalid page information.'
        );
      }

      throw new CreatorVerseError(
        503, 'Unable to save page information.'
      );
    }

    if (result.data !== id) {
      throw new CreatorVerseError(
        503, 'Page update could not be verified.'
      );
    }

    return Response.json(
      { page: { id: result.data } },
      { headers: creatorVerseHeaders }
    );
  } catch (error) {
    return creatorVerseErrorResponse(error);
  }
}
