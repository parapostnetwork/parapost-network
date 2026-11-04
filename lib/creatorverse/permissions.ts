import type { PageOwnership } from './types';
/** Ownership rule only; runtime access additionally requires server/database feature gates. Following is irrelevant. */
export function ownerMayPublish(page: PageOwnership, viewer: { id: string; eligible: boolean } | null): boolean {
  return !!viewer?.eligible && viewer.id === page.owner_id && page.status === 'active';
}
export class CreatorVerseError extends Error {
  constructor(public readonly status: number, message: string) { super(message); }
}
