import 'server-only';
import { creatorVerseClient } from './server';
import { CreatorVerseError } from './permissions';
import { parseCreatorVerseOperation, operationAccessArguments } from './integration-contract';

/** Read-only preflight; does not reserve, upload, mutate or publish anything.
 * This result is advisory and must never be used as a reusable authorization token.
 * Future RPCs must recheck current identity, ownership, block state and gates atomically.
 */
export async function prepareCreatorVerseOperation(request: Request, page: string, input: unknown) {
  const operation = parseCreatorVerseOperation(input);
  const args = operationAccessArguments(page, operation);
  const { client, userId } = await creatorVerseClient(request);
  if (!userId) throw new CreatorVerseError(401, 'Sign in to continue.');
  const { data, error } = await client.rpc('creatorverse_operation_access', args);
  if (error) throw new CreatorVerseError(503, 'CreatorVerse integration is not available yet.');
  if (data !== true) throw new CreatorVerseError(403, 'This action is not available.');
  return { pageId: args.p_page_id, actorId: userId, operation, executionEnabled: false as const };
}

/** Separate non-configurable safety boundary. No route or UI calls this during Phase 3. */
export async function executeCreatorVerseOperation(): Promise<never> {
  throw new CreatorVerseError(503, 'CreatorVerse backend writes and sharing remain disabled.');
}
