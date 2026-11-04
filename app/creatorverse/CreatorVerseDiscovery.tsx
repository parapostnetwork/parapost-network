'use client';
import { useState } from 'react';

import Link from 'next/link';
import Image from 'next/image';
import { CREATORVERSE_CATEGORIES } from '@/lib/creatorverse/types';
import { creatorProfileHref, creatorVersePageHref, samplePageHref, uniqueDiscoveryPages, type DiscoveryFilter, type DiscoveryPage } from '@/lib/creatorverse/discovery';
import { GroupsLoadingCards } from '@/app/groups/GroupsLoadingView';
import groupStyles from '@/app/groups/groups.module.css';
import styles from './CreatorVerseDiscovery.module.css';

export function DiscoverySearch({ value, onChange, placeholder = 'Search pages, creators or categories' }: { value: string; onChange: (value: string) => void; placeholder?: string }) {
  return <label className={groupStyles.search}>Search CreatorVerse
    <span className={`${groupStyles.directorySearchInput} ${styles.searchInput}`}>
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><circle cx="10" cy="10" r="7"/><path d="m15 15 6 6"/></svg>
      <input type="search" maxLength={100} placeholder={placeholder} value={value} onChange={event => onChange(event.target.value)}/>
      {value && <button type="button" className={styles.clear} aria-label="Clear CreatorVerse search" onClick={() => onChange('')}>×</button>}
    </span>
  </label>;
}

export default function CreatorVerseDiscovery({ rows, filter, onFilter, loading = false, error = '', retry }: {
  rows: readonly DiscoveryPage[]; filter: DiscoveryFilter; onFilter: (filter: DiscoveryFilter) => void;
  loading?: boolean; error?: string; retry?: () => void;
}) {
  const pages = uniqueDiscoveryPages(rows);
  const [mobileCategoryOpen, setMobileCategoryOpen] = useState(false);
  const filtered = Boolean(filter.search || filter.category);
  return <section className={styles.discovery} aria-label="CreatorVerse discovery" aria-busy={loading}>
    <div className={styles.filters}>
      <label className={styles.desktopCategory}>Category <select value={filter.category} onChange={event => onFilter({ ...filter, category: event.target.value as DiscoveryFilter['category'] })}>
        <option value="">All CreatorVerse pages</option>
        {Object.entries(CREATORVERSE_CATEGORIES).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
      </select></label>

      <div className={styles.mobileCategory}>
        <span>Category</span>
        <button
          type="button"
          className={styles.mobileCategoryTrigger}
          aria-expanded={mobileCategoryOpen}
          aria-controls="creatorverse-mobile-category-options"
          onClick={() => setMobileCategoryOpen(open => !open)}
        >
          <span>{filter.category
            ? CREATORVERSE_CATEGORIES[filter.category]
            : 'All CreatorVerse pages'}</span>
          <span aria-hidden="true">▾</span>
        </button>

        {mobileCategoryOpen && (
          <div
            id="creatorverse-mobile-category-options"
            className={styles.mobileCategoryOptions}
            role="group"
            aria-label="Choose CreatorVerse category"
            onKeyDown={event => {
              if (event.key === 'Escape') {
                setMobileCategoryOpen(false);
              }
            }}
          >
            <button
              type="button"
              className={styles.mobileCategoryOption}
              aria-pressed={!filter.category}
              onClick={() => {
                onFilter({ ...filter, category: '' });
                setMobileCategoryOpen(false);
              }}
            >
              All CreatorVerse pages
              {!filter.category && <span aria-hidden="true">✓</span>}
            </button>
            {Object.entries(CREATORVERSE_CATEGORIES).map(([key, label]) => (
              <button
                key={key}
                type="button"
                className={styles.mobileCategoryOption}
                aria-pressed={filter.category === key}
                onClick={() => {
                  onFilter({
                    ...filter,
                    category: key as DiscoveryFilter['category']
                  });
                  setMobileCategoryOpen(false);
                }}
              >
                {label}
                {filter.category === key &&
                  <span aria-hidden="true">✓</span>}
              </button>
            ))}
          </div>
        )}
      </div>
      {filtered && <button type="button" className={styles.reset} onClick={() => onFilter({ search: '', category: '' })}>Reset filters</button>}
    </div>
    {loading ? <><p role="status">Loading CreatorVerse pages…</p><GroupsLoadingCards /></> : error ? <div className={styles.empty} role="alert"><h2>Pages are unavailable</h2><p>{error}</p>{retry && <button type="button" onClick={retry}>Try again</button>}</div> : <>
      <p className={styles.resultCount} role="status">{pages.length} {pages.length === 1 ? 'page' : 'pages'}{filter.category ? ` · ${CREATORVERSE_CATEGORIES[filter.category]}` : ''}</p>
      {pages.length ? <div className={`${groupStyles.directoryCardGrid} ${styles.cardGrid}`}>{pages.map(({ page, creator, sample }) => {
        const profile = creatorProfileHref(creator);
        return <article key={page.id.toLowerCase()} className={`${groupStyles.directoryCard} ${styles.card}`}>
          <Link href={sample ? samplePageHref(page.id) : creatorVersePageHref(page.id)} prefetch={false} className={`${groupStyles.directoryOpen} ${styles.open}`} aria-label={`Open ${page.name}`}>
            <div className={styles.avatar} aria-hidden="true"><Image src="/parapost-icon-white.png" alt="" width={48} height={48}/></div>
            <div className={styles.content}><h3>{page.name}</h3><p className={styles.description}>{page.short_bio || page.description || 'Explore this CreatorVerse page.'}</p><span className={styles.category}>{CREATORVERSE_CATEGORIES[page.category]}</span>{sample && <span className={styles.sample}>Sample page</span>}</div>
            <span className={groupStyles.directoryChevron} aria-hidden="true">›</span>
          </Link>
          {creator && <p className={styles.creator}>By {profile ? <Link href={profile} prefetch={false}>{creator.name}</Link> : creator.name}</p>}
        </article>;
      })}</div> : <div className={styles.empty}><h2>{filtered ? 'No matching pages' : 'No pages to explore yet'}</h2><p>{filtered ? 'Try another name, description or category.' : 'Published CreatorVerse pages will appear here.'}</p>{filtered && <button type="button" onClick={() => onFilter({ search: '', category: '' })}>Show all pages</button>}</div>}
    </>}
  </section>;
}
