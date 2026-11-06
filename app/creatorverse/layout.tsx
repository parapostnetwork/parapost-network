import type { Metadata } from 'next';
import Link from 'next/link';
import styles from './creatorverse.module.css';
import CreatorVerseDetailTopBar from './CreatorVerseDetailTopBar';
export const metadata: Metadata = { title: 'CreatorVerse | Parapost Network', description: 'Your page. Your brand. Your content. Your audience.' };
export default function CreatorVerseLayout({ children }: { children: React.ReactNode }) {
  return <main className={styles.shell}>
    <CreatorVerseDetailTopBar>
      <header className={styles.navigation}><Link href="/creatorverse">PARAPOST <span>CreatorVerse</span></Link><Link href="/dashboard">Back to Dashboard</Link></header>
    </CreatorVerseDetailTopBar>
    {children}
  </main>;
}
