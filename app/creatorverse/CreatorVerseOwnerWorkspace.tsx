'use client';

import { useEffect, useState } from 'react';
import CreatorVersePageForm from './CreatorVersePageForm';
import {
  CREATORVERSE_CATEGORIES,
  type PageFields,
} from '@/lib/creatorverse/types';
import styles from './creatorverse.module.css';

const example: PageFields = {
  name: 'My CreatorVerse Page',
  category: 'business',
  short_bio: 'Welcome to our official CreatorVerse page.',
  description: 'Discover our latest updates, projects and content.',
  website: null,
  social_links: [],
  public_email: null,
  location: '',
};

export default function CreatorVerseOwnerWorkspace() {
  const [page, setPage] = useState<PageFields>(example);
  const [editing, setEditing] = useState(false);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [notice, setNotice] = useState('');

  useEffect(() => () => {
    if (logoUrl) URL.revokeObjectURL(logoUrl);
  }, [logoUrl]);

  useEffect(() => () => {
    if (coverUrl) URL.revokeObjectURL(coverUrl);
  }, [coverUrl]);

  return (
    <div className={styles.shell}>
      <p className={styles.eyebrow}>CreatorVerse Owner Preview</p>
      <p>This is a local demonstration. Nothing is saved to Supabase.</p>

      <section className={styles.pageHeader}>
        <div style={{
          height: 210,
          borderRadius: 16,
          backgroundColor: '#48266e',
          backgroundImage: coverUrl ? `url("${coverUrl}")` : undefined,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }} aria-label="CreatorVerse cover preview" role="img" />

        <div className={styles.brand} style={{
          marginTop: -32,
          marginLeft: 18,
          position: 'relative',
          border: '3px solid #191320',
          backgroundImage: logoUrl ? `url("${logoUrl}")` : undefined,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}>
          {!logoUrl && page.name.charAt(0).toUpperCase()}
        </div>

        <p className={styles.eyebrow}>
          {CREATORVERSE_CATEGORIES[page.category]}
        </p>

        <h1>{page.name}</h1>
        <p>{page.short_bio}</p>

        <button type="button"
          onClick={() => setEditing(value => !value)}>
          {editing ? 'Close Editor' : 'Edit Page'}
        </button>
      </section>

      <section className={styles.pageColumns}>
        <div>
          <h2>Page Management</h2>
          <p>Only the verified page owner will be allowed to edit this page.</p>
          <p>Publishing, followers and interactions arrive in later phases.</p>
          <p>Page deletion will require owner verification and confirmation.</p>
        </div>

        <aside className={styles.about}>
          <h2>About</h2>
          <p className={styles.description}>{page.description}</p>
          {page.location && <p>{page.location}</p>}
          {page.website && <p>{page.website}</p>}
          {page.public_email && <p>{page.public_email}</p>}
          {page.social_links.map(link =>
            <p key={`${link.label}-${link.url}`}>
              {link.label}: {link.url}
            </p>
          )}
        </aside>
      </section>

      {editing && (
        <section style={{ marginTop: 32 }}>
          <CreatorVersePageForm
            initial={page}
            heading="Edit your CreatorVerse page"
            buttonLabel="Apply to Local Preview"
            successMessage="Preview updated locally. Nothing saved to the database."
            onSave={async (fields, images) => {
              setPage(fields);
              if (images.logo) setLogoUrl(URL.createObjectURL(images.logo));
              if (images.cover) setCoverUrl(URL.createObjectURL(images.cover));
              setNotice('Page preview updated. Changes are not persistent.');
            }}
          />
        </section>
      )}

      {notice && <p role="status">{notice}</p>}
    </div>
  );
}
