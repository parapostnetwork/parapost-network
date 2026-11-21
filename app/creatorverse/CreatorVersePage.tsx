'use client';
import profileStyles from './CreatorVerseProfileHeader.module.css';
import ExpandablePostText from '@/components/ExpandablePostText';

import groupTabStyles from './CreatorVerseGroupTabs.module.css';

import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import CreatorVerseEditDetails from './CreatorVerseEditDetails';
import CreatorVerseDeletePage from './CreatorVerseDeletePage';
import Image from 'next/image';
import Link from 'next/link';
import CommunityMobileTopbar from '@/components/CommunityMobileTopbar';

import { useCreatorVersePermissions } from '@/lib/creatorverse/useCreatorVersePermissions';
import { usePublicRead } from '@/lib/creatorverse/usePublicRead';
import { CREATORVERSE_CATEGORIES, type PageResult, type CreatorVersePost } from '@/lib/creatorverse/types';
import { postCardStyle, postContentStyle } from '@/components/postPresentation';

import groupStyles from '@/app/groups/groups.module.css';
import draftStyles from '@/app/groups-local-preview/creatorverse/draft/draft.module.css';
import tabStyles from '@/app/groups-local-preview/creatorverse/[id]/SampleCreatorVerseClient.module.css';
import CreatorVerseOwnerComposer from './CreatorVerseOwnerComposer';
import CreatorVersePostActions from './CreatorVersePostActions';
import CreatorVersePostOwnerMenu from './CreatorVersePostOwnerMenu';
import CreatorVersePublishedMedia from './CreatorVersePublishedMedia';
import CreatorVerseFollowButton from './CreatorVerseFollowButton';
import CreatorVerseLivePanel from './CreatorVerseLivePanel';
import CreatorVerseLiveHub from "./CreatorVerseLiveHub";
import CreatorVerseReplayFeed from './CreatorVerseReplayFeed';
import liveStyles from "./CreatorVerseLiveLayout.module.css";
import styles from './creatorverse.module.css';
import layout from './CreatorVerseGroupsLayout.module.css';
import CommunityMobileBottomNav from '@/components/CommunityMobileBottomNav';
import communityDetail from '@/app/groups/CommunityDetailMobile.module.css';

type Section = 'Posts' | 'Photos' | 'Videos' | 'Live' | 'About';

const publishedMediaReady =
  process.env.NEXT_PUBLIC_CREATORVERSE_POST_MEDIA_READ_ENABLED === 'true';

// Release only after explicit approval and verified backend security.


