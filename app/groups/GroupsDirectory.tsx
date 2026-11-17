'use client';
import Link from 'next/link';
import { useRef, useState, type ReactNode } from 'react';
import type { Group } from '@/lib/groups/types';
import { ownsGroup, selectMyGroups, type DirectorySort, type GroupPreferences, type MineFilter } from '@/lib/groups/directory';
import styles from './groups.module.css';
import creatorCardStyles from '@/app/creatorverse/CreatorVerseDiscovery.module.css';
import { GroupsLoadingCards } from './GroupsLoadingView';
import CreatorVerseLandingPreview from './CreatorVerseLandingPreview';
import { DiscoverySearch } from '@/app/creatorverse/CreatorVerseDiscovery';
import type { DiscoveryFilter } from '@/lib/creatorverse/discovery';
import { CREATORVERSE_CATEGORIES } from '@/lib/creatorverse/types';
import { useCreatorVerseStaging } from './CreatorVerseStagingProvider';


export type DirectoryTab = 'all' | 'public' | 'private' | 'mine';
export function DirectoryHeading({ mine, create = false, creatorVerse = false, onCreate, createLabel = '+ Create Group' }: { mine: boolean; create?: boolean; creatorVerse?: boolean; onCreate: () => void; createLabel?: string }) {
  const stage = useCreatorVerseStaging();
  const preview = stage.enabled && stage.selected;
  const creating = create || (preview && stage.formOpen);
  const desktopTitle = create ? 'Create a Group' : (creatorVerse || preview) ? 'Discover CreatorVerse' : mine ? 'My Groups' : 'Discover Groups';
  const createGroup = () => {
    if (preview) {
      stage.setSelected(false);
      stage.setFormOpen(false);
      window.history.pushState(null, '', '/groups?tab=all');
    }
    onCreate();
  };
  const createCreatorVerse = () => {
    if (!stage.enabled) return;
    if (create) onCreate();
    stage.setSelected(true);
    stage.setFormOpen(true);
    window.history.pushState(null, '', '/groups?tab=creatorverse');
  };
  return <section className={`${styles.hero} ${styles.directoryHero}`}>
    <div className={styles.desktopDirectoryHeading}>
      <p className={styles.eyebrow}>COMMUNITY CONNECTIONS</p><h1>{desktopTitle}</h1>
      <p>{create ? 'Bring your community together. Give your Group a name and a place to call home.' : (creatorVerse || preview) ? 'Explore creator pages, projects and communities.' : mine ? 'Your groups, organized for quick and easy access.' : 'Connect, share and explore communities.'}</p>
    </div>
    <button className={styles.desktopDirectoryCreate} onClick={preview ? () => stage.setFormOpen(!stage.formOpen) : onCreate}
      aria-expanded={creating}>{creating ? 'Cancel' : preview ? '+ Create CreatorVerse Page' : createLabel}</button>
    <div className={styles.mobileDirectoryHeading}>
      <h1>{create ? 'Create a Group' : (preview && stage.formOpen) ? 'Create CreatorVerse Page' : 'Find Your Community'}</h1>
      {creating ? <button type="button" className={styles.mobileCreateAction} aria-label="Cancel creating" onClick={preview ? () => stage.setFormOpen(false) : onCreate}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M5 5l14 14M19 5L5 19"/></svg>
      </button> : <details className={styles.mobileCreateMenu}>
        <summary aria-label="Create a Group or CreatorVerse page" title="Create">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>
        </summary>
        <div className={styles.mobileCreateOptions}>
          <button type="button" onClick={createGroup}>Create Group</button>
          {stage.enabled && <button type="button" onClick={createCreatorVerse}>Create CreatorVerse Page</button>}
        </div>
      </details>}
    </div>
  </section>;
}
function PrivacyIcon({ privateGroup }: { privateGroup: boolean }) {
  return <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">{privateGroup ? <><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></> : <><circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18M5 6h14M5 18h14"/></>}</svg>;
}
const filters: [MineFilter, string][] = [['all', 'All My Groups'], ['owned', 'Groups I Own'], ['joined', 'Joined Groups'], ['favorites', 'Favorites'], ['recent', 'Recently Visited']];

