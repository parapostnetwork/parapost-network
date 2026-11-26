import {
  groupClient,
  groupError,
  privateHeaders
} from '@/lib/groups/server';
import { UUID } from '@/lib/groups/validation';

export const dynamic = 'force-dynamic';

const actions = new Set([
  'like',
  'unlike',
  'comment',
  'reply',
  'like_comment',
  'unlike_comment',
  'edit_comment',
  'delete_comment'
]);

export async function GET(request: Request) {
  try {
    const client = await groupClient(request);
    const params = new URL(request.url).searchParams;
    const shareId = params.get('share');
    const kind = params.get('kind') ?? 'post';
    if (kind !== 'post' && kind !== 'promotion') throw new Error('Invalid share kind');

    if (!shareId || !UUID.test(shareId))
      throw new Error('Invalid share');

    const { data, error } = await client.rpc(
      kind === 'promotion' ? 'groups_promotion_stats' : 'groups_shared_post_stats',
      { p_share_id: shareId }
    );

    if (error) throw error;

    const targetComment = params.get('comment');
    if (targetComment) {
      if (!UUID.test(targetComment)) throw new Error('Invalid comment');
      if (data && Array.isArray(data.comments) && !data.comments.some((row: { id: string }) => row.id === targetComment)) {
        const target = await client.rpc('parapost_mention_shared_thread', {
          p_kind: kind, p_share_id: shareId, p_comment_id: targetComment
        });
        if (!target.error && Array.isArray(target.data)) {
          const merged = new Map(data.comments.map((row: { id: string }) => [row.id, row]));
          for (const row of target.data) if (row.share_id === shareId) merged.set(row.id, row);
          data.comments = [...merged.values()];
        }
      }
    }

    return Response.json(data, {
      headers: privateHeaders
    });
  } catch (error) {
    return groupError(error);
  }
}

export async function POST(request: Request) {
  try {
    const client = await groupClient(request);
    const reader = request.body?.getReader();

    if (!reader) throw new Error('Missing body');

    const chunks: Uint8Array[] = [];
    let total = 0;

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      total += value.byteLength;

      if (total > 8192) {
        await reader.cancel();
        throw new Error('Request too large');
      }

      chunks.push(value);
    }

    const input = JSON.parse(
      new TextDecoder().decode(Buffer.concat(chunks))
    );

    if (!input || typeof input !== 'object'
      || Array.isArray(input))
      throw new Error('Invalid request');

    const { shareId, action, content, parentId } = input;
    const kind = input.kind ?? 'post';
    if (kind !== 'post' && kind !== 'promotion') throw new Error('Invalid share kind');

    if (typeof shareId !== 'string'
      || !UUID.test(shareId)
      || typeof action !== 'string'
      || !actions.has(action))
      throw new Error('Invalid interaction');

    if (content != null &&
      (typeof content !== 'string'
        || content.length > 1200))
      throw new Error('Invalid content');

    if (parentId != null &&
      (typeof parentId !== 'string'
        || !UUID.test(parentId)))
      throw new Error('Invalid comment');

    const { data, error } = await client.rpc(
      kind === 'promotion' ? 'groups_promotion_interact' : 'groups_shared_post_interact',
      {
        p_share_id: shareId,
        p_action: action,
        p_content: content ?? null,
        p_parent_id: parentId ?? null
      }
    );

    if (error) {
      if (
        error.code === 'P0001' &&
        error.message === 'Rate limit exceeded. Try again shortly.'
      ) {
        return Response.json(
          { error: 'Too many interactions. Try again shortly.' },
          {
            status: 429,
            headers: {
              ...privateHeaders,
              'Retry-After': '60'
            }
          }
        );
      }

      throw error;
    }

    return Response.json(data, {
      headers: privateHeaders
    });
  } catch (error) {
    return groupError(error);
  }
}
