import type { GroupPost } from './types';

// Preserve timestamp precision from Postgres and use the ID to break timestamp ties.
export function groupFeedCursor(created: string | null, id: string | null): string | null {
  if (created === null && id === null) return null;
  if (!created || !id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
    || !/^\d{4}-\d{2}-\d{2}T[\d:.]+(?:Z|[+-]\d{2}:\d{2})$/.test(created)
    || !Number.isFinite(Date.parse(created))) throw new Error('Invalid feed cursor');
  return `created_at.lt.${created},and(created_at.eq.${created},id.lt.${id})`;
}
export function appendGroupPosts(current: GroupPost[], incoming: GroupPost[]): GroupPost[] {
  const ids = new Set(current.map(post => post.id));
  return [...current, ...incoming.filter(post => {
    if (ids.has(post.id)) return false;
    ids.add(post.id);return true;
  })];
}
