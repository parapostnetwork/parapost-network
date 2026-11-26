'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import ResponsiveMediaImage from '@/components/ResponsiveMediaImage';
import styles from './CreatorVerseFollowers.module.css';

type Follower = {
  id: string;
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
  sort_key: string;
};

const PAGE_SIZE = 25;

export function FollowersIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="1.8"
      strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
      <circle cx="9" cy="7" r="4"/>
      <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>
    </svg>
  );
}

export function FollowerCountLabel({ count }: {
  count: number | null;
}) {
  return (
    <span className={styles.count}>
      <FollowersIcon />
      {count === null ? 'Followers' :
        `${count.toLocaleString()} ${count === 1 ? 'Follower' : 'Followers'}`}
    </span>
  );
}

function FollowerList({ pageId, search }: {
  pageId: string;
  search: string;
}) {
  const [rows, setRows] = useState<Follower[]>([]);
  const [cursor, setCursor] = useState<Follower | null>(null);
  const [busy, setBusy] = useState(true);
  const [more, setMore] = useState(false);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const sentinel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();

    const timer = window.setTimeout(async () => {
      setBusy(true);
      setError('');

      try {
        const result = await supabase.rpc(
          'parapost_creatorverse_followers',
          {
            p_page_id: pageId,
            p_search: search.trim().replace(/^@/, ''),
            p_after_name: cursor?.sort_key ?? null,
            p_after_id: cursor?.id ?? null
          }
        ).abortSignal(controller.signal);

        if (!active) return;
        if (result.error) throw result.error;

        const next = (result.data ?? []) as Follower[];

        setRows(previous => {
          if (!cursor) return next;
          const seen = new Set(previous.map(row => row.id));
          return [...previous, ...next.filter(row => !seen.has(row.id))];
        });

        setMore(next.length === PAGE_SIZE);
      } catch {
        if (active) setError('Unable to load followers. Please retry.');
      } finally {
        if (active) setBusy(false);
      }
    }, cursor ? 0 : 200);

    return () => {
      active = false;
      clearTimeout(timer);
      controller.abort();
    };
  }, [pageId, search, cursor, retry]);

  useEffect(() => {
    if (busy || error || !more || !sentinel.current ||
        !listRef.current || !rows.length) return;

    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) {
        setBusy(true);
        setCursor(rows[rows.length - 1]);
      }
    }, {
      root: listRef.current,
      rootMargin: '80px'
    });

    observer.observe(sentinel.current);
    return () => observer.disconnect();
  }, [busy, error, more, rows]);

  return (
    <div ref={listRef} className={styles.list}
      aria-busy={busy}>
      {rows.map(person => (
        <Link key={person.id} href={`/profile/${person.id}`}
          className={styles.person}>
          <span className={styles.avatar}>
            {person.avatar_url ? (
              <ResponsiveMediaImage
                src={person.avatar_url}
                purpose="avatar"
                avatarSize={44}
                alt=""
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: '50%',
                  objectFit: 'cover'
                }}
              />
            ) : (
              (person.full_name || person.username || '?')
                .charAt(0).toUpperCase()
            )}
          </span>

          <span className={styles.personText}>
            <strong>{person.full_name || person.username || 'Parapost member'}</strong>
            {person.username && <small>@{person.username}</small>}
          </span>

          <span aria-hidden="true" className={styles.chevron}>›</span>
        </Link>
      ))}

      {busy && <p className={styles.message}>Loading followers...</p>}

      {!busy && !error && !rows.length && (
        <p className={styles.message}>
          {search ? 'No matching followers.' : 'No visible followers yet.'}
        </p>
      )}

      {error && (
        <div className={styles.message} role="alert">
          <p>{error}</p>
          <button type="button" onClick={() => {
            setBusy(true);
            setRetry(value => value + 1);
          }}>Retry</button>
        </div>
      )}

      {more && !busy && !error && (
        <div ref={sentinel}>
          <button type="button" className={styles.loadMore}
            onClick={() => {
              setBusy(true);
              setCursor(rows[rows.length - 1]);
            }}>
            Load more followers
          </button>
        </div>
      )}
    </div>
  );
}

