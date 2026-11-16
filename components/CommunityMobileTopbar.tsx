'use client';

import Link from 'next/link';
import Image from 'next/image';
import styles from './CommunityMobileTopbar.module.css';

export default function CommunityMobileTopbar() {
  return (
    <nav className={styles.bar} aria-label="Community page navigation">
      <Link href="/dashboard" className={styles.ghost} aria-label="ParaGhost - Dashboard">
        <Image src="/parapost-icon-white.png" width={36} height={36} alt="ParaGhost" />
      </Link>
      <Link href="/groups" className={styles.groups}>Groups</Link>
      <Link href="/dashboard" className={styles.dashboard}>Dashboard</Link>
    </nav>
  );
}
