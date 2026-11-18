export type CreatorVerseComment = {
  id: string; author_id: string; post_id?: string; parent_id: string | null;
  content: string; created_at: string;
};
export type CreatorVerseEngagement = {
  like_count: number; comment_count: number; share_count: number;
  liked_by_me: boolean; comments_enabled?: boolean; comments: CreatorVerseComment[];
};

/** Fail closed on malformed counts/comments; never invent engagement data. */
export function parseCreatorVerseEngagement(value: unknown, postId: string): CreatorVerseEngagement | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const item = value as Record<string, unknown>;
  if (![item.like_count, item.comment_count, item.share_count].every(count =>
    typeof count === 'number' && Number.isSafeInteger(count) && count >= 0) ||
    typeof item.liked_by_me !== 'boolean' || !Array.isArray(item.comments)) return null;
  if (!item.comments.every(comment => comment && typeof comment === 'object' &&
    typeof comment.id === 'string' && typeof comment.author_id === 'string' &&
    (comment.post_id === undefined || comment.post_id === postId) &&
    (comment.parent_id === null || typeof comment.parent_id === 'string') &&
    typeof comment.content === 'string' && typeof comment.created_at === 'string')) return null;
  return item as CreatorVerseEngagement;
}
