'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePublicRead } from '@/lib/creatorverse/usePublicRead';

type PageIdentity = {
  id: string;
  name: string;
};

type PublicPageResponse = {
  page?: {
    id: string;
    name: string;
    status?: string;
  } | null;
};

export default function CreatorVerseLiveOrigin({
  pageId,
}: {
  pageId?: string | null;
}) {
  if (!pageId) return null;

  return (
    <CreatorVerseLiveOriginPage
      key={pageId}
      pageId={pageId}
    />
  );
}

function CreatorVerseLiveOriginPage({
  pageId,
}: {
  pageId: string;
}) {
  const [logoAvailable, setLogoAvailable] = useState(true);

  const { data } = usePublicRead<PublicPageResponse>(
    `/api/creatorverse?page=${encodeURIComponent(pageId)}`
  );

  const identity = data?.page;

  const page: PageIdentity | null =
    identity?.id === pageId &&
    typeof identity.name === 'string' &&
    identity.name.trim().length > 0 &&
    (!identity.status || identity.status === 'active')
      ? {
          id: identity.id,
          name: identity.name.trim(),
        }
      : null;

  if (!page) return null;

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
