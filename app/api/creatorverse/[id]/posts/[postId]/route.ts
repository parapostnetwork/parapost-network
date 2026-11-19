import { CreatorVerseError } from '@/lib/creatorverse/permissions';
import { pageId } from '@/lib/creatorverse/validation';
import {
  creatorVerseErrorResponse,
  creatorVerseHeaders,
  requireCreatorVerseOwner,
} from '@/lib/creatorverse/server';

export const dynamic = 'force-dynamic';

type Context = {
  params: Promise<{ id: string; postId: string }>;
};

function requirePostWrites() {
  if (process.env.CREATORVERSE_POST_WRITES_ENABLED !== 'true') {
    throw new CreatorVerseError(
      503,
      'CreatorVerse post management is not enabled.'
    );
  }
}

async function ownerClient(request: Request, context: Context) {
  requirePostWrites();

  const { id, postId } = await context.params;
  const validatedPageId = pageId(id);
  const validatedPostId = pageId(postId);

  const { client, userId } = await requireCreatorVerseOwner(
    request,
    validatedPageId,
    true
  );

  if (!userId) {
    throw new CreatorVerseError(401, 'Sign in to continue.');
  }

  return {
    client,
    validatedPageId,
    validatedPostId,
  };
}

export async function PATCH(request: Request, context: Context) {
  try {
    const {
      client,
      validatedPageId,
      validatedPostId,
    } = await ownerClient(request, context);

    const body: unknown = await request.json().catch(() => null);

    if (
      !body ||
      typeof body !== 'object' ||
      Array.isArray(body) ||
      Object.keys(body).length !== 1 ||
      !('content' in body) ||
      typeof body.content !== 'string'
    ) {
      throw new CreatorVerseError(400, 'Invalid post content.');
    }

    const content = body.content.trim();

    if (
      content.length > 5000 ||
      /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(content)
    ) {
      throw new CreatorVerseError(400, 'Invalid post content.');
    }

    const { data, error } = await client.rpc(
      'creatorverse_edit_post',
      {
        p_page_id: validatedPageId,
        p_post_id: validatedPostId,
        p_content: content,
      }
    );

    if (error || data !== validatedPostId) {
      throw new CreatorVerseError(503, 'Unable to edit post.');
    }

    return Response.json(
      { post: { id: validatedPostId } },
      { headers: creatorVerseHeaders }
    );
  } catch (error) {
    return creatorVerseErrorResponse(error);
  }
}

export async function DELETE(request: Request, context: Context) {
  try {
    const {
      client,
      validatedPageId,
      validatedPostId,
    } = await ownerClient(request, context);

    const { data, error } = await client.rpc(
      'creatorverse_delete_post',
      {
        p_page_id: validatedPageId,
        p_post_id: validatedPostId,
      }
    );

    if (error || data !== validatedPostId) {
      throw new CreatorVerseError(503, 'Unable to delete post.');
    }

    return Response.json(
      { post: { id: validatedPostId } },
      { headers: creatorVerseHeaders }
    );
  } catch (error) {
    return creatorVerseErrorResponse(error);
  }
}
