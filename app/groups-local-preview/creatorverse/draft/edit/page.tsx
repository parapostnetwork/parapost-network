'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import CreatorVersePageForm from '@/app/creatorverse/CreatorVersePageForm';
import type { PageFields } from '@/lib/creatorverse/types';
import { validatePageFields } from '@/lib/creatorverse/validation';
import styles from '../draft.module.css';

const DRAFT_KEY = 'parapost.creatorverse.localDraft.v1';

export default function LocalDraftEditor() {
  const router = useRouter();
  const [draft, setDraft] = useState<PageFields | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(DRAFT_KEY);
      if (raw) setDraft(validatePageFields(JSON.parse(raw)));
    } catch {
      setDraft(null);
    } finally {
      setReady(true);
    }
  }, []);

  if (!ready) return <main className={styles.shell}>Loading draft...</main>;

  return (
    <main className={styles.shell}>
      <Link className={styles.back} href="/groups-local-preview/creatorverse/draft">
        ← Back to Business Page
      </Link>
      {draft ? (
        <CreatorVersePageForm
          initial={draft}
          heading="Edit your CreatorVerse page"
          buttonLabel="Save Draft"
          onSave={async fields => {
            window.localStorage.setItem(DRAFT_KEY, JSON.stringify(fields));
            router.push('/groups-local-preview/creatorverse/draft');
          }}
        />
      ) : (
        <p>No saved draft found. Create one from the CreatorVerse tab.</p>
      )}
    </main>
  );
}
