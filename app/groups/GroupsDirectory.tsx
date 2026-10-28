'use client';
import { useRef, useState, type ReactNode } from 'react';
import type { Group } from '@/lib/groups/types';
import { ownsGroup, selectMyGroups, type DirectorySort, type GroupPreferences, type MineFilter } from '@/lib/groups/directory';
import styles from './groups.module.css';

export type DirectoryTab = 'all' | 'public' | 'private' | 'mine';
export function DirectoryHeading({ mine, create = false, onCreate }: { mine: boolean; create?: boolean; onCreate: () => void }) {
  return <section className={`${styles.hero} ${styles.directoryHero}`}>
    <div><p className={styles.eyebrow}>COMMUNITY CONNECTIONS</p><h1>{create ? 'Create a Group' : mine ? 'My Groups' : 'Discover Groups'}</h1>
      <p>{create ? 'Bring your community together. Give your Group a name and a place to call home.' : mine ? 'Your groups, organized for quick and easy access.' : 'Connect, share and explore communities.'}</p></div>
    <button onClick={onCreate} aria-expanded={create}>{create ? 'Cancel' : '+ Create Group'}</button>
  </section>;
}
function PrivacyIcon({ privateGroup }: { privateGroup: boolean }) {
  return <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">{privateGroup ? <><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></> : <><circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18M5 6h14M5 18h14"/></>}</svg>;
}
const filters: [MineFilter, string][] = [['all', 'All My Groups'], ['owned', 'Groups I Own'], ['joined', 'Joined Groups'], ['favorites', 'Favorites'], ['recent', 'Recently Visited']];

type Props = {
  groups: Group[]; viewerId: string; tab: DirectoryTab; onTab: (tab: DirectoryTab) => void;
  search: string; onSearch: (value: string) => void; loading: boolean;
  preferences: GroupPreferences; toggleFavorite: (id: string) => void; recordVisit: (id: string) => void;
  renderCover: (group: Group) => ReactNode; renderMembership: (group: Group) => ReactNode;
  routeBase?: string; onOpen?: (group: Group) => void; storageError?: string;
};

