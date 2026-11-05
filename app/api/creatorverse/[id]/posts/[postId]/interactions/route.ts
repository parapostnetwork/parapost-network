import {
  creatorVerseClient,
  creatorVerseErrorResponse,
  creatorVerseHeaders,
} from '@/lib/creatorverse/server';
import { CreatorVerseError } from '@/lib/creatorverse/permissions';
import { pageId } from '@/lib/creatorverse/validation';

import { handleCreatorVerseInteraction } from '@/lib/creatorverse/social-interactions';

export const dynamic = 'force-dynamic';

export async function POST(
  request: Request,
  context: {
    params: Promise<{ id: string; postId: string }>;
  }
) {
  const { id, postId } = await context.params;

  return handleCreatorVerseInteraction(
    request,
    id,
    postId
  );
}


export async function GET(
  request: Request,
  context: {
    params: Promise<{ id: string; postId: string }>;
  }
) {
  try {
    const { id, postId } = await context.params;
    const page = pageId(id);
    const post = pageId(postId);

    const { client } = await creatorVerseClient(request);

    const { data, error } = await client.rpc(
      'creatorverse_post_engagement',
      {
        p_page_id: page,
        p_post_id: post,
      }
    );

    if (error) {
      throw new CreatorVerseError(
        503,
        'Post engagement is unavailable.'
      );
    }

    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw new CreatorVerseError(404, 'Post unavailable.');
    }

    return Response.json(data, {
      headers: creatorVerseHeaders,
    });
  } catch (error) {
    return creatorVerseErrorResponse(error);
  }
}
