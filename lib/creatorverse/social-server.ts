import 'server-only';
import { parseCreatorVerseSocialRequest } from './social-request';
import { prepareCreatorVerseOperation, executeCreatorVerseOperation } from './integration-server';
/** Uses Phase 3 authenticated preflight; no preview actor or caller-supplied identity. */
export async function prepareCreatorVerseSocialRequest(request: Request, page: string, input: unknown) {
  const social = parseCreatorVerseSocialRequest(input);
  const prepared = await prepareCreatorVerseOperation(request, page, social.operation);
  return { ...prepared, requestId: social.requestId };
}
/** Hardlocked regardless of preflight success. No remote mutation adapter exists. */
export const executeCreatorVerseSocialRequest = executeCreatorVerseOperation;