function DirectoryTabIcon({ value }: { value: string }) {
  const common = { viewBox: '0 0 24 24', width: 23, height: 23, fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true as const };
  if (value === 'all') return <svg {...common}><circle cx="12" cy="12" r="9"/><path d="m15.6 8.4-2.2 5-5 2.2 2.2-5z"/></svg>;
  if (value === 'public') return <svg {...common}><circle cx="9" cy="8" r="3"/><path d="M3 20v-2a6 6 0 0 1 12 0v2M16 5.5a3 3 0 0 1 0 5.8M17 14a5 5 0 0 1 4 5v1"/></svg>;
  if (value === 'creatorverse') return <svg {...common}><path d="m12 2 1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8L12 2ZM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8L19 16Z"/></svg>;
  if (value === 'mine') return <svg {...common}><rect x="5" y="4" width="14" height="16" rx="2"/><path d="M9 8h6M9 12h6M9 16h4"/></svg>;
  return <svg {...common}><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 3v4h6V3"/></svg>;
}

type Props = {
  groups: Group[]; viewerId: string; tab: DirectoryTab; onTab: (tab: DirectoryTab) => void;
  search: string; onSearch: (value: string) => void; loading: boolean;
  preferences: GroupPreferences; toggleFavorite: (id: string) => void; recordVisit: (id: string) => void;
  renderCover: (group: Group) => ReactNode; renderMembership: (group: Group) => ReactNode;
  routeBase?: string; onOpen?: (group: Group) => void; storageError?: string;
  /** Local preview only. Default callers keep the existing Private tab. */
  creatorVersePreview?: boolean;
  creatorVerseActive?: boolean;
  creatorVerseSearch?: ReactNode;
  creatorVerseContent?: ReactNode;
  onCreatorVerseChange?: (active: boolean) => void;
};

