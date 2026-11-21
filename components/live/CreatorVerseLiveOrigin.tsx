'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

type PageIdentity = {
  id: string;
  name: string;
};

export default function CreatorVerseLiveOrigin({
  pageId,
}: {
  pageId?: string | null;
}) {
  const [page, setPage] = useState<PageIdentity | null>(null);
  const [logoAvailable, setLogoAvailable] = useState(true);

  useEffect(() => {
    setPage(null);
    setLogoAvailable(true);

    if (!pageId) return;

    const controller = new AbortController();
    let active = true;

    async function loadPage() {
      try {
        const response = await fetch(
          `/api/creatorverse?page=${encodeURIComponent(pageId!)}`,
          {
            cache: 'no-store',
            signal: controller.signal,
          }
        );

        if (!response.ok) return;

        const result = await response.json();
        const identity = result?.page;

        if (
          !active ||
          identity?.id !== pageId ||
          typeof identity?.name !== 'string' ||
          !identity.name.trim() ||
          identity?.status !== 'active'
        ) {
          return;
        }

        setPage({
          id: identity.id,
          name: identity.name.trim(),
        });
      } catch {
        // A missing or inaccessible page must not break Live.
      }
    }

    void loadPage();

    return () => {
      active = false;
      controller.abort();
    };
  }, [pageId]);

  if (!pageId || !page) return null;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 7,
        marginTop: 5,
        fontSize: 12,
      }}
    >
      <span style={{ opacity: 0.75 }}>Live from</span>

      <Link
        href={`/creatorverse/${encodeURIComponent(page.id)}`}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          color: 'inherit',
          fontWeight: 700,
          textDecoration: 'none',
          minWidth: 0,
        }}
      >
        {logoAvailable && (
          <img
            src={`/api/creatorverse/pages/${encodeURIComponent(page.id)}/images/logo`}
            alt=""
            width={23}
            height={23}
            onError={() => setLogoAvailable(false)}
            style={{
              width: 23,
              height: 23,
              borderRadius: '50%',
              objectFit: 'cover',
            }}
          />
        )}

        <span style={{ overflowWrap: 'anywhere' }}>
          {page.name}
        </span>
      </Link>
    </div>
  );
}
