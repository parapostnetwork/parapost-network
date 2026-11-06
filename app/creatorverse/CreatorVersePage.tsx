'use client';

import groupTabStyles from './CreatorVerseGroupTabs.module.css';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';

import { usePublicRead } from '@/lib/creatorverse/usePublicRead';
import { CREATORVERSE_CATEGORIES, type PageResult } from '@/lib/creatorverse/types';
import { postCardStyle, postContentStyle } from '@/components/postPresentation';

import groupStyles from '@/app/groups/groups.module.css';
import draftStyles from '@/app/groups-local-preview/creatorverse/draft/draft.module.css';
import tabStyles from '@/app/groups-local-preview/creatorverse/[id]/SampleCreatorVerseClient.module.css';
import CreatorVerseOwnerComposer from './CreatorVerseOwnerComposer';
import CreatorVersePublisherOnly from './CreatorVersePublisherOnly';
import CreatorVersePostActions from './CreatorVersePostActions';
import styles from './creatorverse.module.css';
import layout from './CreatorVerseGroupsLayout.module.css';

type Section = 'Posts' | 'Photos' | 'Videos' | 'About';

// Release only after explicit approval and verified backend security.


export default function CreatorVersePage({ id }: { id: string }) {
  const [section, setSection] = useState<Section>('Posts');

  const { data, loading, error, retry } = usePublicRead<PageResult>(
    `/api/creatorverse?page=${encodeURIComponent(id)}`
  );

  if (loading) return <p role="status">Loading this page…</p>;

  if (error || !data) {
    return (
      <section className={styles.empty}>
        <h1>Page unavailable</h1>
        <p role="alert">{error}</p>
        <button type="button" onClick={retry}>Try again</button>
      </section>
    );
  }

  const { page, posts } = data;

  return (
    <div className={groupStyles.page}>
      <main className={`${groupStyles.shell} ${draftStyles.shell}`}>
        <nav className={styles.navigation} aria-label="CreatorVerse navigation">
          <Link href="/groups">← Back to Groups</Link>
          <Link href="/dashboard" prefetch={false}>Dashboard</Link>
        </nav>

        <header className={`${groupStyles.card} ${groupStyles.groupHeader} ${draftStyles.header}`}>
          <div className={`${groupStyles.cover} ${groupStyles.banner} ${draftStyles.cover}`}>
            <Image
              src="/parapost-icon-white.png"
              alt="ParaGhost"
              width={512}
              height={512}
              className={groupStyles.mascot}
              priority
            />
          </div>

          <div className={draftStyles.identity}>
            <div className={draftStyles.avatar} aria-hidden="true">
              {page.name.charAt(0)}
            </div>

            <div className={draftStyles.identityText}>
              <p className={draftStyles.category}>
                {CREATORVERSE_CATEGORIES[page.category]}
              </p>
              <h1>{page.name}</h1>
              <p>{page.short_bio}</p>
            </div>
          </div>

          <div className={groupTabStyles.tabs} role="group" aria-label="CreatorVerse sections">
            {(['Posts', 'Photos', 'Videos', 'About'] as Section[]).map(tab => (
              <button
                key={tab}
                type="button"
                aria-pressed={section === tab}
                onClick={() => setSection(tab)}
              >
                {tab}
              </button>
            ))}
          </div>
        </header>

        <div className={layout.columns}>
          <aside className={layout.sidebar} aria-label="About this CreatorVerse page">
            <h2>About this Page</h2>
            <p className={layout.description}>
              {page.description || page.short_bio}
            </p>

            <div className={layout.detail}>
              <span>Category</span>
              <strong>{CREATORVERSE_CATEGORIES[page.category]}</strong>
            </div>

            {page.location && (
              <div className={layout.detail}>
                <span>Location</span>
                <strong>{page.location}</strong>
              </div>
            )}

            {page.website && (
              <div className={layout.detail}>
                <span>Website</span>
                <a href={page.website} target="_blank" rel="noopener noreferrer">
                  Visit website
                </a>
              </div>
            )}
          </aside>

          <section
            className={`${draftStyles.panel} ${tabStyles.content} ${layout.primary}`}
            aria-label={`${section} section`}
          >
          <h2>{section}</h2>

          {section === 'Posts' && (
            <section aria-label="Page posts">

                <CreatorVersePublisherOnly pageId={id}>
                  <CreatorVerseOwnerComposer
                    pageId={id}
                    pageName={page.name}
                    onPublished={retry}
                  />
                </CreatorVersePublisherOnly>
              {posts.length ? posts.map(post => (
                <article
                  key={post.id}
                  style={postCardStyle}
                  className={styles.post}
                >
                  <strong>{page.name}</strong>
                  <time dateTime={post.created_at}>
                    {new Date(post.created_at).toLocaleDateString()}
                  </time>
                  <p style={postContentStyle}>{post.content}</p>
                  <CreatorVersePostActions pageId={id} postId={post.id} commentsEnabled={post.comments_enabled} />
                </article>
              )) : (
                <p className={styles.empty}>
                  This page hasn’t published any posts yet.
                </p>
              )}
            </section>
          )}

          {section === 'Photos' && (
            <p>No photos have been published on this page yet.</p>
          )}

          {section === 'Videos' && (
            <p>No videos have been published on this page yet.</p>
          )}

          {section === 'About' && (
            <div className={styles.about}>
              <p className={styles.description}>
                {page.description || page.short_bio}
              </p>

              {page.location && <p>{page.location}</p>}

              {page.website && (
                <p>
                  <a href={page.website} target="_blank" rel="noopener noreferrer">
                    Visit website
                  </a>
                </p>
              )}

              {page.public_email && (
                <p>
                  <a href={`mailto:${encodeURIComponent(page.public_email)}`}>
                    {page.public_email}
                  </a>
                </p>
              )}

              {page.social_links.map(link => (
                <p key={`${link.label}-${link.url}`}>
                  <a href={link.url} target="_blank" rel="noopener noreferrer">
                    {link.label}
                  </a>
                </p>
              ))}
            </div>
          )}
          </section>
        </div>
      </main>
    </div>
  );
}
