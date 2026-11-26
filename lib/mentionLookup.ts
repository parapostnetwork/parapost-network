import { supabase } from '@/lib/supabase';
import { MENTION_USERNAME_PATTERN } from './mentions/parse';

export type MentionContext = {
  surface: 'post' | 'group' | 'creatorverse' | 'group_share' | 'group_promotion';
  containerId?: string;
  postId?: string;
  shareId?: string | null;
};
export type MentionOption = { id: string; username: string };
export const MENTION_PAGE_SIZE = 25;

// No profiles fallback: if the reviewed RPC is unavailable, fail closed.
export async function lookupMentionOptions(query: string, context: MentionContext, afterUsername: string | null = null): Promise<MentionOption[]> {
  if (!MENTION_USERNAME_PATTERN.test(query)) return [];
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
