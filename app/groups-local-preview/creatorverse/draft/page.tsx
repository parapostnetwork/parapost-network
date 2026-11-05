'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useEffect, useState } from 'react';
import { CREATORVERSE_CATEGORIES, type PageFields } from '@/lib/creatorverse/types';
import { validatePageFields } from '@/lib/creatorverse/validation';
import styles from './draft.module.css';
import groupStyles from '@/app/groups/groups.module.css';
import { OFFICIAL_PARAGHOST } from '@/app/groups/GroupCover';

const DRAFT_KEY = 'parapost.creatorverse.localDraft.v1';
type Section = 'Posts' | 'About' | 'Photos' | 'Videos';

function safeUrl(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:'
      ? url.href : null;
  } catch {
    return null;
  }
}

export default function LocalCreatorVerseBusinessPage() {
  const [page, setPage] = useState<PageFields | null>(null);
  const [ready, setReady] = useState(false);
  const [section, setSection] = useState<Section>('Posts');

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(DRAFT_KEY);
      if (raw) setPage(validatePageFields(JSON.parse(raw)));
    } catch {
      setPage(null);
    } finally {
      setReady(true);
    }
  }, []);

  if (!ready) return <main className={styles.shell}>Loading page...</main>;

  if (!page) return (
    <main className={styles.shell}>
      <h1>No saved CreatorVerse page found</h1>
      <Link href="/groups">Back to CreatorVerse</Link>
    </main>
  );

  const website = safeUrl(page.website ?? '');

  const details = (
    <div className={styles.details}>
      <h2>About</h2>
      <p>{page.description || page.short_bio}</p>
      {page.location && <p>Location: {page.location}</p>}
      {website && <p><a href={website} target="_blank" rel="noopener noreferrer">Visit website</a></p>}
      {page.public_email && <p><a href={`mailto:${page.public_email}`}>{page.public_email}</a></p>}
      {page.social_links.map(link => {
        const url = safeUrl(link.url);
        return url ? (
          <p key={`${link.label}-${url}`}>
            <a href={url} target="_blank" rel="noopener noreferrer">{link.label}</a>
          </p>
        ) : null;
      })}
    </div>
  );

  return (
    <div className={groupStyles.page}>
      <main className={`${groupStyles.shell} ${styles.shell}`}>
      <Link className={styles.back} href="/groups">
        ← Back to CreatorVerse
      </Link>

      <header className={`${groupStyles.card} ${groupStyles.groupHeader} ${styles.header}`}>
        <div className={`${groupStyles.cover} ${groupStyles.banner} ${styles.cover}`}>
          <Image
            src={OFFICIAL_PARAGHOST}
            alt="ParaGhost — official Parapost Network mascot"
            width={512}
            height={512}
            className={groupStyles.mascot}
            priority
          />
        </div>
        <div className={styles.identity}>
          <div className={styles.avatar} aria-hidden="true">
            {page.name.charAt(0).toUpperCase()}
          </div>
          <div className={styles.identityText}>
            <p className={styles.category}>
              {CREATORVERSE_CATEGORIES[page.category]}
            </p>
            <h1>{page.name}</h1>
            <p>{page.short_bio}</p>
            {page.location && <p className={styles.location}>{page.location}</p>}
          </div>
          <div className={styles.pageMenu}>
            <details className={styles.pageMenuDetails}>
              <summary aria-label="Page options" title="Page options">
                <span aria-hidden="true">•••</span>
              </summary>
              <div className={styles.pageMenuPanel}>
                <Link href="/groups-local-preview/creatorverse/draft/edit">
                  Edit Draft
                </Link>
              </div>
            </details>
          </div>
        </div>
        <nav className={`${groupStyles.groupTabs} ${styles.tabs}`} role="tablist" aria-label="Business page sections">
        {(['Posts', 'About', 'Photos', 'Videos'] as const).map(name => (
          <button key={name} type="button" role="tab"
            aria-selected={section === name}
            onClick={() => setSection(name)}>
            {name}
          </button>
        ))}
        </nav>
      </header>

      {section === 'Posts' && (
        <div className={`${styles.columns} ${styles.postsOnly}`} role="tabpanel">
          <section className={styles.panel} style={{ minWidth: 0 }}>
            <h2>Posts</h2>
            <p>No posts have been published on this page yet.</p>
          </section>

        </div>
      )}

      {section === 'About' && (
        <section className={styles.panel} role="tabpanel">{details}</section>
      )}

      {section === 'Videos' && (
        <section className={styles.panel} role="tabpanel">
          <h2>Videos</h2>
          <p>No videos have been published on this page yet.</p>
        </section>
      )}

      {section === 'Photos' && (
        <section className={styles.panel} role="tabpanel">
          <h2>Photos</h2>
          <p>No photos have been published on this page yet.</p>
        </section>
      )}
      </main>
    </div>
  );
}
