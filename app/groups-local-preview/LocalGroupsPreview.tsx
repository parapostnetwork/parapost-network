'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import styles from '@/app/groups/groups.module.css';
import GroupsDirectory, { DirectoryHeading, type DirectoryTab } from '@/app/groups/GroupsDirectory';
import CreatorVerseLandingPreview from '@/app/groups/CreatorVerseLandingPreview';
import { GroupForm } from '@/app/groups/GroupsClient';
import { DiscoverySearch } from '@/app/creatorverse/CreatorVerseDiscovery';
import { parseDiscoveryFilter, type DiscoveryFilter } from '@/lib/creatorverse/discovery';
import { emptyGroupPreferences } from '@/lib/groups/directory';

export default function LocalGroupsPreview() {
  const params = useSearchParams();
  const [search, setSearch] = useState('');
  const [creatorVerseSearchDraft, setCreatorVerseSearchDraft] = useState<string | null>(null);
  const [creatorVerseFormOpen, setCreatorVerseFormOpen] = useState(false);
  const [groupFormOpen, setGroupFormOpen] = useState(false);
  const [groupPreviewMessage, setGroupPreviewMessage] = useState('');
  const creatorVerseSelected = params.get('tab') === 'creatorverse';
  const tab: DirectoryTab = params.get('tab') === 'mine' ? 'mine' : params.get('tab') === 'public' ? 'public' : 'all';
  let filter: DiscoveryFilter = { search: '', category: '' };
  let invalid = false;
  try { filter = parseDiscoveryFilter(new URLSearchParams(params.toString())); } catch { invalid = true; }
  function navigateTab(next: string) {
    setCreatorVerseSearchDraft(null);
    window.history.pushState(null, '', `/groups-local-preview?tab=${next}`);
    setCreatorVerseFormOpen(false);
    setGroupFormOpen(false);
    setGroupPreviewMessage('');
  }
  function updateFilter(next: DiscoveryFilter) {
    const query = new URLSearchParams({ tab: 'creatorverse' });
    if (next.search) query.set('search', next.search);
    if (next.category) query.set('category', next.category);
    window.history.replaceState(null, '', `/groups-local-preview?${query}`);
  }
  const activeCreatorVerseFilter: DiscoveryFilter = creatorVerseSearchDraft === null ? filter : { ...filter, search: creatorVerseSearchDraft };
  return <main className={styles.page}><div className={styles.shell}>
    <header className={styles.topbar}><Link href="/groups-local-preview">PARAPOST NETWORK</Link><span>Groups</span><Link href="/dashboard" prefetch={false}>← Dashboard</Link></header>
    <DirectoryHeading
      mine={tab === 'mine'}
      creatorVerse={creatorVerseSelected}
      create={!creatorVerseSelected && groupFormOpen}
      createLabel={creatorVerseSelected ? '+ Create CreatorVerse Page' : '+ Create Group'}
      onCreate={() => {
        if (creatorVerseSelected) {
          setCreatorVerseFormOpen(true);
          return;
        }
        setGroupFormOpen(value => !value);
        setGroupPreviewMessage('');
      }}
    />
    {groupFormOpen && !creatorVerseSelected ? <>
      <p className={styles.muted}>Local preview only. No Group will be created in the database.</p>
      <GroupForm
        busy={false}
        onSubmit={async (name, description, visibility, file) => {
          setGroupPreviewMessage(
            `Preview validated: ${name} (${visibility}). Description: ${description.length} characters. Cover: ${file ? file.name : 'default'}. No Group was created.`
          );
        }}
      />
      {groupPreviewMessage &&
        <p role="status" className={styles.muted}>{groupPreviewMessage}</p>}
    </> : <GroupsDirectory creatorVersePreview creatorVerseActive={creatorVerseSelected}
      onCreatorVerseChange={active => { if (active) navigateTab('creatorverse'); }}
      creatorVerseSearch={!creatorVerseFormOpen && <DiscoverySearch value={activeCreatorVerseFilter.search} onChange={search => { setCreatorVerseSearchDraft(search); updateFilter({ ...activeCreatorVerseFilter, search }); }} />}
      creatorVerseContent={invalid ? <div role="alert"><p>This search is not valid.</p><button type="button" onClick={() => updateFilter({ search: '', category: '' })}>Reset search</button></div> : <CreatorVerseLandingPreview formOpen={creatorVerseFormOpen} onCancelForm={() => setCreatorVerseFormOpen(false)} filter={activeCreatorVerseFilter} onFilter={next => { setCreatorVerseSearchDraft(next.search); updateFilter(next); }} state={params.get('state') ?? ''} retry={() => updateFilter(filter)} />}
      groups={[]} viewerId="" tab={tab} onTab={next => navigateTab(next)} search={search} onSearch={setSearch} loading={false}
      preferences={emptyGroupPreferences()} toggleFavorite={() => {}} recordVisit={() => {}} renderCover={() => null} renderMembership={() => null}/>}
  </div></main>;
}
