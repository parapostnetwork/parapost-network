import 'server-only';

import { CreatorVerseError } from './permissions';
import { pageId } from './validation';
import {
  creatorVerseClient,
  creatorVerseErrorResponse,
  creatorVerseHeaders,
} from './server';

// Remains locked until the public SQL gateway, follower checks,
// rate limits and staging authorization are verified.
const SOCIAL_WRITES_APPROVED = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, '') === 'https://vmgelrgrtpghmvqgufzz.supabase.co' && process.env.CREATORVERSE_STAGING_WRITES_ENABLED === 'true';

const actions = new Set([
  'like',
  'unlike',
  'comment',
  'delete_comment',
  'share',
]);

type SocialInput = {
  action?: unknown;
  targetId?: unknown;
  content?: unknown;
  requestId?: unknown;
};

async function readInput(request: Request): Promise<SocialInput> {
  if (!request.headers.get('content-type')
    ?.toLowerCase().startsWith('application/json')) {
    throw new CreatorVerseError(400, 'JSON request required.');
  }

  const reader = request.body?.getReader();
  if (!reader) throw new CreatorVerseError(400, 'Missing request.');

  const chunks: Uint8Array[] = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    total += value.byteLength;
    if (total > 4096) {
      await reader.cancel();
      throw new CreatorVerseError(413, 'Request too large.');
    }

    chunks.push(value);
  }

  const bytes = new Uint8Array(total);
  let offset = 0;

  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new CreatorVerseError(400, 'Invalid JSON request.');
  }

  if (!parsed || typeof parsed !== 'object' ||
      Array.isArray(parsed)) {
    throw new CreatorVerseError(400, 'Invalid interaction.');
  }

  return parsed as SocialInput;
}

export async function handleCreatorVerseInteraction(
  request: Request,
  pageIdentifier: string,
  postIdentifier: string
): Promise<Response> {
  try {
    if (request.method !== 'POST') {
      throw new CreatorVerseError(405, 'Method not allowed.');
    }

    const page = pageId(pageIdentifier);
    const post = pageId(postIdentifier);

    // Never allow interactions through an anonymous account.
    const { client, userId } = await creatorVerseClient(request);

    if (!userId) {
      throw new CreatorVerseError(401, 'Sign in to continue.');
    }

    if (!SOCIAL_WRITES_APPROVED) {
      throw new CreatorVerseError(
        503,
        'CreatorVerse interactions are not enabled yet.'
      );
    }

    const input = await readInput(request);

    if (typeof input.action !== 'string' ||
        !actions.has(input.action)) {
      throw new CreatorVerseError(400, 'Invalid action.');
    }

    const action = input.action;

    if (typeof input.requestId !== 'string') {
      throw new CreatorVerseError(400, 'Missing request ID.');
    }

    const requestId = pageId(input.requestId);

    let targetId: string | null = null;

    if (input.targetId != null) {
      if (typeof input.targetId !== 'string') {
        throw new CreatorVerseError(400, 'Invalid target.');
      }
      targetId = pageId(input.targetId);
    }

    if (action === 'delete_comment' && !targetId) {
      throw new CreatorVerseError(400, 'Comment ID required.');
    }

    if (!['comment', 'delete_comment'].includes(action) &&
        targetId !== null) {
      throw new CreatorVerseError(400, 'Unexpected target.');
    }

    if (input.content != null &&
        typeof input.content !== 'string') {
      throw new CreatorVerseError(400, 'Invalid content.');
    }

    const content =
      typeof input.content === 'string'
        ? input.content.trim()
        : '';

    const maximum =
      action === 'comment' ? 1200 :
      action === 'share' ? 1000 : 0;

    if (
      content.length > maximum ||
      (action === 'comment' && !content) ||
      /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(content)
    ) {
      throw new CreatorVerseError(400, 'Invalid content.');
    }

    // Reserved public SQL gateway contract.
    // It must recheck follower status, blocking, visibility,
    // comment rights, ownership and idempotency in the database.
    // This function is NOT installed or enabled yet.
    const { data, error } = await client.rpc(
      'creatorverse_social_interact',
      {
        p_page_id: page,
        p_post_id: post,
        p_action: action,
        p_target_id: targetId,
        p_body: content,
        p_request_id: requestId,
      }
    );

    if (error || typeof data !== 'string') {
      throw new CreatorVerseError(
        503,
        'Unable to complete this interaction.'
      );
    }

    return Response.json(
      { id: data },
      { headers: creatorVerseHeaders }
    );
  } catch (error) {
    return creatorVerseErrorResponse(error);
  }
}
