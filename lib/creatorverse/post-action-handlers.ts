import 'server-only';

import { CreatorVerseError } from './permissions';
import { pageId } from './validation';
import { parseCreatorVersePostRequest } from './post-request';
import {
  createCreatorVersePostDraft,
  publishCreatorVersePost,
} from './post-write';
import {
  creatorVerseErrorResponse,
  creatorVerseHeaders,
} from './server';

/**
 * Internal-only handlers.
 * NOT connected to Next.js API routes.
 * Underlying post-write functions remain hard-locked.
 */

export async function handleCreatorVersePostDraft(
  request: Request,
  pageIdentifier: string
): Promise<Response> {
  try {
    if (request.method !== 'POST') {
      throw new CreatorVerseError(405, 'Method not allowed.');
    }

    const validatedPageId = pageId(pageIdentifier);
    const { content } = await parseCreatorVersePostRequest(request);

    const result = await createCreatorVersePostDraft(
      request,
      validatedPageId,
      content
    );

    return Response.json(
      { post: result },
      { status: 201, headers: creatorVerseHeaders }
    );
  } catch (error) {
    return creatorVerseErrorResponse(error);
  }
}

export async function handleCreatorVersePostPublish(
  request: Request,
  pageIdentifier: string,
  postIdentifier: string
): Promise<Response> {
  try {
    if (request.method !== 'POST') {
      throw new CreatorVerseError(405, 'Method not allowed.');
    }

    const validatedPageId = pageId(pageIdentifier);
    const validatedPostId = pageId(postIdentifier);

    const result = await publishCreatorVersePost(
      request,
      validatedPageId,
      validatedPostId
    );

    return Response.json(
      { post: result },
      { status: 200, headers: creatorVerseHeaders }
    );
  } catch (error) {
    return creatorVerseErrorResponse(error);
  }
}
