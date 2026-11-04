import { Suspense } from 'react';
import { creatorVerseEnabled } from '@/lib/creatorverse/config';
import CreatorVerseDirectory from './CreatorVerseDirectory';
import styles from './creatorverse.module.css';
export const dynamic = 'force-dynamic';
export default function CreatorVerseLanding() {
  return <><section className={styles.hero}><p className={styles.eyebrow}>CREATORVERSE</p><h1>CreatorVerse</h1><p>Discover creators, teams and businesses sharing their stories.</p></section>
    {creatorVerseEnabled() ? <Suspense fallback={<p role="status">Loading pages…</p>}><CreatorVerseDirectory/></Suspense> : <section className={styles.empty}><h2>A new space is taking shape.</h2><p>CreatorVerse pages aren’t available yet. Check back soon.</p></section>}
  </>;
}
