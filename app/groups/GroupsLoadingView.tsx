import styles from './groups.module.css';

export function GroupsLoadingCards() {
  return (
    <div className={styles.groupsSkeletonStatus} role="status" aria-label="Loading Groups">
      <p>Loading Groups…</p>
      <div className={styles.groupsSkeletonGrid} aria-hidden="true">
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index} className={styles.groupsSkeletonCard}>
            <div className={styles.groupsSkeletonMedia} />
            <div className={styles.groupsSkeletonContent}>
              <div className={styles.groupsSkeletonLine} />
              <div className={`${styles.groupsSkeletonLine} ${styles.groupsSkeletonShort}`} />
              <div className={`${styles.groupsSkeletonLine} ${styles.groupsSkeletonShort}`} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function GroupsLoadingView({
  title = 'Groups'
}: {
  title?: string;
}) {
  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.topbar}>
          <span>Parapost Network</span>
          <span>Groups</span>
        </header>
        <section className={`${styles.hero} ${styles.directoryHero}`}>
          <div>
            <p className={styles.eyebrow}>COMMUNITY CONNECTIONS</p>
            <h1>{title}</h1>
            <p>Connect, share and explore communities.</p>
          </div>
        </section>
        <GroupsLoadingCards />
      </div>
    </main>
  );
}
