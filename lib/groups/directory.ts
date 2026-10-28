import type { Group } from './types';

export type MineFilter = 'all' | 'owned' | 'joined' | 'favorites' | 'recent';
export type DirectorySort = 'name' | 'members' | 'visited';
export type GroupPreferences = { favorites: string[]; visits: Record<string, number> };
export const emptyGroupPreferences = (): GroupPreferences => ({ favorites: [], visits: {} });
export const ownsGroup = (group: Group, viewerId: string) => group.owner_id === viewerId || group.membership_role === 'owner';

export function parseGroupPreferences(raw: string | null): GroupPreferences {
  try {
    const value = JSON.parse(raw ?? '{}');
    return {
      favorites: Array.isArray(value.favorites) ? [...new Set<string>(value.favorites.filter((id: unknown) => typeof id === 'string'))].slice(0, 2000) : [],
      visits: Object.fromEntries(Object.entries(value.visits ?? {}).filter(([id, time]) => id && typeof time === 'number' && Number.isFinite(time) && time > 0).slice(0, 2000)) as Record<string, number>,
    };
  } catch { return emptyGroupPreferences(); }
}

export function selectMyGroups(groups: Group[], viewerId: string, preferences: GroupPreferences, filter: MineFilter, search = '', sort: DirectorySort = 'name') {
  const query = search.trim().toLocaleLowerCase();
  return groups.filter(group => group.membership_status === 'approved')
    .filter(group => filter === 'all' || (filter === 'owned' && ownsGroup(group, viewerId))
      || (filter === 'joined' && !ownsGroup(group, viewerId))
      || (filter === 'favorites' && preferences.favorites.includes(group.id))
      || (filter === 'recent' && !!preferences.visits[group.id]))
    .filter(group => !query || `${group.name} ${group.description}`.toLocaleLowerCase().includes(query))
    .sort((a, b) => {
      if (filter === 'recent' || sort === 'visited') {
        const difference = (preferences.visits[b.id] ?? 0) - (preferences.visits[a.id] ?? 0);
        if (difference) return difference;
      }
      if (sort === 'members' && a.member_count !== b.member_count) return (b.member_count ?? -1) - (a.member_count ?? -1);
      return a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
    });
}
