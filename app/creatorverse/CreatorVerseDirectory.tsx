'use client';
import { useSearchParams } from 'next/navigation';
import { usePublicRead } from '@/lib/creatorverse/usePublicRead';
import { directoryQuery } from '@/lib/creatorverse/validation';
import { discoveryQuery, parseDiscoveryFilter, type DiscoveryFilter } from '@/lib/creatorverse/discovery';
import type { DirectoryResult } from '@/lib/creatorverse/types';
import CreatorVerseDiscovery, { DiscoverySearch } from './CreatorVerseDiscovery';
import styles from './creatorverse.module.css';

export default function CreatorVerseDirectory() {
  const params = useSearchParams();
  let filter: DiscoveryFilter, offset: number;
  try {
    const query = new URLSearchParams(params.toString());
    filter = parseDiscoveryFilter(query); offset = directoryQuery(query).offset;
  } catch {
    return <section className={styles.empty} role="alert"><h2>This search is not valid</h2><button type="button" onClick={() => window.history.replaceState(null, '', '/creatorverse')}>Reset search</button></section>;
  }
  return <PublicDirectory filter={filter} offset={offset}/>;
}
function PublicDirectory({ filter, offset }: { filter: DiscoveryFilter; offset: number }) {
  const { data, loading, error, retry } = usePublicRead<DirectoryResult>(`/api/creatorverse?${discoveryQuery(filter, offset)}`);
  function navigate(next: DiscoveryFilter, nextOffset = 0) { window.history.replaceState(null, '', `/creatorverse?${discoveryQuery(next, nextOffset)}`); }
  return <section aria-label="CreatorVerse pages">
    <DiscoverySearch value={filter.search} onChange={search => navigate({ ...filter, search })} placeholder="Search page names or descriptions"/>
    <CreatorVerseDiscovery rows={(data?.pages ?? []).map(page => ({ page, creator: null }))} filter={filter} onFilter={next => navigate(next)} loading={loading} error={error} retry={retry}/>
    {!error && <nav className={styles.pagination} aria-label="CreatorVerse result pages">
      {offset > 0 && <button type="button" disabled={loading} onClick={() => navigate(filter, Math.max(0, offset - 20))}>Previous pages</button>}
      {data?.nextOffset != null && <button type="button" disabled={loading} onClick={() => navigate(filter, data.nextOffset!)}>Next pages</button>}
    </nav>}
  </section>;
}
