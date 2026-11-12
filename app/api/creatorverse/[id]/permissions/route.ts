import {
  creatorVerseClient,
  creatorVerseErrorResponse,
  creatorVerseHeaders,
  pagePermissions,
} from '@/lib/creatorverse/server';

import { CreatorVerseError } from '@/lib/creatorverse/permissions';
import { pageId } from '@/lib/creatorverse/validation';

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const id = pageId((await context.params).id);

    const { client, userId } = await creatorVerseClient(request);

    if (!userId) {
      throw new CreatorVerseError(401, 'Sign in to continue.');
    }

    const current = await pagePermissions(client, id);

    const { data, error } = await client.rpc(
      'creatorverse_details_can_edit',
      { p_page_id: id }
    );

    return Response.json(
      {
        ...current,
        can_edit_details: !error && data === true,
      },
      { headers: creatorVerseHeaders }
    );
  } catch (error) {
    return creatorVerseErrorResponse(error);
  }
}
