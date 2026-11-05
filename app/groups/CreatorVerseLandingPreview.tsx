'use client';

import Link from 'next/link';

import styles from './CreatorVerseLandingPreview.module.css';
import CreatorVerseDiscovery from '@/app/creatorverse/CreatorVerseDiscovery';
import discoveryStyles from '@/app/creatorverse/CreatorVerseDiscovery.module.css';
import { filterDiscoveryPages, LOCAL_DRAFT, type DiscoveryFilter } from '@/lib/creatorverse/discovery';
import { CREATORVERSE_SAMPLES } from '@/app/groups-local-preview/creatorverse/samples';
import CreatorVersePageForm from '@/app/creatorverse/CreatorVersePageForm';
import CreatorVerseStagingResults from './CreatorVerseStagingResults';
import { createCreatorVersePageDraft } from '@/lib/creatorverse/create-page-draft';
import { useMemo, useState, useSyncExternalStore } from 'react';
import type { PageFields } from '@/lib/creatorverse/types';
import { validatePageFields } from '@/lib/creatorverse/validation';


const DRAFT_KEY = 'parapost.creatorverse.localDraft.v1';
const SHOW_STAGING_DATA =
  process.env.NODE_ENV === 'development' &&
  process.env.NEXT_PUBLIC_CREATORVERSE_REAL_DIRECTORY === 'true' &&
  process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, '') ===
    'https://vmgelrgrtpghmvqgufzz.supabase.co';
const REAL_PAGE_DRAFTS_APPROVED = false;

const subscribeHydration = () => () => {};

function useClientReady() {
  return useSyncExternalStore(
    subscribeHydration,
    () => true,
    () => false
  );
}

function readSavedDraft(): PageFields | null {
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY);
    return raw ? validatePageFields(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}


function LocalCreatorVerseDraftForm({
  onSaved,
}: {
  onSaved?: (fields: PageFields) => void;
}) {
  const ready = useClientReady();
  const initial = useMemo(
    () => ready ? readSavedDraft() ?? undefined : undefined,
    [ready]
  );

  if (!ready) {
    return <p>Loading local draft...</p>;
  }

  return (
    <CreatorVersePageForm
      initial={initial}
      buttonLabel={REAL_PAGE_DRAFTS_APPROVED ? "Create Page Draft" : "Save Draft"}
      successMessage={REAL_PAGE_DRAFTS_APPROVED ? "Page activated in staging. Images and extra details are not saved yet." : "Draft saved in this browser. Image files were not saved."}
      onSave={async (fields, images) => {
          if (REAL_PAGE_DRAFTS_APPROVED) {
            await createCreatorVersePageDraft(fields, images);
            return;
          }
        window.localStorage.setItem(
          DRAFT_KEY,
          JSON.stringify(fields)
        );
        onSaved?.(fields);
      }}
    />
  );
}

export default function CreatorVerseLandingPreview({
  formOpen = false, onCancelForm, filter, onFilter, state = '', retry,
}: {
  formOpen?: boolean; onCancelForm?: () => void;
  filter: DiscoveryFilter; onFilter: (filter: DiscoveryFilter) => void;
  state?: string; retry?: () => void;
}) {
  const [savedDraft, setSavedDraft] = useState<PageFields | null>(null);
  const ready = useClientReady();
  const visibleDraft = savedDraft ?? (ready ? readSavedDraft() : null);
  if (formOpen) return <section className={styles.root}>
    <button type="button" className={styles.backButton} onClick={onCancelForm}>← Back to CreatorVerse</button>
    <LocalCreatorVerseDraftForm onSaved={setSavedDraft} />
  </section>;
  // A saved browser draft is a separate workspace shortcut, NEVER a public discovery result.
  return <>
    {visibleDraft && <aside className={discoveryStyles.draft} aria-label="Your saved draft">Your page draft<Link href={LOCAL_DRAFT}>{visibleDraft.name} →</Link></aside>}
    {SHOW_STAGING_DATA ? (
        <CreatorVerseStagingResults
          key={`${filter.search}:${filter.category}`}
          filter={filter}
          onFilter={onFilter}
        />
      ) : (
        <CreatorVerseDiscovery rows={state === 'empty' ? [] : filterDiscoveryPages(CREATORVERSE_SAMPLES, filter)} filter={filter} onFilter={onFilter}
      loading={!ready || state === 'loading'} error={state === 'error' ? 'Please try again in a moment.' : ''} retry={retry} />
      )}
  </>;
}
