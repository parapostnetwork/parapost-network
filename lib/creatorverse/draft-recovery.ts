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
  if (!owner || value.owner !== owner) throw new Error('Draft account mismatch.');
  localStorage.setItem(recoveryKey(owner), JSON.stringify(value));
}
export function clearRecovery(owner: string) {
  localStorage.removeItem(recoveryKey(owner));
}
