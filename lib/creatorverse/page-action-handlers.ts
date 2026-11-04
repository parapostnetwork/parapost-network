import 'server-only';

import { parseCreatorVersePageRequest } from './page-request';
import {
  createCreatorVersePage,
  updateCreatorVersePage,
} from './page-write';
import {
  creatorVerseErrorResponse,
  creatorVerseHeaders,
} from './server';
import { pageId } from './validation';
import { CreatorVerseError } from './permissions';

/**
 * NOT connected to any public API route.
 *
 * The underlying page-write functions are hard-locked.
 * No database mutation can be performed through these handlers.
 *
 * These handlers must not be mounted until separately approved
 * security, rate-limit, RLS and staging tests are complete.
 */

export async function handlePageCreate(
  request: Request
): Promise<Response> {
  try {
    if (request.method !== 'POST') {
      throw new CreatorVerseError(405, 'Method not allowed.');
    }

    const fields = await parseCreatorVersePageRequest(request);
    const result = await createCreatorVersePage(request, fields);

    return Response.json(
      { page: result },
      { status: 201, headers: creatorVerseHeaders }
    );
  } catch (error) {
    return creatorVerseErrorResponse(error);
  }
}

export async function handlePageUpdate(
  request: Request,
  id: string
): Promise<Response> {
  try {
    if (request.method !== 'PATCH') {
      throw new CreatorVerseError(405, 'Method not allowed.');
    }

    const validatedId = pageId(id);
    const fields = await parseCreatorVersePageRequest(request);

    const result = await updateCreatorVersePage(
      request,
      validatedId,
      fields
    );

    return Response.json(
      { page: result },
      { status: 200, headers: creatorVerseHeaders }
    );
  } catch (error) {
    return creatorVerseErrorResponse(error);
  }
}
