'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import CreatorVersePostComposer from '@/app/creatorverse/CreatorVersePostComposer';
import CreatorVersePreviewAccess from '@/app/creatorverse/CreatorVersePreviewAccess';
import groupStyles from '@/app/groups/groups.module.css';
import styles from '../draft/draft.module.css';
import discoveryStyles from '@/app/creatorverse/CreatorVerseDiscovery.module.css';
import ui from './SampleCreatorVerseClient.module.css';

type Section = 'Posts' | 'Photos' | 'Videos' | 'About';

export default function SampleCreatorVerseClient({
  name, category, bio, description, creatorName, id
}: {
  name: string;
  category: string;
  bio: string;
  description: string;
  creatorName: string | null;
  id: string;
}) {
  const [section, setSection] = useState<Section>('Posts');
  const [role, setRole] = useState<'owner' | 'visitor'>('visitor');


  return <div className={groupStyles.page}>
    <main className={`${groupStyles.shell} ${styles.shell}`}>
      <nav className={discoveryStyles.navigation}
        aria-label="CreatorVerse navigation">
        <Link href="/groups-local-preview?tab=creatorverse">
          ← Back to CreatorVerse
        </Link>
        <Link href="/dashboard" prefetch={false}>Dashboard →</Link>
      </nav>

      <header className={`${groupStyles.card} ${groupStyles.groupHeader} ${styles.header}`}>
        <div className={`${groupStyles.cover} ${groupStyles.banner} ${styles.cover}`}>
          <Image
            src="/parapost-icon-white.png"
            alt="ParaGhost"
            width={512}
            height={512}
            className={groupStyles.mascot}
            priority
          />
        </div>

        <div className={styles.identity}>
          <div className={styles.avatar} aria-hidden="true">
            {name.charAt(0)}
          </div>
          <div className={styles.identityText}>
            <p className={styles.category}>{category} · Sample page</p>
            <h1>{name}</h1>
            <p>{bio}</p>
            {creatorName && <p>By {creatorName}</p>}
          </div>
        </div>

        <div className={ui.tabs}
          role="group" aria-label="CreatorVerse sections">
          {(['Posts', 'Photos', 'Videos', 'About'] as Section[]).map(tab => (
            <button
              type="button"
              key={tab}
              aria-pressed={section === tab}
              onClick={() => setSection(tab)}
            >
              {tab}
            </button>
          ))}
        </div>
      </header>

      <section className={`${styles.panel} ${ui.content}`}
        aria-label={`${section} section`}>
        <h2>{section}</h2>

        {section === 'Posts' && (
          <CreatorVersePreviewAccess enabled>
            <div
              role="group"
              aria-label="Staging role simulation"
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                gap: 12,
                marginBottom: 20,
              }}
            >
              <span>Test as:</span>
              <button
                type="button"
                aria-pressed={role === 'owner'}
                onClick={() => setRole('owner')}
              >
                Owner
              </button>
              <button
                type="button"
                aria-pressed={role === 'visitor'}
                onClick={() => setRole('visitor')}
              >
                Follower
              </button>
              <span style={{ fontSize: 12, opacity: .7 }}>
                Staging simulation only
              </span>
            </div>

            <CreatorVersePostComposer
              pageName={name}
              pageHref={`/groups-local-preview/creatorverse/${id}`}
              previewRole={role}
            />
          </CreatorVersePreviewAccess>
        )}

        {section === 'Photos' &&
          <p>No photos have been published on this page yet.</p>}

        {section === 'Videos' &&
          <p>No videos have been published on this page yet.</p>}

        {section === 'About' &&
          <p>{description || bio}</p>}
      </section>
    </main>
  </div>;
}
