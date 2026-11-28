import { supabase } from '@/lib/supabase';
import { MENTION_USERNAME_PATTERN } from './mentions/parse';

import { getGroupChatMembers } from '@/lib/parachat/group-client';

export type MentionContext = {
  surface: 'post' | 'group' | 'creatorverse' | 'group_share' | 'group_promotion' | 'parachat_group';
  containerId?: string;
  postId?: string;
  shareId?: string | null;
};
export type MentionOption = { id: string; username: string };
export const MENTION_PAGE_SIZE = 25;

// No profiles fallback: if the reviewed RPC is unavailable, fail closed.
export async function lookupMentionOptions(query: string, context: MentionContext, afterUsername: string | null = null): Promise<MentionOption[]> {
  if (!MENTION_USERNAME_PATTERN.test(query)) return [];

  if (context.surface === 'parachat_group') {
    if (!context.containerId) return [];

    const { data } = await supabase.auth.getSession();
    const userId = data.session?.user.id;

    if (!userId) return [];

    const members = await getGroupChatMembers(
      context.containerId
    );

    const current = await supabase.auth.getSession();

    if (current.data.session?.user.id !== userId) {
      return [];
    }

    const prefix = query.toLowerCase();
    const cursor = afterUsername?.toLowerCase();

    return members.flatMap(member => {
      const username = member.username;

      if (
        member.user_id === userId ||
        !username ||
        !MENTION_USERNAME_PATTERN.test(username) ||
        !username.toLowerCase().startsWith(prefix) ||
        (cursor && username.toLowerCase() <= cursor)
      ) {
        return [];
      }

      return [{
        id: member.user_id,
        username
      }];
    }).sort((a, b) => {
      const x = a.username.toLowerCase();
      const y = b.username.toLowerCase();
      return x < y ? -1 : x > y ? 1 : 0;
    }).slice(0, MENTION_PAGE_SIZE);
  }

  const { data, error } = await supabase.rpc('parapost_search_mentions_page', {
    p_query: query,
    p_surface: context.surface,
    p_container_id: context.containerId ?? null,
    p_post_id: context.postId ?? null,
    p_share_id: context.shareId ?? null,
    p_after_username: afterUsername,
  });
  if (error) throw error;
  return (Array.isArray(data) ? data : []).filter((row): row is MentionOption =>
    typeof row?.id === 'string' && typeof row?.username === 'string' &&
    MENTION_USERNAME_PATTERN.test(row.username)
  ).slice(0, MENTION_PAGE_SIZE);
}

export function mentionCommentQuery(search: string, postId: string): string {
  const params = new URLSearchParams(search);
  const comment = params.get('comment');
  return params.get('post') === postId && comment ? `?comment=${encodeURIComponent(comment)}` : '';
}
