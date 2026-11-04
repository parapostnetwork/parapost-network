import { validateCreatorVerseComment } from '@/lib/creatorverse/integration-contract';
export type LocalActor = { id: string; name: string; username: string };
export const previewActor = (owner: boolean): LocalActor => owner
  ? { id: 'local-page-owner', name: 'Page Owner', username: 'page-owner.preview' }
  : { id: 'local-visitor', name: 'Parapost Visitor', username: 'visitor.preview' };
export type LocalComment = { id: string; parentId: string | null; text: string; authorId: string; authorName: string; username: string; createdAt: string | null };
export type LocalShare = { id: string; actorId: string; caption: string; createdAt: string | null; postId: string };
export type LocalInteractions = { version: 2; likes: string[]; comments: LocalComment[]; shares: LocalShare[] };
export type LocalInteractionAction =
  | { action: 'like' } | { action: 'unlike' }
  | { action: 'comment'; id: string; parentId: string | null; text: string; createdAt: string }
  | { action: 'delete_comment'; id: string }
  | { action: 'share'; id: string; caption: string; createdAt: string };
export const interactionKey = (pageName: string, postId: string) => `parapost.creatorverse.actions:${pageName}:${postId}`;
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Saved interactions are invalid; existing data was kept.');
  return value as Record<string, unknown>;
}
function string(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Saved interactions are invalid; existing data was kept.');
  return value;
}
export function readInteractions(raw: string | null, postId: string): LocalInteractions {
  if (!raw) return { version: 2, likes: [], comments: [], shares: [] };
  const row = record(JSON.parse(raw));
  if (row.version !== undefined && row.version !== 2) throw new Error('Unsupported saved interactions; existing data was kept.');
  const legacy = row.version === undefined;
  const visitor = previewActor(false);
  const list = (value: unknown) => { if (!Array.isArray(value)) throw new Error('Invalid saved interactions'); return value; };
  const comments = list(row.comments ?? []).map(item => {
    const comment = record(item);
    return { id: string(comment.id), parentId: comment.parentId === null ? null : string(comment.parentId), text: string(comment.text),
      authorId: legacy ? visitor.id : string(comment.authorId), authorName: legacy ? visitor.name : string(comment.authorName),
      username: legacy ? visitor.username : string(comment.username), createdAt: legacy ? null : comment.createdAt === null ? null : string(comment.createdAt) };
  });
  if (comments.some(comment => comment.parentId !== null && !comments.some(parent => parent.id === comment.parentId && parent.parentId === null))) throw new Error('Invalid saved comment thread; existing data was kept.');
  const likes = legacy ? row.liked === true ? [visitor.id] : [] : list(row.likes).map(string);
  const shares = legacy ? row.shared === true ? [{ id: `legacy-${postId}`, actorId: visitor.id, caption: string(row.caption ?? ''), postId, createdAt: null }] : []
    : list(row.shares).map(item => { const share = record(item); if (share.postId !== postId) throw new Error('Share source mismatch');
      return { id: string(share.id), actorId: string(share.actorId), caption: string(share.caption), postId, createdAt: share.createdAt === null ? null : string(share.createdAt) }; });
  if (new Set(comments.map(comment => comment.id)).size !== comments.length || new Set(shares.map(share => share.actorId)).size !== shares.length) throw new Error('Duplicate saved identities');
  // Preserve every legacy record; never truncate or overwrite unreadable storage.
  return { version: 2, likes: [...new Set(likes)], comments, shares };
}
export function mayDeleteLocalComment(comment: LocalComment, actor: LocalActor, owner: boolean) {
  return comment.authorId === actor.id || (owner && actor.id === 'local-page-owner');
}
export function reduceLocalInteraction(current: LocalInteractions, postId: string, actor: LocalActor, owner: boolean, input: LocalInteractionAction): LocalInteractions {
  if (input.action === 'like') return { ...current, likes: [...new Set([...current.likes, actor.id])] };
  if (input.action === 'unlike') return { ...current, likes: current.likes.filter(id => id !== actor.id) };
  if (input.action === 'comment') {
    if (current.comments.some(comment => comment.id === input.id)) return current; // Retry same intent, never duplicate it.
    const text = validateCreatorVerseComment(input.text);
    if (current.comments.length >= 50) throw new Error('This local preview supports up to 50 comments and replies per post.');
    if (input.parentId && !current.comments.some(comment => comment.id === input.parentId && comment.parentId === null)) throw new Error('That comment was removed. Choose another comment to reply to.');
    return { ...current, comments: [...current.comments, { id: input.id, parentId: input.parentId, text, authorId: actor.id, authorName: actor.name, username: actor.username, createdAt: input.createdAt }] };
  }
  if (input.action === 'delete_comment') {
    const comment = current.comments.find(item => item.id === input.id);
    if (!comment) return current;
    if (!mayDeleteLocalComment(comment, actor, owner)) throw new Error('You cannot delete this comment.');
    return { ...current, comments: current.comments.filter(item => item.id !== input.id && item.parentId !== input.id) };
  }
  if (current.shares.some(share => share.actorId === actor.id)) return current;
  if (input.caption.length > 1000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(input.caption)) throw new Error('Use a valid caption of up to 1,000 characters.');
  return { ...current, shares: [...current.shares, { id: input.id, actorId: actor.id, caption: input.caption.trim(), createdAt: input.createdAt, postId }] };
}
/** Called under a Web Lock in the UI; always rereads storage, and commits before reporting success. */
export function commitLocalInteraction(storage: Pick<Storage, 'getItem' | 'setItem'>, key: string, postId: string, actor: LocalActor, owner: boolean, action: LocalInteractionAction) {
  const next = reduceLocalInteraction(readInteractions(storage.getItem(key), postId), postId, actor, owner, action);
  storage.setItem(key, JSON.stringify(next));
  return next;
}