export default function CreatorVersePage({ id }: { id: string }) {
  const [section, setSection] = useState<Section>('Posts');
  const [postChanges, setPostChanges] = useState<{
    pageId: string;
    edited: Record<string, string>;
    deleted: string[];
  }>({
    pageId: id,
    edited: {},
    deleted: [],
  });
  const { canManage, canPublish, viewerId } = useCreatorVersePermissions(id);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [coverAvailable, setCoverAvailable] = useState(false);
  const [logoAvailable, setLogoAvailable] = useState(false);
  const [imageRevision, setImageRevision] = useState(0);

  useEffect(() => {
    setEditing(false);
    setDeleting(false);
  }, [id, viewerId]);

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

  // Preserve the displayed page during a post-publish refresh.
  const lastLoadedPage = useRef<{
    pageId: string;
    result: PageResult;
  } | null>(null);

  useEffect(() => {
    if (data) {
      lastLoadedPage.current = { pageId: id, result: data };
    }
  }, [data, id]);

  const visibleData =
    data ?? (
      lastLoadedPage.current?.pageId === id
        ? lastLoadedPage.current.result
        : null
    );

  const [publishedFeed, setPublishedFeed] = useState<{
    pageId: string;
    posts: CreatorVersePost[];
  } | null>(null);
  const [postRefreshMessage, setPostRefreshMessage] = useState('');
  const [olderPosts, setOlderPosts] = useState<CreatorVersePost[]>([]);
  const [nextPostsOffset, setNextPostsOffset] = useState<number | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [olderError, setOlderError] = useState('');
  const olderLock = useRef(false);
  const pageRevision = useRef(0);
  const [linkedPost, setLinkedPost] = useState<{
    pageId: string;
    post: CreatorVersePost;
  } | null>(null);
  const [linkedPostError, setLinkedPostError] = useState('');
  const scrolledLinkedPost = useRef('');

  useEffect(() => {
    if (!data || data.page.id !== id) return;

    const targetId = new URLSearchParams(window.location.search).get('post');
    if (!targetId) return;

    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuid.test(targetId)) {
      setLinkedPostError('Invalid CreatorVerse post link.');
      return;
    }

    if (data.posts.some(post => post.id === targetId)) return;

    const controller = new AbortController();
    let cancelled = false;

    async function loadLinkedPost() {
      try {
        const { data: auth, error: authError } =
          await supabase.auth.getSession();

        if (authError) throw authError;
        if (cancelled) return;

        const token = auth.session?.access_token;

        const response = await fetch(
          `/api/creatorverse?page=${encodeURIComponent(id)}&post=${encodeURIComponent(targetId!)}`,
          {
            cache: 'no-store',
            signal: controller.signal,
            headers: token ? { Authorization: `Bearer ${token}` } : {},
          }
        );

        if (!response.ok) throw new Error('Post unavailable');

        const result = await response.json() as PageResult;
        if (cancelled) return;

        const found = result.page?.id === id &&
          result.posts.length === 1 &&
          result.posts[0].id === targetId;

        if (!found) {
          setLinkedPostError('This CreatorVerse post is unavailable.');
          return;
        }

        setLinkedPost({ pageId: id, post: result.posts[0] });
        setLinkedPostError('');
      } catch {
        if (!cancelled) {
          setLinkedPostError('Unable to open the linked CreatorVerse post.');
        }
      }
    }

    void loadLinkedPost();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [id, data]);

  useEffect(() => {
    const targetId = new URLSearchParams(window.location.search).get('post');
    if (!targetId || !data || data.page.id !== id) return;

    const key = `${id}:${targetId}`;
    if (scrolledLinkedPost.current === key) return;

    const frame = window.requestAnimationFrame(() => {
      const target = document.getElementById(`creatorverse-post-${targetId}`);
      if (!target) return;

      target.style.scrollMarginTop = '112px';
      target.scrollIntoView({ behavior: 'auto', block: 'start' });
      scrolledLinkedPost.current = key;
    });

    return () => window.cancelAnimationFrame(frame);
  }, [id, data, linkedPost, olderPosts, publishedFeed, section]);

  // Refresh only the feed after successful publication.
  // Do not trigger the page-wide loading state.
  async function refreshPublishedPosts() {
    const revision = pageRevision.current;

    try {
      const { data: auth, error: authError } =
        await supabase.auth.getSession();

      const token = auth.session?.access_token;
      if (authError || !token) {
        throw new Error('Session unavailable');
      }

      const response = await fetch(
        `/api/creatorverse?page=${encodeURIComponent(id)}`,
        {
          cache: 'no-store',
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      if (!response.ok) {
        throw new Error('Unable to refresh posts');
      }

      const result = await response.json() as PageResult;

      if (result.page?.id !== id || !Array.isArray(result.posts)) {
        throw new Error('Invalid post feed');
      }

      if (revision !== pageRevision.current) return;

      const previousTop =
        publishedFeed?.pageId === id
          ? publishedFeed.posts
          : visibleData?.posts ?? [];

      const previousIds = new Set(
        previousTop.map(post => post.id)
      );

      const addedCount = result.posts.filter(
        post => !previousIds.has(post.id)
      ).length;

      // Keep posts displaced from the first page.
      setOlderPosts(previous => {
        const seen = new Set(
          result.posts.map(post => post.id)
        );

        return [
          ...previousTop,
          ...previous,
        ].filter(post => {
          if (seen.has(post.id)) return false;
          seen.add(post.id);
          return true;
        });
      });

      setNextPostsOffset(previous =>
        previous === null ? null : previous + addedCount
      );

      setPublishedFeed({
        pageId: id,
        posts: result.posts,
      });

      setPostRefreshMessage('');
    } catch {
      if (revision === pageRevision.current) {
        setPostRefreshMessage(
          'Post published, but the feed could not refresh. Reload the page to see it.'
        );
      }
    }
  }

  useEffect(() => {
    pageRevision.current += 1;
    olderLock.current = false;
    setPublishedFeed(null);
    setPostRefreshMessage('');
    setOlderPosts([]);
    setNextPostsOffset(data?.nextPostsOffset ?? null);
    setLoadingOlder(false);
    setOlderError('');
  }, [data, id]);

  async function loadOlderPosts() {
    if (!data || nextPostsOffset === null || olderLock.current) return;

    const revision = pageRevision.current;
    olderLock.current = true;
    setLoadingOlder(true);
    setOlderError('');

    try {
      const { data: auth } = await supabase.auth.getSession();
      const token = auth.session?.access_token;

      const response = await fetch(
        `/api/creatorverse?page=${encodeURIComponent(id)}&posts_offset=${nextPostsOffset}`,
        {
          cache: 'no-store',
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        }
      );

      if (!response.ok) throw new Error('Unable to load older posts.');

      const result = await response.json() as PageResult;
      if (!Array.isArray(result.posts) || result.page?.id !== id) {
        throw new Error('Invalid older-post response.');
      }

      if (revision !== pageRevision.current) return;

      setOlderPosts(previous => {
        const seen = new Set([
          ...data.posts.map(post => post.id),
          ...previous.map(post => post.id),
        ]);

        const additions = result.posts.filter(post => {
          if (seen.has(post.id)) return false;
          seen.add(post.id);
          return true;
        });

        return [...previous, ...additions];
      });

      setNextPostsOffset(result.nextPostsOffset ?? null);
    } catch (failure) {
      if (revision === pageRevision.current) {
        setOlderError(
          failure instanceof Error
            ? failure.message
            : 'Unable to load older posts.'
        );
      }
    } finally {
      if (revision === pageRevision.current) {
        olderLock.current = false;
        setLoadingOlder(false);
      }
    }
  }

  if (loading && !visibleData) return <p role="status">Loading this page…</p>;

  if (error || !visibleData) {
    return (
      <section className={styles.empty}>
        <h1>Page unavailable</h1>
        <p role="alert">{error}</p>
        <button type="button" onClick={retry}>Try again</button>
      </section>
    );
  }

  const { page } = visibleData;
  const topPosts =
    publishedFeed?.pageId === id
      ? publishedFeed.posts
      : visibleData.posts;

  const loadedIds = new Set(topPosts.map(post => post.id));
  const changes = postChanges.pageId === id
    ? postChanges
    : null;

  const extraPosts = olderPosts.filter(post => !loadedIds.has(post.id));
  const exactPost = linkedPost?.pageId === id ? linkedPost.post : null;
  const includeExactPost = exactPost &&
    !loadedIds.has(exactPost.id) &&
    !extraPosts.some(post => post.id === exactPost.id);

  const posts = [
    ...(includeExactPost && exactPost ? [exactPost] : []),
    ...topPosts,
    ...extraPosts,
  ]
    .filter(post => !changes?.deleted.includes(post.id))
    .map(post => ({
      ...post,
      content: changes?.edited[post.id] ?? post.content,
    }));

  const imageBase =
    `/api/creatorverse/pages/${encodeURIComponent(page.id)}/images`;
  const coverSrc = `${imageBase}/cover?v=${imageRevision}`;
  const logoSrc = `${imageBase}/logo?v=${imageRevision}`;

  return (
    <div className={`${groupStyles.page} ${communityDetail.mobileCommunity}`}>
      <main className={`${groupStyles.shell} ${draftStyles.shell}`} data-community-detail-container="creatorverse">
        <nav className={styles.navigation} aria-label="CreatorVerse navigation" data-community-topbar="creatorverse">
          <Link href="/groups?tab=creatorverse">← Back to Groups</Link>
          <Link href="/dashboard" prefetch={false}>Dashboard</Link>
        </nav>
        <CommunityMobileTopbar />

        <header className={`${groupStyles.card} ${groupStyles.groupHeader} ${draftStyles.header}`} data-community-header="creatorverse">
          <div className={`${groupStyles.cover} ${groupStyles.banner} ${draftStyles.cover}`} data-community-banner="creatorverse">
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

          <div className={`${draftStyles.identity} ${!canManage ? profileStyles.identity : ""}`}>
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

            <div className={`${draftStyles.identityText} ${!canManage ? profileStyles.info : ""}`}>
              <p className={draftStyles.category}>
                {CREATORVERSE_CATEGORIES[page.category]}
              </p>
              <h1>{page.name}</h1>
              <p>{page.short_bio}</p>
            </div>
            {!canManage && (
              <div className={profileStyles.followAction}>
                <CreatorVerseFollowButton pageId={id} isOwner={canManage} />
              </div>
            )}
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
                <div className={styles.ownerMenu}>
                  <button
                    type="button"
                    onClick={event => {
                      event.currentTarget.closest('details')?.removeAttribute('open');
                      setEditing(true);
                    }}
                  >
                    Edit Page
                  </button>
                  <button
                    type="button"
                    className={styles.ownerMenuDanger}
                    onClick={event => {
                      event.currentTarget.closest('details')?.removeAttribute('open');
                      setDeleting(true);
                    }}
                  >
                    Delete CreatorVerse Page
                  </button>
                </div>
              </details>
            )}
          </div>


          <div className={groupTabStyles.tabs} role="group" aria-label="CreatorVerse sections">
            {(['Posts', 'Photos', 'Videos', 'Live', 'About'] as Section[]).map(tab => (
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

        {deleting && canManage && (
          <CreatorVerseDeletePage
            page={page}
            onCancel={() => setDeleting(false)}
          />
        )}

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

        <div className={layout.columns} data-community-columns="creatorverse">
          <aside className={layout.sidebar} aria-label="About this CreatorVerse page" data-community-sidebar="creatorverse">
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
            data-community-primary="creatorverse"
            aria-label={`${section} section`}
          >
          <h2 className={section === 'Posts' ? styles.mobileDuplicateHeading : undefined}>{section}</h2>

          {section === 'Posts' && (
            <section aria-label="Page posts">





              {canPublish && (
                <CreatorVerseOwnerComposer
                    key={`${id}:${viewerId}`}
                  pageId={id}
                  pageName={page.name}
                  onPublished={() => { void refreshPublishedPosts(); }}
                />
              )}
              <CreatorVerseLivePanel
                pageId={id}
                pageName={page.name}
                currentUserId={viewerId}
              />
              <CreatorVerseReplayFeed
                pageId={id}
                currentUserId={viewerId}
              />

              {postRefreshMessage && (
                <p role="status">{postRefreshMessage}</p>
              )}
              {linkedPostError && (
                <p role="alert">{linkedPostError}</p>
              )}
              {posts.length ? posts.map(post => (
                <article
                  key={post.id}
                  id={`creatorverse-post-${post.id}`}
                  style={{
                    ...postCardStyle,
                    position: 'relative',
                    overflow: 'visible',
                  }}
                  className={styles.post}
                  data-posting
                >
                  <strong>{page.name}</strong>
                  <time dateTime={post.created_at}>
                    {new Date(post.created_at).toLocaleDateString()}
                  </time>
                  {canPublish && (
                    <CreatorVersePostOwnerMenu
                      pageId={id}
                      postId={post.id}
                      content={post.content}
                      hasMedia={post.media.length > 0}
                      onEdited={content => setPostChanges(previous => ({
                        pageId: id,
                        edited: {
                          ...(previous.pageId === id ? previous.edited : {}),
                          [post.id]: content,
                        },
                        deleted: previous.pageId === id ? previous.deleted : [],
                      }))}
                      onDeleted={() => setPostChanges(previous => ({
                        pageId: id,
                        edited: previous.pageId === id ? previous.edited : {},
                        deleted: [
                          ...(previous.pageId === id ? previous.deleted : []),
                          post.id,
                        ],
                      }))}
                    />
                  )}
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
                          galleryMedia={post.media}
                        />
                      ))}
                    </div>
                  )}
                  <CreatorVersePostActions pageId={id} postId={post.id}
                    commentsEnabled={post.comments_enabled} postAuthorName={page.name}
                    postPreview={<>
                      <div style={{display:'grid',gap:4,marginBottom:12}}>
                        <strong>{page.name}</strong>
                        <time dateTime={post.created_at} style={{fontSize:12,color:'#9ca3af'}}>
                          {new Date(post.created_at).toLocaleDateString()}
                        </time>
                      </div>
                      <ExpandablePostText text={post.content} style={postContentStyle} />
                      {publishedMediaReady && post.media.length > 0 && <div style={{
                        display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(min(100%,220px),1fr))',
                        gap:10,marginTop:12,
                      }}>
                        {post.media.map(media => <CreatorVersePublishedMedia key={media.id}
                          pageId={id} postId={post.id} media={media} galleryMedia={post.media} />)}
                      </div>}
                    </>}
                  />
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
                          galleryMedia={post.media}
                        />
                      ))
                  )}
                </div>
              ) : (
                <p>
                  {nextPostsOffset !== null
                    ? 'No photos in the loaded posts yet. Load older posts to see more.'
                    : 'No photos have been published on this page yet.'}
                </p>
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
                          galleryMedia={post.media}
                        />
                      ))
                  )}
                </div>
              ) : (
                <p>
                  {nextPostsOffset !== null
                    ? 'No videos in the loaded posts yet. Load older posts to see more.'
                    : 'No videos have been published on this page yet.'}
                </p>
              )}
            </section>
          )}

          {section !== 'About' && section !== 'Live' && nextPostsOffset !== null && (
            <div style={{ marginTop: 20, textAlign: 'center' }}>
              <button
                type="button"
                disabled={loadingOlder}
                onClick={() => void loadOlderPosts()}
              >
                {loadingOlder ? 'Loading…' : 'Load older posts'}
              </button>
            </div>
          )}

          {section !== 'About' && section !== 'Live' && olderError && (
            <p role="alert">{olderError}</p>
          )}


          {section === 'Live' && (
            <section aria-label="CreatorVerse live broadcasts" className={liveStyles.liveSection}>
              <div className={liveStyles.liveIntro}>
                <p>
                  {canPublish
                    ? "When you create a livestream through your CreatorVerse page, your broadcast will appear in CreatorVerse Posts, on the main Parapost Dashboard, and on your personal Profile while live."
                    : "When this CreatorVerse page goes live, its broadcast can be watched in Posts and discovered on the main Parapost Dashboard and the creator's Profile."}
                </p>
                <p className={liveStyles.liveSubtext}>
                  {canPublish
                    ? "Create and manage broadcasts here, explore upcoming shows, and revisit previous broadcasts."
                    : "Explore upcoming live shows and previous broadcasts below."}
                </p>
              </div>

              {canPublish && (
                <div className={liveStyles.liveActions} style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 10,
                  marginBottom: 18,
                }}>
                  <Link
                    href={`/live/create?creatorverse=${encodeURIComponent(id)}`}
                    style={{
                      padding: '11px 15px',
                      borderRadius: 10,
                      background: '#8246c6',
                      color: '#ffffff',
                      fontWeight: 700,
                      textDecoration: 'none',
                    }}
                  >
                    Create Live Show
                  </Link>
                  <Link
                    href={`/live?creatorverse=${encodeURIComponent(id)}`}
                    style={{
                      padding: '11px 15px',
                      borderRadius: 10,
                      border: '1px solid rgba(185,150,225,0.35)',
                      color: 'inherit',
                      fontWeight: 600,
                      textDecoration: 'none',
                    }}
                  >
                    Manage Live Shows
                  </Link>
                </div>
              )}

              <CreatorVerseLiveHub
                pageId={id}
                pageName={page.name}
                currentUserId={viewerId}
                onWatchLive={() => setSection('Posts')}
              />
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
      <CommunityMobileBottomNav
        viewerId={viewerId}
        avatarInitial="?"
        onCreateHere={canManage ? () => {
          setSection('Posts');
          requestAnimationFrame(() => {
            const textarea = document.querySelector<HTMLTextAreaElement>('[aria-label="Create a CreatorVerse post"] textarea');
            textarea?.scrollIntoView({block:'center',behavior:'smooth'});
            textarea?.focus();
          });
        } : undefined}
        createHereLabel="Create a CreatorVerse post"
      />
    </div>
  );
}
