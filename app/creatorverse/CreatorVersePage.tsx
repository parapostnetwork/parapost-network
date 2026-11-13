'use client';
import ExpandablePostText from '@/components/ExpandablePostText';

import groupTabStyles from './CreatorVerseGroupTabs.module.css';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import CreatorVerseEditDetails from './CreatorVerseEditDetails';
import Image from 'next/image';
import Link from 'next/link';

import { usePublicRead } from '@/lib/creatorverse/usePublicRead';
import { CREATORVERSE_CATEGORIES, type PageResult } from '@/lib/creatorverse/types';
import { postCardStyle, postContentStyle } from '@/components/postPresentation';

import groupStyles from '@/app/groups/groups.module.css';
import draftStyles from '@/app/groups-local-preview/creatorverse/draft/draft.module.css';
import tabStyles from '@/app/groups-local-preview/creatorverse/[id]/SampleCreatorVerseClient.module.css';
import CreatorVersePublisherOnly from './CreatorVersePublisherOnly';
import CreatorVerseOwnerComposer from './CreatorVerseOwnerComposer';
import CreatorVersePostActions from './CreatorVersePostActions';
import CreatorVersePublishedMedia from './CreatorVersePublishedMedia';
import CreatorVerseFollowButton from './CreatorVerseFollowButton';
import styles from './creatorverse.module.css';
import layout from './CreatorVerseGroupsLayout.module.css';

type Section = 'Posts' | 'Photos' | 'Videos' | 'About';

const publishedMediaReady =
  process.env.NEXT_PUBLIC_CREATORVERSE_POST_MEDIA_READ_ENABLED === 'true';

// Release only after explicit approval and verified backend security.


