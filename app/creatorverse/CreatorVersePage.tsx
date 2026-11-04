'use client';
import Link from 'next/link';
import { usePublicRead } from '@/lib/creatorverse/usePublicRead';
import { CREATORVERSE_CATEGORIES, type PageResult } from '@/lib/creatorverse/types';
import { postCardStyle, postContentStyle } from '@/components/postPresentation';
import styles from './creatorverse.module.css';
export default function CreatorVersePage({ id }: { id: string }) {
  const { data, loading, error, retry } = usePublicRead<PageResult>(`/api/creatorverse?page=${encodeURIComponent(id)}`);
  if (loading) return <p role="status">Loading this page…</p>;
  if (error || !data) return <section className={styles.empty}><h1>Page unavailable</h1><p role="alert">{error}</p><button type="button" onClick={retry}>Try again</button></section>;
  const { page, posts } = data;
  return <>
    <p><Link href="/creatorverse">← Back to CreatorVerse</Link></p>
    <header className={styles.pageHeader}><div className={styles.brand} aria-hidden="true">{page.name.slice(0, 1)}</div><p className={styles.eyebrow}>{CREATORVERSE_CATEGORIES[page.category]}</p><h1>{page.name}</h1><p>{page.short_bio}</p></header>
    <div className={styles.pageColumns}>
      <section aria-label="Page posts"><h2>Posts</h2>{posts.length ? posts.map(post => <article key={post.id} style={postCardStyle} className={styles.post}>
        <strong>{page.name}</strong><time dateTime={post.created_at}>{new Date(post.created_at).toLocaleDateString()}</time><p style={postContentStyle}>{post.content}</p>
      </article>) : <p className={styles.empty}>This page hasn’t published any posts yet.</p>}</section>
      <aside className={styles.about}><h2>About</h2><p className={styles.description}>{page.description || page.short_bio}</p>
        {page.location && <p>{page.location}</p>}
        {page.website && <p><a href={page.website} target="_blank" rel="noopener noreferrer">Visit website ↗</a></p>}
        {page.public_email && <p><a href={`mailto:${encodeURIComponent(page.public_email)}`}>{page.public_email}</a></p>}
        {page.social_links.map(link => <p key={`${link.label}-${link.url}`}><a href={link.url} target="_blank" rel="noopener noreferrer">{link.label} ↗</a></p>)}
      </aside>
    </div>
  </>;
}
