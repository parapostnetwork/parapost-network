import {
  groupClient,
  groupError,
  privateHeaders
} from '@/lib/groups/server';

import { UUID } from '@/lib/groups/validation';

export const dynamic = 'force-dynamic';

const avatarActions = new Set([
  'reserve',
  'save',
  'remove'
]);

export async function POST(request: Request) {
  try {
    const body: unknown = await request.json();

    if (!body || typeof body !== 'object') {
      throw new Error('Invalid avatar request');
    }

    const input = body as Record<string, unknown>;
    const action = input.action;
    const groupId = input.groupId;
    const path = input.path;

    if (
      typeof action !== 'string' ||
      !avatarActions.has(action) ||
      typeof groupId !== 'string' ||
      !UUID.test(groupId)
    ) {
      throw new Error('Invalid avatar request');
    }

    if (
      action === 'save' &&
      (
        typeof path !== 'string' ||
        !path.startsWith(`${groupId}/avatars/`) ||
        path.length > 200
      )
    ) {
      throw new Error('Invalid avatar path');
    }

    const client = await groupClient(request);

    const { data, error } = await client.rpc(
      'groups_avatar_command',
      {
        p_action: action,
        p_group_id: groupId,
        p_path: action === 'save' ? path : null
      }
    );

    if (error) throw error;

    return Response.json(data, {
      headers: privateHeaders
    });
  } catch (error) {
    return groupError(error);
  }
}