export default function GroupsDirectory({ groups, viewerId, tab, onTab, search, onSearch, loading, preferences, toggleFavorite, recordVisit, renderCover, renderMembership, routeBase = '/groups', onOpen, storageError, onCreatorVerseChange, creatorVersePreview = false, creatorVerseActive = false, creatorVerseSearch, creatorVerseContent }: Props) {
  const stage = useCreatorVerseStaging();
  const [stageFilter, setStageFilter] = useState<DiscoveryFilter>({
    search: '', category: '',
  });
  const [mineView, setMineView] = useState<MineFilter>('all');
  const [sort, setSort] = useState<DirectorySort>('name');
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const results = useRef<HTMLDivElement>(null);
  const [heldHeight, setHeldHeight] = useState(0);
  const allowCreatorVerse =
    (process.env.NODE_ENV === 'development' && creatorVersePreview)
    || stage.enabled;
  const showCreatorVerse =
    allowCreatorVerse && (creatorVerseActive || stage.selected);
  const mine = tab === 'mine' && !showCreatorVerse;
  const owned = (group: Group) => ownsGroup(group, viewerId);
  const select = (filter: MineFilter, query = search) => selectMyGroups(groups, viewerId, preferences, filter, query, sort);
  const sortedDirectoryGroups = sort === 'members'
    ? [...groups].sort((a, b) => (b.member_count ?? 0) - (a.member_count ?? 0))
    : groups;
  const sections = mine
    ? (mineView === 'all' ? (['owned', 'favorites', 'recent', 'joined'] as MineFilter[]) : [mineView]).map(key => ({ key, title: filters.find(([value]) => value === key)![1], items: select(key) }))
    : [{ key: 'directory', title: '', items: sortedDirectoryGroups }];
  const mineEmpty = mine && sections.every(section => section.items.length === 0);
  function viewAll(value: MineFilter) {
    setMineView(value);
    requestAnimationFrame(() => results.current?.focus({ preventScroll: true }));
  }
  return <div className={styles.directoryBrowser}>
    <div className={styles.directoryControls}>
      <label className={styles.mobileDirectorySearch}>
        <span className={styles.visuallyHidden}>{showCreatorVerse ? 'Search CreatorVerse' : 'Search Groups'}</span>
        <span className={styles.mobileDirectorySearchField}>
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="10" cy="10" r="7"/><path d="m15 15 6 6"/></svg>
          <input type="search" maxLength={100} placeholder="Search anything on Parapost" value={showCreatorVerse ? stageFilter.search : search}
            onChange={event => showCreatorVerse
              ? setStageFilter(current => ({ ...current, search: event.target.value }))
              : onSearch(event.target.value)} />
        </span>
      </label>
      <nav className={styles.tabs} aria-label="Filter Groups">{([['all', 'Discover'], ['public', 'Public'], [allowCreatorVerse ? 'creatorverse' : 'private', allowCreatorVerse ? 'CreatorVerse' : 'Private'], ['mine', 'My Groups']] as const).map(([value, label]) =>
        <button type="button" key={value} aria-pressed={value === 'creatorverse' ? showCreatorVerse : !showCreatorVerse && tab === value} onClick={() => {
          setMobileFiltersOpen(false);
          if (value === 'creatorverse') {
            if (stage.enabled) stage.setSelected(true);
            onCreatorVerseChange?.(true);
            return;
          }
          if (stage.enabled) {
            stage.setSelected(false);
            stage.setFormOpen(false);
          }
          onCreatorVerseChange?.(false);
          if (value === tab && !showCreatorVerse) return;
          setHeldHeight(Math.ceil(results.current?.getBoundingClientRect().height ?? 0));
          setMineView('all');
          onTab(value);
        }}><span className={styles.directoryTabIcon}><DirectoryTabIcon value={value}/></span><span className={styles.directoryTabLabel}>{label}</span></button>)}</nav>
      <div className={`${styles.desktopDirectorySearch} ${mine ? styles.myGroupsSearchSort : ""}`}>
        {showCreatorVerse
          ? (creatorVerseSearch ?? (stage.enabled
              ? <DiscoverySearch value={stageFilter.search} onChange={value => setStageFilter(current => ({ ...current, search: value }))} />
              : null))
          : <label className={styles.search}>{mine ? 'Search My Groups' : 'Search Groups'}<span className={styles.directorySearchInput}>
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><circle cx="10" cy="10" r="7"/><path d="m15 15 6 6"/></svg>
              <input type="search" maxLength={100} placeholder={mine ? 'Search your groups…' : 'Search by name or description'} value={search} onChange={event => onSearch(event.target.value)}/>
            </span></label>}
        {mine && <label className={`${styles.directorySort} ${styles.desktopGroupSort}`}>Sort by:<select value={sort} onChange={event => setSort(event.target.value as DirectorySort)}><option value="name">Name A–Z</option><option value="members">Member count</option><option value="visited">Recently visited</option></select></label>}
      </div>
      <details className={styles.desktopDirectoryFilter} style={mine ? { visibility: "hidden" } : undefined}>
        <summary><svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M4 7h16M7 12h10M10 17h4"/><circle cx="9" cy="7" r="2" fill="currentColor" stroke="none"/><circle cx="15" cy="12" r="2" fill="currentColor" stroke="none"/></svg>Filter</summary>
        <div className={styles.desktopFilterOptions}>
          {showCreatorVerse ? <label>CreatorVerse category
            <select value={stageFilter.category} onChange={event => setStageFilter(current => ({ ...current, category: event.target.value as DiscoveryFilter['category'] }))}>
              <option value="">All CreatorVerse pages</option>
              {Object.entries(CREATORVERSE_CATEGORIES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label> : mine ? null : <label>Sort Groups
            <select value={sort} onChange={event => setSort(event.target.value as DirectorySort)}>
              <option value="name">Name A–Z</option>
              <option value="members">Most members</option>
              {mine && <option value="visited">Recently visited</option>}
            </select>
          </label>}
        </div>
      </details>
    </div>
    <div className={styles.mobileDiscoveryBar}>
      <h2>{showCreatorVerse ? 'Discover CreatorVerse' : mine ? 'My Groups' : 'Discover Groups'}</h2>
      <button type="button" className={styles.mobileFilterToggle} aria-expanded={mobileFiltersOpen}
        aria-controls={mine ? "groups-mine-filter-row" : "groups-mobile-filter-panel"} onClick={() => setMobileFiltersOpen(value => !value)}>
        <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M4 7h16M7 12h10M10 17h4"/><circle cx="9" cy="7" r="2" fill="currentColor" stroke="none"/><circle cx="15" cy="12" r="2" fill="currentColor" stroke="none"/></svg>
        Filter
      </button>
    </div>
    {!mine && <div id="groups-mobile-filter-panel" className={styles.mobileFilterPanel} hidden={!mobileFiltersOpen}>
      {!mine && !showCreatorVerse && (
      <div className={styles.containedMobileSort}>
        <span>Sort results on this page</span>
        <details className={styles.containedMobileSortMenu}>
          <summary>
            {sort === 'members' ? 'Most members' : 'Default order'}
            <span aria-hidden="true">⌄</span>
          </summary>
          <div className={styles.containedMobileSortOptions}>
            <button
              type="button"
              aria-pressed={sort !== 'members'}
              onClick={event => {
                setSort('name');
                event.currentTarget.closest('details')?.removeAttribute('open');
              }}
            >
              Default order
            </button>
            <button
              type="button"
              aria-pressed={sort === 'members'}
              onClick={event => {
                setSort('members');
                event.currentTarget.closest('details')?.removeAttribute('open');
              }}
            >
              Most members
            </button>
          </div>
        </details>
      </div>
    )}
      {showCreatorVerse && <p>Choose a CreatorVerse category below.</p>}
    </div>}
    {mine && <>
      <div id="groups-mine-filter-row" className={`${styles.directoryFilterRow} ${mobileFiltersOpen ? styles.mobileFilterContentOpen : styles.mobileFilterContentClosed}`}>
        <ContainedGroupMobileMenu
          label="Filter My Groups"
          value={mineView}
          items={filters}
          onChange={setMineView}
        />
        <div className={styles.myGroupsFilters} role="group" aria-label="My Groups filters">{filters.map(([value, label]) => <button key={value} aria-pressed={mineView === value} onClick={() => setMineView(value)}>{label}{loading ? ' (…)' : ` (${select(value, '').length})`}</button>)}</div>
        <ContainedGroupMobileMenu
          label="Sort by"
          value={sort}
          items={[
            ['name', 'Name A–Z'],
            ['members', 'Member count'],
            ['visited', 'Recently visited']
          ] as const}
          onChange={setSort}
        />
      </div>
      <p className={styles.directoryLocalNote}>{storageError || 'Favorites and visits are saved for this account in this browser.'}</p>
    </>}
    <div className={styles.desktopDirectoryResultsHeading}>
      <h2>{showCreatorVerse ? 'CreatorVerse pages' : mine ? 'My Groups' : `Groups (${sections[0].items.length})`}</h2>
      {!showCreatorVerse && <span>Sort: {sort === 'members' ? 'Most members' : sort === 'visited' ? 'Recently visited' : 'Name A–Z'}</span>}
    </div>
    <div ref={results} tabIndex={-1} aria-busy={loading} data-groups-directory-preview={showCreatorVerse ? 'true' : undefined}
      className={styles.directoryResults}
      style={loading && heldHeight > 0 ? { minHeight: heldHeight } : undefined}>
      {mineEmpty && !loading && <div className={styles.mobileMineEmpty}><h3>No groups yet</h3><p>Groups you own or join will appear here.</p></div>}
      {showCreatorVerse
      ? (creatorVerseContent ?? (stage.enabled
          ? <CreatorVerseLandingPreview
              formOpen={stage.formOpen}
              onCancelForm={() => stage.setFormOpen(false)}
              filter={stageFilter}
              onFilter={setStageFilter}
              mobileFiltersOpen={mobileFiltersOpen}
            />
          : null))
      : loading ? <GroupsLoadingCards /> : sections.map(section => <section key={section.key} className={`${styles.directorySection} ${creatorCardStyles.discovery}`} aria-label={section.title || 'Group results'}>
        {section.title && <div className={styles.directorySectionHeading}><h2>{section.title} <span>({section.items.length})</span></h2>
          {mineView === 'all' && section.items.length > 0 && <button className={styles.viewAll} onClick={() => viewAll(section.key as MineFilter)} aria-label={`View all ${section.title.toLowerCase()}`}>View All <span aria-hidden="true">→</span></button>}
          {mineView !== 'all' && <button className={styles.viewAll} onClick={() => setMineView('all')}>← Back to All My Groups</button>}
        </div>}
        <div className={`${styles.directoryCardGrid} ${creatorCardStyles.cardGrid}`}>{(mine && mineView === 'all' ? section.items.slice(0, 3) : section.items).map(group => {
          const favorite = preferences.favorites.includes(group.id);
          const approved = group.membership_status === 'approved';
          const cardContents = <><div className={styles.directoryAvatar}
              style={{
                width: 44,
                height: 44,
                minWidth: 44,
                minHeight: 44,
                boxSizing: 'border-box',
                flexShrink: 0,
                borderRadius: '50%',
                overflow: 'hidden',
                display: 'grid',
                placeItems: 'center'
              }}>{renderCover(group)}</div><div className={`${creatorCardStyles.content} ${styles.directoryCardText}`}>
            <h3>{group.name}</h3>
            {group.description && <p className={styles.desktopDirectoryCardDescription}>{group.description}</p>}
            <p className={creatorCardStyles.description}>{group.member_count !== null ? `${group.member_count} ${group.member_count === 1 ? 'member' : 'members'}` : 'Member count unavailable'}</p>
            <div className={styles.directoryCardLabel}>{owned(group) && <span className={styles.ownerTag}>Owner</span>}
              {favorite && <span className={styles.favoriteTag}>★ Favorite</span>}
              {section.key === 'recent' && <span className={styles.visitedTag}>◷ Recently visited</span>}
              <span className={styles.privacyTag}><PrivacyIcon privateGroup={group.visibility === 'private'}/>{group.visibility === 'private' ? 'Private' : 'Public'}</span>
            </div>
          </div><span className={styles.directoryChevron} aria-hidden="true">›</span></>;
          return <article key={group.id} className={`${styles.directoryCard} ${creatorCardStyles.card}`}>
            {onOpen ? <button className={`${styles.directoryOpen} ${creatorCardStyles.open} ${styles.directoryOpenAvatarFit}`} onClick={() => { recordVisit(group.id); onOpen(group); }} aria-label={`Open ${group.name}`}>{cardContents}</button>
              : <Link className={`${styles.directoryOpen} ${creatorCardStyles.open} ${styles.directoryOpenAvatarFit}`} href={`${routeBase}/${group.id}`} onClick={() => { if (approved) recordVisit(group.id); }} aria-label={`Open ${group.name}`}>{cardContents}</Link>}
            {approved && <button className={styles.favoriteToggle} aria-pressed={favorite} aria-label={`${favorite ? 'Remove' : 'Add'} ${group.name} ${favorite ? 'from' : 'to'} favorites`} onClick={() => toggleFavorite(group.id)}>{favorite ? '★' : '☆'}</button>}

          </article>;
        })}</div>
        {!section.items.length && !mine && <div className={styles.mobileDiscoverEmpty}><h3>Discover something new</h3><p>Find communities and creators that interest you.</p></div>}
        {!section.items.length && <p className={styles.directoryEmpty}>{search ? 'No groups match your search in this section.' : section.key === 'favorites' ? 'Star a group to keep it close.' : section.key === 'recent' ? 'Groups you open will appear here.' : section.key === 'owned' ? 'Groups you create will appear here.' : section.key === 'joined' ? 'Join a community to see it here.' : 'No groups found. Try another search or filter.'}</p>}
      </section>)}
    </div>
  </div>;
}


function ContainedGroupMobileMenu<T extends string>({
  label, value, items, onChange
}: {
  label: string;
  value: T;
  items: readonly (readonly [T, string])[];
  onChange: (next: T) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = items.find(([key]) => key === value)?.[1] ?? label;

  return <div className={styles.mobileGroupDropdown}>
    <span>{label}</span>
    <button
      type="button"
      className={styles.mobileGroupTrigger}
      aria-label={`${label}: ${selected}`}
      aria-expanded={open}
      onClick={() => setOpen(current => !current)}
    >
      <span>{selected}</span>
      <span aria-hidden="true">{open ? '▴' : '▾'}</span>
    </button>
    {open && <div
      className={styles.mobileGroupOptions}
      role="group"
      aria-label={`${label} choices`}
      onKeyDown={event => {
        if (event.key === 'Escape') setOpen(false);
      }}
    >
      {items.map(([key, name]) =>
        <button
          key={key}
          type="button"
          className={styles.mobileGroupOption}
          aria-pressed={value === key}
          onClick={() => {
            onChange(key);
            setOpen(false);
          }}
        >
          <span>{name}</span>
          {value === key && <span aria-hidden="true">✓</span>}
        </button>
      )}
    </div>}
  </div>;
}
