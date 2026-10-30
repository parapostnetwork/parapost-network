import { supabase } from '@/lib/supabase';
import { groupsFetch } from './client';
import type { Group } from './types';

type Cache = {
  userId: string;
  groups: Group[];
  expires: number;
};

let cached: Cache | null = null;
let pending: { userId: string; promise: Promise<void> } | null = null;
let generation = 0;

export function clearWarmGroupsDirectory() {
  generation++;
  cached = null;
  pending = null;
}

export function getWarmGroupsDirectory(userId: string): Group[] | null {
  if (!userId || !cached || cached.userId !== userId ||
      Date.now() >= cached.expires) return null;
  return cached.groups;
}

export function warmGroupsDirectory(userId: string): Promise<void> {
  if (!userId || typeof window === 'undefined') return Promise.resolve();

  if (cached && cached.userId !== userId) clearWarmGroupsDirectory();
  if (pending && pending.userId !== userId) clearWarmGroupsDirectory();

  if (getWarmGroupsDirectory(userId)) return Promise.resolve();
  if (pending?.userId === userId) return pending.promise;

  const version = generation;

  const promise = (async () => {
    const before = (await supabase.auth.getUser()).data.user?.id;
    if (before !== userId || version !== generation) return;

    const response = await groupsFetch(
      '/api/groups?search=&filter=all&offset=0'
    );
    if (!response.ok) return;

    const data: unknown = await response.json();
    if (!Array.isArray(data)) return;

    const after = (await supabase.auth.getUser()).data.user?.id;
    if (after !== userId || version !== generation) return;

    cached = {
      userId,
      groups: data as Group[],
      expires: Date.now() + 30000
    };
  })().catch(() => {
    // Normal Groups loading remains the fallback.
  }).finally(() => {
    if (pending?.promise === promise) pending = null;
  });

  pending = { userId, promise };
  return promise;
}
