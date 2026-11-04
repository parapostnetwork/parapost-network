/** Browser-only preview data. These roles NEVER authorize a real CreatorVerse write. */
export type LocalPreviewRole = 'owner' | 'visitor';
export type LocalPostRecord = {
  id: string;
  content: string;
  createdAt?: string;
  attachmentCount?: number;
};
export function localPreviewCanManage(role: unknown, environment: string | undefined): boolean {
  return environment === 'development' && role === 'owner';
}
export const localPostKey = (pageName: string) =>
  `parapost.creatorverse.localPost.v1:${encodeURIComponent(pageName)}`;

export function readLocalPosts(storage: Pick<Storage, 'getItem'>, key: string, pageName: string) {
  const raw = storage.getItem(key);
  if (!raw) return { content: '', posts: [] as LocalPostRecord[] };
  const saved = JSON.parse(raw);
  if (!saved || typeof saved !== 'object' || Array.isArray(saved)) throw new Error('Invalid saved posts');
  const content = typeof saved.content === 'string' ? saved.content.slice(0, 5000) : '';
  const posts: LocalPostRecord[] = Array.isArray(saved.posts)
    ? saved.posts.filter((post: LocalPostRecord) => post && typeof post.id === 'string' && typeof post.content === 'string')
      .map((post: LocalPostRecord) => ({
        id: post.id, content: post.content,
        ...(typeof post.createdAt === 'string' && Number.isFinite(Date.parse(post.createdAt)) ? { createdAt: post.createdAt } : {}),
        ...(Number.isInteger(post.attachmentCount) && post.attachmentCount! >= 0 ? { attachmentCount: post.attachmentCount } : {}),
      }))
    : saved.showPreview === true && content.trim() ? [{ id: `legacy-${pageName}`, content }] : [];
  return { content, posts };
}

/** Commit metadata synchronously so quota/access failures cannot look like a saved post. */
export function writeLocalPosts(storage: Pick<Storage, 'setItem'>, key: string, content: string, posts: LocalPostRecord[]) {
  storage.setItem(key, JSON.stringify({ content, showPreview: false, posts: posts.map(post => ({
    id: post.id, content: post.content, createdAt: post.createdAt, attachmentCount: post.attachmentCount,
  })) }));
}

// Keep the existing conservative local limits until server media validation is approved.
export const MAX_LOCAL_ATTACHMENTS = 4;
export function validateLocalAttachment(file: Pick<File, 'type' | 'size'>): 'image' | 'video' {
  const kind = ['image/jpeg', 'image/png', 'image/webp'].includes(file.type) ? 'image'
    : ['video/mp4', 'video/webm'].includes(file.type) ? 'video' : null;
  if (!kind) throw new Error('Choose JPEG, PNG, WebP, MP4 or WebM files.');
  const limit = kind === 'image' ? 8 : 32;
  if (file.size <= 0 || file.size > limit * 1024 * 1024) throw new Error(`Choose a non-empty ${kind} file up to ${limit} MB.`);
  return kind;
}
