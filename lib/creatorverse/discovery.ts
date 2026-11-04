import { CREATORVERSE_CATEGORIES, type PublicPage, type CreatorVerseCategory } from './types';
import { directoryQuery, pageId } from './validation';

export const LOCAL_DISCOVERY = '/groups-local-preview?tab=creatorverse';
export const LOCAL_DRAFT = '/groups-local-preview/creatorverse/draft';
export function creatorVersePageHref(id: string) { return `/creatorverse/${pageId(id)}`; }
export function samplePageHref(id: string) { return `/groups-local-preview/creatorverse/${pageId(id)}`; }
/** Only use a server-authorized public profile projection, never a page's private owner_id. */
export function creatorProfileHref(creator: PublicCreator | null) {
  return creator?.canViewProfile === true && creator.profileId ? `/profile/${pageId(creator.profileId)}` : null;
}
export type PublicCreator = { name: string; profileId: string | null; canViewProfile: boolean };
export type DiscoveryPage = { page: PublicPage; creator: PublicCreator | null; sample?: boolean };
export type DiscoveryFilter = { search: string; category: CreatorVerseCategory | '' };
export function parseDiscoveryFilter(params: URLSearchParams): DiscoveryFilter {
  const parsed = directoryQuery(params);
  return { search: parsed.search, category: (parsed.category ?? '') as DiscoveryFilter['category'] };
}
export function discoveryQuery(filter: DiscoveryFilter, offset = 0) {
  const params = new URLSearchParams();
  if (filter.search.trim()) params.set('search', filter.search.trim());
  if (filter.category) params.set('category', filter.category);
  params.set('offset', String(offset));
  directoryQuery(params);
  return params.toString();
}
export function uniqueDiscoveryPages(rows: readonly DiscoveryPage[]) {
  const seen = new Set<string>();
  return rows.filter(({ page }) => {
    const id = pageId(page.id).toLowerCase();
    if (seen.has(id)) return false;
    seen.add(id); return true;
  });
}
/** Local samples only. Hosted reads use readDirectory + RLS, never this client-side filter as authorization. */
export function filterDiscoveryPages(rows: readonly DiscoveryPage[], filter: DiscoveryFilter) {
  discoveryQuery(filter);
  const words = filter.search.trim().normalize('NFKC').toLowerCase().split(/\s+/).filter(Boolean);
  return uniqueDiscoveryPages(rows).filter(({ page, creator }) => {
    if (filter.category && page.category !== filter.category) return false;
    const haystack = [page.name, page.short_bio, page.description, CREATORVERSE_CATEGORIES[page.category], creator?.name ?? ''].join(' ').normalize('NFKC').toLowerCase();
    return words.every(word => haystack.includes(word));
  });
}
