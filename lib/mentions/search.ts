import { supabase } from '@/lib/supabase';
import { MENTION_USERNAME_PATTERN } from './parse';

export type MentionMember = {
  id: string;
  username: string;
};

export async function searchMentionMembers(
  query: string,
  currentUserId?: string
): Promise<MentionMember[]> {
  const prefix = query.trim();

  if (!prefix || !MENTION_USERNAME_PATTERN.test(prefix)) {
    return [];
  }

  let request = supabase
    .from('profiles')
    .select('id,username')
    .ilike('username', `${prefix}%`)
    .order('username', { ascending: true })
    .limit(10);

  if (currentUserId) {
    request = request.neq('id', currentUserId);
  }

  const { data, error } = await request;

  if (error) {
    throw new Error('Unable to search members.');
  }

  return (data ?? []).filter(
    (member): member is MentionMember =>
      typeof member.id === 'string' &&
      typeof member.username === 'string' &&
      MENTION_USERNAME_PATTERN.test(member.username)
  );
}
