'use client';

import { useState } from 'react';
import { usePublicRead } from '@/lib/creatorverse/usePublicRead';
import {
  discoveryQuery,
  type DiscoveryFilter,
} from '@/lib/creatorverse/discovery';
import type { DirectoryResult } from '@/lib/creatorverse/types';
import CreatorVerseDiscovery from '@/app/creatorverse/CreatorVerseDiscovery';
import styles from '@/app/creatorverse/creatorverse.module.css';

export default function CreatorVerseStagingResults({
  filter,
  onFilter,
}: {
  filter: DiscoveryFilter;
  onFilter: (value: DiscoveryFilter) => void;
}) {
  const [offset, setOffset] = useState(0);

  const { data, loading, error, retry } =
    usePublicRead<DirectoryResult>(
      `/api/creatorverse/public-preview?${discoveryQuery(filter, offset)}`
    );

  return (
    <>
      <CreatorVerseDiscovery
        rows={(data?.pages ?? []).map(page => ({
          page,
          creator: null,
        }))}
        filter={filter}
        onFilter={next => {
          setOffset(0);
          onFilter(next);
        }}
        loading={loading}
        error={error}
        retry={retry}
      />

      {!loading && !error && (
        <nav
          className={styles.pagination}
          aria-label="CreatorVerse result pages"
        >
          {offset > 0 && (
            <button
              type="button"
              onClick={() => setOffset(Math.max(0, offset - 20))}
            >
              Previous pages
            </button>
          )}

          {data?.nextOffset != null && (
            <button
              type="button"
              onClick={() => setOffset(data.nextOffset!)}
            >
              Next pages
            </button>
          )}
        </nav>
      )}
    </>
  );
}
