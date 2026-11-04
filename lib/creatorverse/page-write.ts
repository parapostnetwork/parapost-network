import 'server-only';

import {
  creatorVerseClient,
  requireCreatorVerseOwner,
} from './server';

import { CreatorVerseError } from './permissions';
import { pageId, validatePageFields } from './validation';

/**
 * SECURITY LOCK
 *
 * Page writes cannot be activated until:
 * - Schema and RLS policies are reviewed and tested
 * - Database application receives explicit approval
 * - Page creation limits and rate limiting are implemented
 * - Staging authorization tests pass
 * - API mutation routes receive separate approval
 *
 * Do not replace this with an environment flag.
 */
function pageWritesApproved(): boolean {
  return false;
}

/**
 * Future page creation operation.
 *
 * Never accept a client-supplied owner ID or status.
 */
export async function createCreatorVersePage(
  request: Request,
  input: unknown
): Promise<{ id: string }> {
  if (!pageWritesApproved()) {
    throw new CreatorVerseError(
      503,
      'CreatorVerse page saving is not enabled yet.'
    );
  }

  const fields = validatePageFields(input);

  const { client, userId } = await creatorVerseClient(request);

  if (!userId) {
    throw new CreatorVerseError(401, 'Sign in to create a page.');
  }

  const { data, error } = await client
    .from('creatorverse_pages')
    .insert({
      ...fields,
      owner_id: userId,
      status: 'draft',
    })
    .select('id')
    .single();

  if (error || !data) {
    throw new CreatorVerseError(503, 'Unable to create page.');
  }

  return { id: data.id };
}

/**
 * Future owner-only page editing operation.
 *
 * Only editable public page fields are accepted.
 * Ownership and page status are never taken from input.
 */
export async function updateCreatorVersePage(
  request: Request,
  id: string,
  input: unknown
): Promise<{ id: string }> {
  if (!pageWritesApproved()) {
    throw new CreatorVerseError(
      503,
      'CreatorVerse page editing is not enabled yet.'
    );
  }

  const validatedId = pageId(id);
  const fields = validatePageFields(input);

  const { client, userId } = await requireCreatorVerseOwner(
    request,
    validatedId
  );

  const { data, error } = await client
    .from('creatorverse_pages')
    .update(fields)
    .eq('id', validatedId)
    .eq('owner_id', userId!)
    .select('id')
    .maybeSingle();

  if (error) {
    throw new CreatorVerseError(503, 'Unable to update page.');
  }

  if (!data) {
    throw new CreatorVerseError(404, 'Page not found.');
  }

  return { id: data.id };
}
