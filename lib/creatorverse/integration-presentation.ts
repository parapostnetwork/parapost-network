/** Safe canonical reference for a future Dashboard/Profile feed adapter. No feed writes. */
import { pageId } from './validation';
export type CreatorVerseShareReference = {
  kind: 'creatorverse'; shareId: string; sharedAt: string; sharerId: string;
  caption: string; original: { postId: string; pageId: string; pageName: string; content: string; href: string; media: CreatorVerseSharedMedia[] };
};
export type CreatorVerseSharedMedia = { id: string; kind: 'image' | 'video'; mimeType: string; order: number };
function text(value: unknown, max: number, min = 0): string {
  if (typeof value !== 'string' || value.length < min || value.length > max) throw new Error('Invalid share projection');
  return value;
}
export function creatorVerseShareReference(value: unknown): CreatorVerseShareReference {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid share projection');
  const row = value as Record<string, unknown>;
  const identifier = (key: string) => pageId(text(row[key], 36, 36)).toLowerCase();
  const page = identifier('page_id');
  const sharedAt = text(row.shared_at, 64, 1);
  if (!Number.isFinite(Date.parse(sharedAt))) throw new Error('Invalid share timestamp');
  const rawMedia = row.media ?? [];
  if (!Array.isArray(rawMedia) || rawMedia.length > 4) throw new Error('Invalid media references');
  const media: CreatorVerseSharedMedia[] = rawMedia.map(value => {
    if (!value || typeof value !== 'object') throw new Error('Invalid media reference');
    const item = value as Record<string, unknown>;
    if (!['image', 'video'].includes(String(item.media_type)) || typeof item.display_order !== 'number'
      || !Number.isInteger(item.display_order) || item.display_order < 0 || item.display_order > 3) throw new Error('Invalid media reference');
    const kind = item.media_type as 'image' | 'video';
    const mime = text(item.mime_type, 32, 1);
    if (!(kind === 'image' ? ['image/jpeg', 'image/png', 'image/webp'] : ['video/mp4', 'video/webm']).includes(mime)) throw new Error('Invalid media type');
    return { id: pageId(text(item.media_id, 36, 36)), kind, mimeType: mime, order: item.display_order };
  }).sort((a, b) => a.order - b.order);
  if (new Set(media.map(item => item.id)).size !== media.length || new Set(media.map(item => item.order)).size !== media.length) throw new Error('Duplicate media references');
  return { kind: 'creatorverse', shareId: identifier('share_id'), sharedAt, sharerId: identifier('sharer_id'),
    caption: text(row.caption, 1000), original: { postId: identifier('post_id'), pageId: page,
      pageName: text(row.page_name, 100, 3), content: text(row.content, 5000), href: `/creatorverse/${page}`, media } };
}