export default function GroupsDirectory({ groups, viewerId, tab, onTab, search, onSearch, loading, preferences, toggleFavorite, recordVisit, renderCover, renderMembership, routeBase = '/groups', onOpen, storageError }: Props) {
  const [mineView, setMineView] = useState<MineFilter>('all');
  const [sort, setSort] = useState<DirectorySort>('name');
  const results = useRef<HTMLDivElement>(null);
  const [heldHeight, setHeldHeight] = useState(0);
  const mine = tab === 'mine';
  const owned = (group: Group) => ownsGroup(group, viewerId);
  const select = (filter: MineFilter, query = search) => selectMyGroups(groups, viewerId, preferences, filter, query, sort);
  const sections = mine
    ? (mineView === 'all' ? (['owned', 'favorites', 'recent', 'joined'] as MineFilter[]) : [mineView]).map(key => ({ key, title: filters.find(([value]) => value === key)![1], items: select(key) }))
    : [{ key: 'directory', title: '', items: groups }];
  function viewAll(value: MineFilter) {
    setMineView(value);
    requestAnimationFrame(() => results.current?.focus({ preventScroll: true }));
  }
  return <div className={styles.directoryBrowser}>
    <div className={styles.directoryControls}>
      <nav className={styles.tabs} aria-label="Filter Groups">{([['all', 'Discover'], ['public', 'Public'], ['private', 'Private'], ['mine', 'My Groups']] as const).map(([value, label]) =>
        <button key={value} aria-pressed={tab === value} onClick={() => {
      if (value === tab) return;
      setHeldHeight(Math.ceil(results.current?.getBoundingClientRect().height ?? 0));
      setMineView('all');
      onTab(value);
    }}>{label}</button>)}</nav>
      <label className={styles.search}>{mine ? 'Search My Groups' : 'Search Groups'}<span className={styles.directorySearchInput}>
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><circle cx="10" cy="10" r="7"/><path d="m15 15 6 6"/></svg>
        <input type="search" maxLength={100} placeholder={mine ? 'Search your groups…' : 'Search by name or description'} value={search} onChange={event => onSearch(event.target.value)}/>
      </span></label>
    </div>
    {mine && <>
      <div className={styles.directoryFilterRow}>
        <div className={styles.myGroupsFilters} role="group" aria-label="My Groups filters">{filters.map(([value, label]) => <button key={value} aria-pressed={mineView === value} onClick={() => setMineView(value)}>{label}{!loading && ` (${select(value, '').length})`}</button>)}</div>
        <label className={styles.directorySort}>Sort by:<select value={sort} onChange={event => setSort(event.target.value as DirectorySort)}><option value="name">Name A–Z</option><option value="members">Member count</option><option value="visited">Recently visited</option></select></label>
      </div>
      <p className={styles.directoryLocalNote}>{storageError || 'Favorites and visits are saved for this account in this browser.'}</p>
    </>}
    <div ref={results} tabIndex={-1} aria-busy={loading}
      className={styles.directoryResults}
      style={loading && heldHeight > 0 ? { minHeight: heldHeight } : undefined}>
      {loading ? <div className={styles.directoryLoading} role="status">
        <span>Loading your communities…</span>
        <div className={styles.directorySkeleton} aria-hidden="true">
          {[0, 1, 2].map(index =>
            <div key={index} className={styles.directorySkeletonCard} />
          )}
        </div>
      </div> : sections.map(section => <section key={section.key} className={styles.directorySection} aria-label={section.title || 'Group results'}>
        {section.title && <div className={styles.directorySectionHeading}><h2>{section.title} <span>({section.items.length})</span></h2>
          {mineView === 'all' && section.items.length > 0 && <button className={styles.viewAll} onClick={() => viewAll(section.key as MineFilter)} aria-label={`View all ${section.title.toLowerCase()}`}>View All <span aria-hidden="true">→</span></button>}
          {mineView !== 'all' && <button className={styles.viewAll} onClick={() => setMineView('all')}>← Back to All My Groups</button>}
        </div>}
        <div className={styles.directoryCardGrid}>{(mine && mineView === 'all' ? section.items.slice(0, 3) : section.items).map(group => {
          const favorite = preferences.favorites.includes(group.id);
          const approved = group.membership_status === 'approved';
          const cardContents = <><div className={styles.directoryCardMedia}>{renderCover(group)}</div><div className={styles.directoryCardContent}>
            <h3>{group.name}</h3>
            <p className={styles.directoryCardMeta}>{group.member_count !== null ? `${group.member_count} ${group.member_count === 1 ? 'member' : 'members'}` : 'Member count unavailable'}</p>
            <div className={styles.directoryCardLabel}>{owned(group) && <span className={styles.ownerTag}>Owner</span>}
              {favorite && <span className={styles.favoriteTag}>★ Favorite</span>}
              {section.key === 'recent' && <span className={styles.visitedTag}>◷ Recently visited</span>}
              <span className={styles.privacyTag}><PrivacyIcon privateGroup={group.visibility === 'private'}/>{group.visibility === 'private' ? 'Private' : 'Public'}</span>
            </div>
          </div><span className={styles.directoryChevron} aria-hidden="true">›</span></>;
          return <article key={group.id} className={styles.directoryCard}>
            {onOpen ? <button className={styles.directoryOpen} onClick={() => { recordVisit(group.id); onOpen(group); }} aria-label={`Open ${group.name}`}>{cardContents}</button>
              : <a className={styles.directoryOpen} href={`${routeBase}/${group.id}`} onClick={() => { if (approved) recordVisit(group.id); }} aria-label={`Open ${group.name}`}>{cardContents}</a>}
            {approved && <button className={styles.favoriteToggle} aria-pressed={favorite} aria-label={`${favorite ? 'Remove' : 'Add'} ${group.name} ${favorite ? 'from' : 'to'} favorites`} onClick={() => toggleFavorite(group.id)}>{favorite ? '★' : '☆'}</button>}
            {!mine && !approved && <div className={styles.directoryCardActions}>{renderMembership(group)}</div>}
          </article>;
        })}</div>
        {!section.items.length && <p className={styles.directoryEmpty}>{search ? 'No groups match your search in this section.' : section.key === 'favorites' ? 'Star a group to keep it close.' : section.key === 'recent' ? 'Groups you open will appear here.' : section.key === 'owned' ? 'Groups you create will appear here.' : section.key === 'joined' ? 'Join a community to see it here.' : 'No groups found. Try another search or filter.'}</p>}
      </section>)}
    </div>
  </div>;
}
