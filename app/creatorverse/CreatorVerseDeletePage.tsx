'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import type { PublicPage } from '@/lib/creatorverse/types';
import styles from './CreatorVerseDeletePage.module.css';

type DeleteResponse = {
  error?: string;
  page?: { id?: string; status?: string };
};

export default function CreatorVerseDeletePage({
  page,
  onCancel,
}: {
  page: PublicPage;
  onCancel: () => void;
}) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const matches = confirmation === page.name;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => {
      if (dialog?.open) dialog.close();
    };
  }, []);

  async function deletePage() {
    if (!matches || busy) return;

    setBusy(true);
    setError('');

    try {
      const { data, error: sessionError } = await supabase.auth.getSession();
      const token = data.session?.access_token;

      if (sessionError || !token) {
        throw new Error('Please sign in again to delete this page.');
      }

      const response = await fetch(
        `/api/creatorverse/pages/${encodeURIComponent(page.id)}/delete`,
        {
          method: 'DELETE',
          cache: 'no-store',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ confirmName: confirmation }),
        }
      );

      const result = await response.json().catch(() => ({})) as DeleteResponse;

      if (!response.ok || result.page?.id !== page.id || result.page?.status !== 'deleted') {
        throw new Error(result.error || 'Unable to delete this CreatorVerse page.');
      }

      // The page status was changed by the server. Direct public reads
      // and discovery now reject it; no personal Parapost account is touched.
      router.replace('/groups?tab=creatorverse');
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Unable to delete this page.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className={styles.dialog}
      aria-labelledby="creatorverse-delete-title"
      onClose={onCancel}
      onCancel={event => { if (busy) event.preventDefault(); }}
    >
      <h2 id="creatorverse-delete-title">Delete CreatorVerse Page?</h2>
      <p>
        This removes <strong>{page.name}</strong> from CreatorVerse discovery and
        makes its public page unavailable. This does not delete your Parapost account.
      </p>
      <p className={styles.notice}>
        Posts already shared elsewhere and stored media may remain until separate
        cleanup is completed. Do not use this option if you need immediate,
        permanent erasure of every associated record.
      </p>
      <label className={styles.label} htmlFor="creatorverse-delete-confirmation">
        Type <strong>{page.name}</strong> exactly to confirm
      </label>
      <input
        id="creatorverse-delete-confirmation"
        className={styles.input}
        value={confirmation}
        onChange={event => setConfirmation(event.target.value)}
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
        disabled={busy}
        maxLength={100}
      />
      {error && <p role="alert" className={styles.error}>{error}</p>}
      <div className={styles.actions}>
        <button
          type="button"
          onClick={() => dialogRef.current?.close()}
          disabled={busy}
          className={styles.cancel}
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => void deletePage()}
          disabled={!matches || busy}
          className={styles.delete}
        >
          {busy ? 'Deleting…' : 'Delete CreatorVerse Page'}
        </button>
      </div>
    </dialog>
  );
}