export default function CreatorVersePage({ id }: { id: string }) {
  const [section, setSection] = useState<Section>('Posts');
  const [canManage, setCanManage] = useState(false);
  const [editing, setEditing] = useState(false);
  const [coverAvailable, setCoverAvailable] = useState(false);
  const [logoAvailable, setLogoAvailable] = useState(false);
  const [imageRevision, setImageRevision] = useState(0);

  useEffect(() => {
    let active = true;
    let sequence = 0;

    async function verify(token?: string) {
      const current = ++sequence;
      if (active) setCanManage(false);
      if (token == null) return;

      try {
        const response = await fetch(
          `/api/creatorverse/${encodeURIComponent(id)}/permissions`,
          {
            cache: 'no-store',
            headers: { Authorization: `Bearer ${token}` }
          }
        );
        if (response.ok === false) return;
        const permissions = await response.json();
        if (active && current === sequence) {
          setCanManage((permissions.can_edit_details === true));
        }
      } catch {
        if (active && current === sequence) setCanManage(false);
      }
    }

    void supabase.auth.getSession().then(({ data }) => {
      if (active) void verify(data.session?.access_token);
    }).catch(() => {
      if (active) setCanManage(false);
    });

    const { data } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        void verify(session?.access_token);
      }
    );

    return () => {
      active = false;
      sequence++;
      data.subscription.unsubscribe();
    };
  }, [id]);


  useEffect(() => {
    let active = true;

    async function checkImages() {
      const base =
        `/api/creatorverse/pages/${encodeURIComponent(id)}/images`;

      const [cover, logo] = await Promise.all([
        fetch(`${base}/cover?v=${imageRevision}`, {
          method: 'HEAD',
          cache: 'no-store',
        }).then(response => response.ok).catch(() => false),
        fetch(`${base}/logo?v=${imageRevision}`, {
          method: 'HEAD',
          cache: 'no-store',
        }).then(response => response.ok).catch(() => false),
      ]);

      if (!active) return;
      setCoverAvailable(cover);
      setLogoAvailable(logo);
    }

    void checkImages();

    return () => {
      active = false;
    };
  }, [id, imageRevision]);

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

  const imageBase =
    `/api/creatorverse/pages/${encodeURIComponent(page.id)}/images`;
  const coverSrc = `${imageBase}/cover?v=${imageRevision}`;
  const logoSrc = `${imageBase}/logo?v=${imageRevision}`;

  return (
    <div className={groupStyles.page}>
      <main className={`${groupStyles.shell} ${draftStyles.shell}`}>
        <nav className={styles.navigation} aria-label="CreatorVerse navigation">
          <Link href={
            process.env.NODE_ENV === 'development'
              ? '/groups-local-preview?tab=creatorverse'
              : '/groups?tab=creatorverse'
          }>← Back to Groups</Link>
          <Link href="/dashboard" prefetch={false}>Dashboard</Link>
        </nav>

        <header className={`${groupStyles.card} ${groupStyles.groupHeader} ${draftStyles.header}`}>
          <div className={`${groupStyles.cover} ${groupStyles.banner} ${draftStyles.cover}`}>
            {coverAvailable ? (
              <Image
                src={coverSrc}
                alt={`${page.name} cover banner`}
                fill
                unoptimized
                style={{ objectFit: 'cover' }}
                onError={() => setCoverAvailable(false)}
              />
            ) : (
              <Image
                src="/parapost-icon-white.png"
                alt="ParaGhost"
                width={512}
                height={512}
                className={groupStyles.mascot}
                priority
              />
            )}
          </div>

          <div className={draftStyles.identity}>
            <div className={draftStyles.avatar}>
              {logoAvailable ? (
                <Image
                  src={logoSrc}
                  alt={`${page.name} profile picture`}
                  width={96}
                  height={96}
                  unoptimized
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    borderRadius: '50%',
                  }}
                  onError={() => setLogoAvailable(false)}
                />
              ) : (
                page.name.charAt(0)
              )}
            </div>

            <div className={draftStyles.identityText}>
              <p className={draftStyles.category}>
                {CREATORVERSE_CATEGORIES[page.category]}
              </p>
              <h1>{page.name}</h1>
              <p>{page.short_bio}</p>
            </div>
            {canManage && (
              <details style={{
                position: 'absolute', right: 24, top: 76, zIndex: 10
              }}>
                <summary
                  aria-label="Page options"
                  className={draftStyles.pageOptionsTrigger}
                >
                  ⋯
                </summary>
                <div style={{
                  position: 'absolute', right: 0, top: '100%',
                  minWidth: 140
                }}>
                  <button type="button" onClick={() => setEditing(true)}>
                    Edit Page
                  </button>
                </div>
              </details>
            )}
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
        <CreatorVerseFollowButton pageId={id} isOwner={canManage} />
        </header>

        {editing && canManage && (
          <CreatorVerseEditDetails
            page={page}
            onCancel={() => setEditing(false)}
            onSaved={() => {
                setEditing(false);
                setImageRevision(value => value + 1);
                retry();
              }}
          />
        )}

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
                  <ExpandablePostText text={post.content} style={postContentStyle} />
                  {publishedMediaReady && post.media.length > 0 && (
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))',
                      gap: 10,
                      marginTop: 12,
                    }}>
                      {post.media.map(media => (
                        <CreatorVersePublishedMedia
                          key={media.id}
                          pageId={id}
                          postId={post.id}
                          media={media}
                        />
                      ))}
                    </div>
                  )}
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
            <section aria-label="Published Photos">
              {publishedMediaReady &&
              posts.some(post =>
                post.media.some(media => media.media_type === 'image')
              ) ? (
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))',
                  gap: 12,
                  width: '100%',
                }}>
                  {posts.flatMap(post =>
                    post.media
                      .filter(media => media.media_type === 'image')
                      .map(media => (
                        <CreatorVersePublishedMedia
                          key={media.id}
                          pageId={id}
                          postId={post.id}
                          media={media}
                        />
                      ))
                  )}
                </div>
              ) : (
                <p>No photos have been published on this page yet.</p>
              )}
            </section>
          )}

          {section === 'Videos' && (
            <section aria-label="Published Videos">
              {publishedMediaReady &&
              posts.some(post =>
                post.media.some(media => media.media_type === 'video')
              ) ? (
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))',
                  gap: 12,
                  width: '100%',
                }}>
                  {posts.flatMap(post =>
                    post.media
                      .filter(media => media.media_type === 'video')
                      .map(media => (
                        <CreatorVersePublishedMedia
                          key={media.id}
                          pageId={id}
                          postId={post.id}
                          media={media}
                        />
                      ))
                  )}
                </div>
              ) : (
                <p>No videos have been published on this page yet.</p>
              )}
            </section>
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
