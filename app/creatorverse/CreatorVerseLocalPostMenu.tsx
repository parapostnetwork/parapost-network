'use client';

import { useRef, useState } from 'react';
import { DotsIcon } from '@/components/PostActionIcons';
import { postContentStyle } from '@/components/postPresentation';
import styles from './CreatorVerseLocalPostMenu.module.css';

type Props = {
  content: string;
  hasAttachments: boolean;
  canManage: boolean;
  onSave: (text: string) => boolean;
  onDelete: () => void;
};

export default function CreatorVerseLocalPostMenu({
  content,
  hasAttachments,
  canManage,
  onSave,
  onDelete,
}: Props) {
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(content);
  const [error, setError] = useState('');

  function startEdit() {
    if (!canManage) return;
    setDraft(content);
    setError('');
    setEditing(true);
    setOpen(false);
  }

  function saveEdit() {
    if (!canManage) return;

    const next = draft.trim();

    if (!next && !hasAttachments) {
      setError('A text-only post cannot be empty.');
      return;
    }

    if (!onSave(next)) {
      setError('The edit was not saved. Check the post status and browser storage.');
      return;
    }
    setEditing(false);
    setError('');
  }

  function deletePost() {
    if (!canManage) return;

    if (!window.confirm(
      'Delete this local test post? This cannot be undone.'
    )) return;

    setOpen(false);
    onDelete();
  }

  return (
    <>
      {canManage && (
        <div className={styles.anchor}>
          <button
            type="button"
            ref={trigger}
            className={styles.trigger}
            aria-label="Post options"
            aria-expanded={open}
            aria-haspopup="menu"
            onClick={() => setOpen(value => !value)}
          >
            <DotsIcon />
          </button>

          {open && (
            <div
              role="menu"
              aria-label="Manage post"
              className={styles.menu}
              onKeyDown={event => {
                if (event.key === 'Escape') { setOpen(false); trigger.current?.focus(); }
                if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                  event.preventDefault();
                  const items = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'));
                  const index = items.indexOf(document.activeElement as HTMLButtonElement);
                  items[(index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus();
                }
              }}
            >
              <button type="button" role="menuitem" autoFocus
                onClick={startEdit}>
                Edit Post
              </button>
              <button type="button" role="menuitem"
                className={styles.danger}
                onClick={deletePost}>
                Delete Post
              </button>
            </div>
          )}
        </div>
      )}

      {editing && canManage ? (
        <div className={styles.editor}>
          <label className={styles.label}>
            Edit post
            <textarea
              value={draft}
              rows={4}
              maxLength={5000}
              onChange={event => {
                setDraft(event.target.value);
                setError('');
              }}
            />
          </label>

          {hasAttachments && (
            <p className={styles.note}>
              Existing photos and videos will be kept.
            </p>
          )}

          {error && <p role="alert" className={styles.error}>{error}</p>}

          <div className={styles.editorButtons}>
            <button type="button" onClick={saveEdit}>
              Save Changes
            </button>
            <button type="button" onClick={() => {
              setEditing(false);
              setError('');
            }}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <p style={postContentStyle}>{content}</p>
      )}
    </>
  );
}
