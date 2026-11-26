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

    const targetId = new URL(request.url).searchParams.get('comment');
    if (targetId) {
      const comment = pageId(targetId);
      const current = Array.isArray(data.comments) ? data.comments : [];
      if (!current.some((row: { id: string }) => row.id === comment)) {
        const target = await client.rpc('parapost_mention_comment_thread', {
          p_surface: 'creatorverse', p_container_id: page, p_post_id: post, p_comment_id: comment
        });
        if (!target.error && Array.isArray(target.data)) {
          const merged = new Map(current.map((row: { id: string }) => [row.id, row]));
          for (const row of target.data) {
            if (row.post_id === post) merged.set(row.id, row);
          }
          data.comments = [...merged.values()];
        }
      }
    }

    return Response.json(data, {
      headers: creatorVerseHeaders,
    });
  } catch (error) {
    return creatorVerseErrorResponse(error);
  }
}
