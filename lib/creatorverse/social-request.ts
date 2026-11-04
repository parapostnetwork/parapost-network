import { parseCreatorVerseOperation, type CreatorVerseOperation } from './integration-contract';
import { pageId } from './validation';
import { CreatorVerseError } from './permissions';
export type CreatorVerseSocialRequest = { requestId: string; operation: CreatorVerseOperation };
/** Retry identity only; authentication is always supplied separately by the server. */
export function parseCreatorVerseSocialRequest(input: unknown): CreatorVerseSocialRequest {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new CreatorVerseError(400, 'Invalid social request.');
  const row = input as Record<string, unknown>;
  if (Object.keys(row).length !== 2 || typeof row.requestId !== 'string' || !Object.hasOwn(row, 'operation')) throw new CreatorVerseError(400, 'Invalid social request.');
  const requestId = pageId(row.requestId).toLowerCase();
  const operation = parseCreatorVerseOperation(row.operation);
  if (!['like', 'unlike', 'comment', 'delete_comment', 'share'].includes(operation.action)
      || (operation.action === 'share' && operation.requestId !== requestId)) throw new CreatorVerseError(400, 'Invalid social operation.');
  return { requestId, operation };
}
