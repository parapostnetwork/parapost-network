/** Transport-independent inputs. No identity, status, storage key or verification claims are accepted. */
import { CreatorVerseError } from './permissions';
import { pageId } from './validation';

export type CreatorVerseOperation =
  | { action: 'create_post'; content: string }
  | { action: 'edit_post'; postId: string; content: string }
  | { action: 'delete_post' | 'like' | 'unlike'; postId: string }
  | { action: 'reserve_media'; postId: string; mimeType: string; byteSize: number; order: number }
  | { action: 'delete_media'; postId: string; targetId: string }
  | { action: 'comment'; postId: string; content: string; parentId: string | null }
  | { action: 'delete_comment'; postId: string; targetId: string }
  | { action: 'share'; postId: string; caption: string; requestId: string };
export const CREATORVERSE_MEDIA_BUCKET = 'creatorverse-private';
const mimeTypes = ['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm'];
function invalid(): never { throw new CreatorVerseError(400, 'Invalid CreatorVerse operation.'); }
function identifier(value: unknown): string {
  if (typeof value !== 'string') return invalid();
  try { return pageId(value).toLowerCase(); } catch { return invalid(); }
}
function text(value: unknown, max: number, min = 0): string {
  if (typeof value !== 'string') return invalid();
  const clean = value.trim();
  if (clean.length < min || clean.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(clean)) return invalid();
  return clean;
}
export function validateCreatorVerseComment(value: unknown): string { return text(value, 1200, 1); }
export function parseCreatorVerseOperation(input: unknown): CreatorVerseOperation {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return invalid();
  const row = input as Record<string, unknown>;
  const keys: Record<string, string[]> = {
    create_post: ['content'], edit_post: ['postId', 'content'], delete_post: ['postId'],
    reserve_media: ['postId', 'mimeType', 'byteSize', 'order'], delete_media: ['postId', 'targetId'],
    like: ['postId'], unlike: ['postId'], comment: ['postId', 'content', 'parentId'],
    delete_comment: ['postId', 'targetId'], share: ['postId', 'caption', 'requestId'],
  };
  if (typeof row.action !== 'string' || !Object.hasOwn(keys, row.action)) return invalid();
  const expected = ['action', ...keys[row.action]];
  if (Object.keys(row).length !== expected.length || expected.some(key => !Object.hasOwn(row, key))) return invalid();
  const action = row.action;
  if (action === 'create_post') return { action, content: text(row.content, 5000) }; // Empty draft permits later attachments.
  const postId = identifier(row.postId);
  if (action === 'edit_post') return { action, postId, content: text(row.content, 5000) };
  if (action === 'delete_post' || action === 'like' || action === 'unlike') return { action, postId };
  if (action === 'delete_media' || action === 'delete_comment') return { action, postId, targetId: identifier(row.targetId) };
  if (action === 'comment') return { action, postId, content: validateCreatorVerseComment(row.content), parentId: row.parentId === null ? null : identifier(row.parentId) };
  if (action === 'share') return { action, postId, caption: text(row.caption, 1000), requestId: identifier(row.requestId) };
  if (typeof row.mimeType !== 'string' || !mimeTypes.includes(row.mimeType)) return invalid();
  const max = row.mimeType.startsWith('image/') ? 8388608 : 33554432;
  if (typeof row.byteSize !== 'number' || !Number.isSafeInteger(row.byteSize) || row.byteSize < 1 || row.byteSize > max
      || typeof row.order !== 'number' || !Number.isInteger(row.order) || row.order < 0 || row.order > 3) return invalid();
  return { action: 'reserve_media', postId, mimeType: row.mimeType, byteSize: row.byteSize, order: row.order };
}

/** Only the authenticated read-only preflight uses these arguments. Never accept them from a role toggle. */
export function operationAccessArguments(page: string, operation: CreatorVerseOperation) {
  return { p_page_id: identifier(page), p_post_id: 'postId' in operation ? operation.postId : null,
    p_action: operation.action, p_target_id: 'targetId' in operation ? operation.targetId : operation.action === 'comment' ? operation.parentId : null };
}
