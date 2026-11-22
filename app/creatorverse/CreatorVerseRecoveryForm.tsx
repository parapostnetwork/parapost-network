'use client';
import { isCommunityProductionTarget } from '@/lib/community/release-target';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useGroupSession } from '@/lib/groups/useGroupSession';
import { createCreatorVersePageDraft, recoverPages } from '@/lib/creatorverse/create-page-draft';
import { clearRecovery, readRecovery, saveRecovery, type DraftInput, type Recovery, type RecoveryPage } from '@/lib/creatorverse/draft-recovery';
import CreatorVersePageForm from './CreatorVersePageForm';

export default function CreatorVerseRecoveryForm() {
  const session = useGroupSession();
  if (!session.ready) return <p role="status">Checking your account…</p>;
  if (!session.userId) return <p>Sign in to create or resume your CreatorVerse page.</p>;
  // An account change unmounts every field, file selection and recovery message.
  return <AccountDraft key={session.userId} owner={session.userId} />;
}

function AccountDraft({ owner }: { owner: string }) {
  const [initial, setInitial] = useState<Recovery | null>();
  const [pages, setPages] = useState<RecoveryPage[]>([]);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const finished = useRef(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        setError('');
        setInitial(undefined);
        const local = readRecovery(owner);
        const found = await recoverPages(owner, local?.pageId);
        if (!active) return;
        if (local?.pageId && found[0]?.status === 'active') {
          finished.current = true;
          clearRecovery(owner);
          window.location.assign(`/creatorverse/${encodeURIComponent(local.pageId)}`);
          return;
        }
        setPages(found);
        setInitial(local);
      } catch (failure) {
        if (active) setError(failure instanceof Error ? failure.message : 'Unable to recover your page.');
      }
    }
    void load();
    return () => { active = false; };
  }, [owner, revision]);

  const preserve = useCallback((input: DraftInput, images: { logo: File | null; cover: File | null }) => {
    if (finished.current || !alive.current) return;
    try {
      const current = readRecovery(owner);
      saveRecovery(owner, {
        ...(current ?? { version: 1, owner, images: {} }), ...input,
        images: { ...current?.images,
          ...(images.logo ? { logo: images.logo.name } : {}),
          ...(images.cover ? { cover: images.cover.name } : {}),
        },
      });
      setError('');
    } catch {
      setError('Your browser could not save recovery information. Keep this page open and free browser storage before continuing.');
    }
  }, [owner]);

  function resume(page: RecoveryPage) {
    try {
      const recovery: Recovery = { version: 1, owner, pageId: page.id, fields: page.fields, linkLabel: '', linkUrl: '', images: {} };
      saveRecovery(owner, recovery);
      setRevision(value => value + 1);
    } catch { setError('Unable to save recovery information in this browser.'); }
  }

  return <>
    {error && <p role="alert">{error}</p>}
    {initial === undefined ? <button type="button" onClick={() => setRevision(value => value + 1)}>Retry draft recovery</button> : <>
      {!initial?.pageId && pages.length > 0 && <section aria-label="Unfinished pages">
        <p>Resume an unfinished page:</p>
        {pages.map(page => <button key={page.id} type="button" disabled={busy} onClick={() => resume(page)}>{page.fields.name}</button>)}
      </section>}
      <p role="note">Your page details are saved for this account in this browser. Saved logo and cover images are kept when resuming. If an upload was interrupted, you may need to reselect that file.</p>
      <CreatorVersePageForm key={`${owner}:${revision}`} stagingPageCreation
        initial={initial?.fields} initialLinkLabel={initial?.linkLabel} initialLinkUrl={initial?.linkUrl}
        onDraftChange={preserve}
        buttonLabel={isCommunityProductionTarget(process.env.NEXT_PUBLIC_SUPABASE_URL)
          ? (initial?.pageId || initial?.creation ? 'Resume Page' : 'Create Page')
          : (initial?.pageId || initial?.creation ? 'Resume Staging Page' : 'Create Staging Page')}
        successMessage="Page activation confirmed."
        onSave={async (fields, images) => {
          setBusy(true);
          try {
            const id = await createCreatorVersePageDraft(fields, images, owner);
            if (!alive.current) return;
            finished.current = true;
            window.location.assign(`/creatorverse/${encodeURIComponent(id)}`);
          } finally { if (alive.current) setBusy(false); }
        }} />
    </>}
  </>;
}
