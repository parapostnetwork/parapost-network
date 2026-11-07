'use client';

import { useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import type {
  PageFields,
  PublicPage,
} from '@/lib/creatorverse/types';
import CreatorVersePageForm from './CreatorVersePageForm';
import styles from './CreatorVerseEditDetails.module.css';

type Images = {
  logo: File | null;
  cover: File | null;
};

export default function CreatorVerseEditDetails({
  page,
  onCancel,
  onSaved,
}: {
  page: PublicPage;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();

    const body = document.body;
    const html = document.documentElement;
    const scrollPosition = window.scrollY;

    const previous = {
      position: body.style.position,
      top: body.style.top,
      left: body.style.left,
      right: body.style.right,
      width: body.style.width,
      overflow: body.style.overflow,
      htmlOverflow: html.style.overflow,
    };

    // Freeze the background, including mobile Safari.
    html.style.overflow = 'hidden';
    body.style.position = 'fixed';
    body.style.top = `-${scrollPosition}px`;
    body.style.left = '0';
    body.style.right = '0';
    body.style.width = '100%';
    body.style.overflow = 'hidden';

    return () => {
      html.style.overflow = previous.htmlOverflow;
      body.style.position = previous.position;
      body.style.top = previous.top;
      body.style.left = previous.left;
      body.style.right = previous.right;
      body.style.width = previous.width;
      body.style.overflow = previous.overflow;

      window.scrollTo(0, scrollPosition);
    };
  }, []);

  function close() {
    dialogRef.current?.close();
  }

  async function save(fields: PageFields, images: Images) {
    if (images.logo || images.cover) {
      throw new Error(
        'Image uploads are not connected yet. ' +
        'Clear selected images before saving page details.'
      );
    }

    const { data, error } = await supabase.auth.getSession();

    if (error || !data.session) {
      throw new Error('Please sign in to edit your page.');
    }

    const response = await fetch(
      `/api/creatorverse/pages/${encodeURIComponent(page.id)}/details`,
      {
        method: 'PATCH',
        cache: 'no-store',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${data.session.access_token}`,
        },
        body: JSON.stringify({
          name: fields.name,
          category: fields.category,
          short_bio: fields.short_bio,
          description: fields.description,
          website: fields.website,
          public_email: fields.public_email,
          location: fields.location,
          social_links: fields.social_links,
        }),
      }
    );

    const result = await response.json() as {
      error?: string;
      page?: { id: string };
    };

    if (!response.ok || result.page?.id !== page.id) {
      throw new Error(result.error ?? 'Unable to save page.');
    }

    onSaved();
  }

  return (
    <dialog
      ref={dialogRef}
      className={styles.dialog}
      onClose={onCancel}
      aria-label="Edit CreatorVerse page"
    >
      <div className={styles.topbar}>
        <span>Edit CreatorVerse Page</span>
        <button
          type="button"
          className={styles.close}
          onClick={close}
          aria-label="Close editor"
        >
          ×
        </button>
      </div>

      <p className={styles.note}>
        Update your page information, website, contact
        details and social links. Image uploads are not
        enabled yet.
      </p>

      <CreatorVersePageForm
        initial={page}
        heading="Edit Your Page"
        buttonLabel="Save Changes"
        onSave={save}
      />

      <button
        type="button"
        className={styles.cancel}
        onClick={close}
      >
        Cancel
      </button>
    </dialog>
  );
}
