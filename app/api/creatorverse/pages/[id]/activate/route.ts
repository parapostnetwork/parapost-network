import {
  creatorVerseClient,
  creatorVerseErrorResponse,
  creatorVerseHeaders,
} from '@/lib/creatorverse/server';
import { CreatorVerseError } from '@/lib/creatorverse/permissions';
import { pageId } from '@/lib/creatorverse/validation';

export const dynamic = 'force-dynamic';

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const id = pageId((await context.params).id);

    const { client, userId } =
      await creatorVerseClient(request);

    if (!userId) {
      throw new CreatorVerseError(
        401,
        'Sign in to activate your page.'
      );
    }

    const { data, error } = await client.rpc(
      'creatorverse_activate_page_draft',
      { p_page_id: id }
    );

    if (error || data !== id) {
      throw new CreatorVerseError(
        503,
        'Page activation is not enabled yet.'
      );
    }

    return Response.json(
      { page: { id, status: 'active' } },
      { headers: creatorVerseHeaders }
    );
  } catch (error) {
    return creatorVerseErrorResponse(error);
  }
}
