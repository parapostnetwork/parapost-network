'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createPortal } from 'react-dom';
import styles from './CommunityMobileBottomNav.module.css';

/** Group and CreatorVerse mobile navigation. Visual geometry mirrors the current Dashboard/Profile bar. */
export default function CommunityMobileBottomNav({
  viewerId,
  avatarUrl,
  avatarInitial = '?',
  onCreateHere,
  createHereLabel = 'Create a post here',
}: {
  viewerId: string;
  avatarUrl?: string | null;
  avatarInitial?: string;
  onCreateHere?: () => void;
  createHereLabel?: string;
}) {
  const [createOpen, setCreateOpen] = useState(false);

  // Anchor tablet navigation outside scrolling containers.
  const [tabletPortal, setTabletPortal] = useState(false);

  useEffect(() => {
    const query = window.matchMedia(
      '(min-width: 761px) and (max-width: 1180px)'
    );

    const update = () => setTabletPortal(query.matches);

    update();
    query.addEventListener('change', update);

    return () => query.removeEventListener('change', update);
  }, []);

  const navContent = (
    <>
      <nav className={styles.nav} data-parapost-edge-nav="true" aria-label="Primary bottom navigation">
        <Link href="/dashboard" className={styles.item} aria-label="Home">
          <span className={styles.icon}><svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 3.4L3.5 10.6V20.2H9V14H15V20.2H20.5V10.6L12 3.4Z"/></svg></span>
          <span className={styles.label}>Home</span>
        </Link>
        <Link href="/reels" className={styles.item} aria-label="Reels">
          <span className={styles.icon}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="4" y="5" width="16" height="15" rx="3" stroke="currentColor" strokeWidth="1.8"/><path d="M8 5L10 10M14 5L16 10M4 10H20" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg></span>
          <span className={styles.label}>Reels</span>
        </Link>
        <button type="button" className={styles.create} aria-label="Create" aria-expanded={createOpen} aria-controls="community-mobile-create-menu" onClick={() => setCreateOpen(value => !value)}>
          <span className={styles.icon}><svg width="21" height="21" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 5V19M5 12H19" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"/></svg></span>
          <span className={styles.createSpacer} aria-hidden="true">Create</span>
        </button>
        <Link href="/messages" className={styles.item} aria-label="Parachat">
          <span className={styles.icon} aria-hidden="true" style={{fontSize:22}}>☏</span>
          <span className={styles.label}>Parachat</span>
        </Link>
        <Link href={viewerId ? `/profile/${viewerId}` : '/dashboard'} className={styles.item} aria-label="Profile">
          <span className={styles.icon}>{avatarUrl ? <img src={avatarUrl} alt="" className={styles.avatar} /> : <span className={styles.avatarFallback}>{avatarInitial && avatarInitial !== '?' ? avatarInitial.slice(0,1).toUpperCase() : <svg width="19" height="19" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="1.8"/><path d="M4 21c0-4.5 3.2-7 8-7s8 2.5 8 7" stroke="currentColor" strokeWidth="1.8"/></svg>}</span>}</span>
          <span className={styles.label}>Profile</span>
        </Link>
      </nav>
      {createOpen && <div className={styles.menu} id="community-mobile-create-menu" role="group" aria-label="Create options">
        {onCreateHere && <button type="button" onClick={() => {setCreateOpen(false);onCreateHere();}}>{createHereLabel}</button>}
        <Link href="/dashboard" onClick={() => setCreateOpen(false)}>Go to Dashboard to create a post</Link>
        <button type="button" onClick={() => setCreateOpen(false)}>Cancel</button>
      </div>}
    </>
  );

  return tabletPortal
    ? createPortal(navContent, document.body)
    : navContent;
}
