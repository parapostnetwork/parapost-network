import { communityStorageNamespace } from '@/lib/community/release-target';
import type { PageFields } from './types';

export type DraftInput = { fields: PageFields; linkLabel: string; linkUrl: string };
export type Recovery = DraftInput & {
  version: 1;
  owner: string;
  pageId?: string;
  creation?: { before: string[]; fields: PageFields };
  images: Partial<Record<'logo' | 'cover', string>>;
};
export type RecoveryPage = {
  id: string;
  status: 'draft' | 'active';
  fields: PageFields;
  images: Record<'logo' | 'cover', boolean>;
  pending: { id: string; purpose: 'logo' | 'cover' }[];
};
export const recoveryKey = (owner: string) =>
  `parapost:creatorverse:${communityStorageNamespace()}:page-recovery:v1:${owner}`;

export function readRecovery(owner: string): Recovery | null {
  const raw = localStorage.getItem(recoveryKey(owner));
  if (!raw) return null;
  const value = JSON.parse(raw) as Recovery;
  // Never fall back to the old, shared browser draft key.
  if (value.version !== 1 || value.owner !== owner || !value.fields ||
      !Array.isArray(value.fields.social_links) || !value.images) {
    throw new Error('Saved page recovery information could not be read. It has been preserved.');
  }
  return value;
}
export function saveRecovery(owner: string, value: Recovery) {
  if (!owner || value.owner !== owner) throw new Error('Page account mismatch.');
  localStorage.setItem(recoveryKey(owner), JSON.stringify(value));
}
export function clearRecovery(owner: string) {
  localStorage.removeItem(recoveryKey(owner));
}

/** Preserve image intent when the user selects an interrupted creation. */
export function recoveryForPage(owner: string, page: RecoveryPage, current: Recovery | null): Recovery {
  const sameAttempt = current?.owner === owner && (current.pageId === page.id ||
    (!current.pageId && current.creation && !current.creation.before.includes(page.id) &&
      (['name', 'category', 'short_bio', 'description'] as const).every(key => current.creation!.fields[key] === page.fields[key])));
  const images: Recovery['images'] = {};
  for (const pending of page.pending) images[pending.purpose] = 'previously selected image';
  return {
    version: 1, owner, pageId: page.id,
    fields: sameAttempt ? current.fields : page.fields,
    linkLabel: sameAttempt ? current.linkLabel : '',
    linkUrl: sameAttempt ? current.linkUrl : '',
    images: { ...images, ...(sameAttempt ? current.images : {}) },
  };
}
