'use client';
import MentionTextarea from "@/components/MentionTextarea";

import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { DotsIcon } from '@/components/PostActionIcons';
import {
  dotsButtonStyle,
  postMenuStyle,
  menuItemStyle,
} from '@/components/postPresentation';

type Props = {
  pageId: string;
  postId: string;
  content: string;
  hasMedia: boolean;
  onEdited: (content: string) => void;
  onDeleted: () => void;
};

export default function CreatorVersePostOwnerMenu({
  pageId,
  postId,
  content,
  hasMedia,
  onEdited,
  onDeleted,
}: Props) {
  const menu = useRef<HTMLDetailsElement>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(content);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!editing) setDraft(content);
  }, [content, editing]);

  async function request(
    method: 'PATCH' | 'DELETE',
    nextContent?: string
  ) {
    const { data, error: authError } =
      await supabase.auth.getSession();

    const token = data.session?.access_token;

    if (authError || !token) {
      throw new Error('Sign in to manage this post.');
    }

    const response = await fetch(
      `/api/creatorverse/${encodeURIComponent(pageId)}` +
        `/posts/${encodeURIComponent(postId)}`,
      {
        method,
        cache: 'no-store',
        headers: {
          Authorization: `Bearer ${token}`,
          ...(method === 'PATCH'
            ? { 'Content-Type': 'application/json' }
            : {}),
        },
        ...(method === 'PATCH'
          ? { body: JSON.stringify({ content: nextContent }) }
          : {}),
      }
    );

    if (!response.ok) {
      throw new Error(
        method === 'PATCH'
          ? 'Unable to edit this post.'
          : 'Unable to delete this post.'
      );
    }
  }

  async function save() {
    const next = draft.trim();

    if (busy || next.length > 5000 || (!next && !hasMedia)) {
      return;
    }

    setBusy(true);
    setError('');

    try {
      await request('PATCH', next);
      onEdited(next);
      setEditing(false);
      menu.current?.removeAttribute('open');
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : 'Unable to save changes.'
      );
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (busy || !window.confirm(
      'Delete this post? This action cannot be undone.'
    )) {
      return;
    }

    setBusy(true);
    setError('');

    try {
      await request('DELETE');
      onDeleted();
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : 'Unable to delete this post.'
      );
      setBusy(false);
    }
  }

  return (
    <div style={{ position: 'static' }}>
      <details
        ref={menu}
        style={{
          position: 'absolute',
          top: 14,
          right: 16,
          zIndex: 30,
        }}
      >
        <summary
          aria-label="Post options"
          title="Post options"
          style={{
            ...dotsButtonStyle,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            listStyle: 'none',
            cursor: 'pointer',
            margin: 0,
          }}
        >
          <DotsIcon />
        </summary>

        <div
          style={{
            ...postMenuStyle,
            position: 'absolute',
            top: 'calc(100% + 4px)',
            right: 0,
            margin: 0,
            width: 180,
            maxWidth: 'calc(100vw - 24px)',
            zIndex: 50,
          }}
        >
          <button
            type="button"
            style={menuItemStyle}
            disabled={busy}
            onClick={() => {
              setDraft(content);
              setEditing(true);
              setError('');
              menu.current?.removeAttribute('open');
            }}
          >
            Edit Post
          </button>

          <button
            type="button"
            style={menuItemStyle}
            disabled={busy}
            onClick={() => void remove()}
          >
            Delete Post
          </button>
        </div>
      </details>

      {editing && (
        <div style={{
          display: 'grid',
          gap: 10,
          marginTop: 10,
        }}>
          <MentionTextarea mentionContext={{ surface: "creatorverse", containerId: pageId, postId }} disabled={busy}
            aria-label="Edit CreatorVerse post"
            value={draft}
            maxLength={5000}
            onChange={event => setDraft(event.target.value)}
            rows={4}
            style={{
              width: '100%',
              padding: 12,
              borderRadius: 8,
              color: 'inherit',
              background: 'inherit',
            }}
          />

          <div style={{ display: 'flex', gap: 10 }}>
            <button
              type="button"
              disabled={
                busy ||
                (!draft.trim() && !hasMedia)
              }
              onClick={() => void save()}
            >
              {busy ? 'Saving…' : 'Save'}
            </button>

            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setEditing(false);
                setDraft(content);
                setError('');
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {error && <p role="alert">{error}</p>}
    </div>
  );
}
