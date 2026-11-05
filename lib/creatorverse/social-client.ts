'use client';

import { supabase } from '@/lib/supabase';

export type CreatorVerseSocialAction =
  | 'like'
  | 'unlike'
  | 'comment'
  | 'delete_comment'
  | 'share';

export type CreatorVerseSocialRequest = {
  pageId: string;
  postId: string;
  action: CreatorVerseSocialAction;
  requestId: string;
  targetId?: string | null;
  content?: string;
};

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
}: CreatorVerseSocialRequest): Promise<SocialResult> {
  if (
    !validId(pageId) ||
    !validId(postId) ||
    !validId(requestId)
  ) {
    throw new Error('Invalid interaction identifier.');
  }

  if (targetId != null && !validId(targetId)) {
    throw new Error('Invalid comment identifier.');
  }

  if (
    action === 'delete_comment' &&
    !targetId
  ) {
    throw new Error('Select a comment to delete.');
  }

  if (
    action !== 'comment' &&
    action !== 'delete_comment' &&
    targetId != null
  ) {
    throw new Error('Unexpected comment target.');
  }

  const text = content?.trim() ?? '';

  if (
    (action === 'comment' && (!text || text.length > 1200)) ||
    (action === 'share' && text.length > 1000) ||
    (!['comment', 'share'].includes(action) && text.length > 0)
  ) {
    throw new Error('Invalid interaction text.');
  }

  const { data, error: authError } =
    await supabase.auth.getSession();

  const token = data.session?.access_token;

  if (authError || !token) {
    throw new Error('Sign in to interact with this post.');
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

    throw new Error(message);
  }

  if (
    !result ||
    typeof result !== 'object' ||
    !('id' in result) ||
    typeof result.id !== 'string' ||
    !validId(result.id)
  ) {
    throw new Error('Interaction response could not be verified.');
  }

  return { id: result.id };
}
