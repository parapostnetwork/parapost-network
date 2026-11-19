'use client';

import { supabase } from '@/lib/supabase';

export type CreatorVerseSocialAction =
  | 'like'
  | 'unlike'
  | 'comment'
  | 'delete_comment'
  | 'edit_comment'
  | 'like_comment'
  | 'unlike_comment'
  | 'share';

export type CreatorVerseSocialRequest = {
  pageId: string;
  postId: string;
  action: CreatorVerseSocialAction;
  requestId: string;
  targetId?: string | null;
  content?: string;
};

export class CreatorVerseInteractionError extends Error {
  constructor(message: string, readonly uncertain = false) {
    super(message);
    this.name = 'CreatorVerseInteractionError';
  }
}

type SocialResult = {
  id: string;
};

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function validId(value: string): boolean {
  return UUID.test(value);
}

/**
 * Sends an interaction as the actual signed-in member.
 *
 * The caller must generate one requestId per user action and
 * reuse that same ID when retrying the same action.
 *
 * This client does not grant follower or ownership permissions.
 * Those checks belong to the server and database.
 */
export async function submitCreatorVerseInteraction({
  pageId,
  postId,
  action,
  requestId,
  targetId,
  content,
}: CreatorVerseSocialRequest, expectedUserId?: string): Promise<SocialResult> {
  if (
    !validId(pageId) ||
    !validId(postId) ||
    !validId(requestId)
  ) {
    throw new CreatorVerseInteractionError('Invalid interaction identifier.');
  }

  if (targetId != null && !validId(targetId)) {
    throw new CreatorVerseInteractionError('Invalid comment identifier.');
  }

  const commentTargetActions = new Set<CreatorVerseSocialAction>([
    'delete_comment', 'edit_comment', 'like_comment', 'unlike_comment',
  ]);
  if (commentTargetActions.has(action) && !targetId) {
    throw new CreatorVerseInteractionError('Select a comment or reply.');
  }

  if (action !== 'comment' && !commentTargetActions.has(action) && targetId != null) {
    throw new CreatorVerseInteractionError('Unexpected comment target.');
  }

  const text = content?.trim() ?? '';

  if (
    (['comment', 'edit_comment'].includes(action) && (!text || text.length > 1200)) ||
    (action === 'share' && text.length > 1000) ||
    (!['comment', 'edit_comment', 'share'].includes(action) && text.length > 0)
  ) {
    throw new CreatorVerseInteractionError('Invalid interaction text.');
  }

  const { data, error: authError } =
    await supabase.auth.getSession();

  const token = data.session?.access_token;

  if (authError || !token) {
    throw new CreatorVerseInteractionError('Sign in to interact with this post.');
  }

  if (expectedUserId && data.session?.user.id !== expectedUserId) {
    throw new CreatorVerseInteractionError('Your account changed. Reopen this post to continue.');
  }

  const url =
    `/api/creatorverse/${encodeURIComponent(pageId)}` +
    `/posts/${encodeURIComponent(postId)}/interactions`;

  const response = await fetch(url, {
    method: 'POST',
    cache: 'no-store',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      action,
      requestId,
      targetId: targetId ?? null,
      content: text,
    }),
  });

  const result: unknown = await response.json().catch(
    () => null
  );

  if (!response.ok) {
    const message =
      result &&
      typeof result === 'object' &&
      'error' in result &&
      typeof result.error === 'string'
        ? result.error
        : 'Unable to complete the interaction.';

    throw new CreatorVerseInteractionError(message, response.status >= 500);
  }

  if (
    !result ||
    typeof result !== 'object' ||
    !('id' in result) ||
    typeof result.id !== 'string' ||
    !validId(result.id)
  ) {
    throw new CreatorVerseInteractionError('Interaction response could not be verified.', true);
  }

  return { id: result.id };
}