export default function CreatorVerseFollowers({ pageId }: {
  pageId: string;
}) {
  const [count, setCount] = useState<number | null>(null);
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    let active = true;
    let sequence = 0;
    let previousViewer: string | null | undefined;

    async function refresh() {
      const current = ++sequence;

      try {
        const result = await supabase.rpc(
          'creatorverse_directory_member_counts',
          { p_page_ids: [pageId] }
        );

        if (!active || current !== sequence) return;

        const value = result.data?.[0]?.member_count;
        const next = Number(value);

        setCount(!result.error && value != null &&
          Number.isSafeInteger(next) && next >= 0 ? next : null);
      } catch {
        if (active && current === sequence) setCount(null);
      }
    }

    function updateSession(id: string | null) {
      if (!active) return;

      if (previousViewer !== undefined && previousViewer !== id) {
        dialog.current?.close();
        setOpen(false);
        setCount(null);
      }

      previousViewer = id;
      setViewerId(id);
      void refresh();
    }

    const eventName = `creatorverse-follow-change:${pageId}`;

    window.addEventListener(eventName, refresh);
    window.addEventListener('focus', refresh);

    void supabase.auth.getSession().then(({ data }) => {
      if (active && previousViewer === undefined)
        updateSession(data.session?.user?.id ?? null);
    }).catch(() => {
      if (active && previousViewer === undefined) updateSession(null);
    });

    const { data: subscription } =
      supabase.auth.onAuthStateChange((_event, session) => {
        Promise.resolve().then(() => {
          if (active) updateSession(session?.user?.id ?? null);
        });
      });

    return () => {
      active = false;
      sequence++;
      window.removeEventListener(eventName, refresh);
      window.removeEventListener('focus', refresh);
      subscription.subscription.unsubscribe();
    };
  }, [pageId]);

  function openFollowers() {
    setSearch('');
    if (dialog.current && !dialog.current.open) {
      dialog.current.showModal();
      setOpen(true);
      window.dispatchEvent(new Event(
        `creatorverse-follow-change:${pageId}`
      ));
    }
  }

  return (
    <>
      <button type="button" className={styles.trigger}
        aria-haspopup="dialog"
        onClick={openFollowers}>
        <FollowerCountLabel count={count} />
      </button>

      <dialog ref={dialog} className={styles.dialog}
        aria-label="CreatorVerse followers"
        onClose={() => setOpen(false)}>

        {open && (
          <div className={styles.panel}>
            <div className={styles.header}>
              <h2>Followers{count !== null ? ` (${count.toLocaleString()})` : ''}</h2>
              <button type="button" className={styles.close}
                aria-label="Close followers"
                onClick={() => dialog.current?.close()}>×</button>
            </div>

            {viewerId ? (
              <>
                <div className={styles.search}>
                  <svg width="18" height="18" viewBox="0 0 24 24"
                    fill="none" stroke="currentColor" strokeWidth="2"
                    aria-hidden="true">
                    <circle cx="11" cy="11" r="7"/>
                    <path d="m16 16 5 5"/>
                  </svg>

                  <input
                    type="search"
                    aria-label="Search followers"
                    placeholder="Search followers"
                    maxLength={100}
                    value={search}
                    onChange={event => setSearch(event.target.value)}
                  />
                </div>

                <FollowerList
                  key={`${pageId}:${viewerId}:${search}`}
                  pageId={pageId}
                  search={search}
                />
              </>
            ) : (
              <p className={styles.message}>
                <Link href="/">Sign in</Link> to view followers.
              </p>
            )}
          </div>
        )}
      </dialog>
    </>
  );
}
