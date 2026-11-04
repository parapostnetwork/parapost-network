'use client';

import { useState } from 'react';
import type { LocalPreviewRole } from './creatorVerseLocalPosts';
import CreatorVersePostComposer from './CreatorVersePostComposer';

export default function CreatorVerseLocalRolePreview({
  pageName = 'CreatorVerse Page', avatarUrl, role: controlledRole, onRoleChange,
}: {
  pageName?: string;
  avatarUrl?: string | null;
  role?: LocalPreviewRole;
  onRoleChange?: (role: LocalPreviewRole) => void;
}) {
  const [localRole, setLocalRole] = useState<LocalPreviewRole>('visitor');
  const role = controlledRole ?? localRole;
  function setRole(next: LocalPreviewRole) { setLocalRole(next); onRoleChange?.(next); }

  const controlStyle = {
    padding: '7px 12px',
    borderRadius: 8,
    border: '1px solid #66517c',
    color: '#fff',
    cursor: 'pointer',
  };

  if (process.env.NODE_ENV !== 'development') return null;
  return (
    <>
      <div role="group" aria-label="Local role preview" style={{
        display: 'flex',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 10,
        marginBottom: 16,
      }}>
<p style={{ width: '100%', margin: 0, fontSize: 13 }}>Local simulation only — roles here do not verify account ownership or permit real publishing.</p>
        <span style={{ fontSize: 13 }}>Preview as:</span>
        <button type="button"
          style={{
            ...controlStyle,
            background: role === 'owner' ? '#69439b' : '#251c31',
          }}
          aria-pressed={role === 'owner'}
          onClick={() => setRole('owner')}>
          Page Owner
        </button>
        <button type="button"
          style={{
            ...controlStyle,
            background: role === 'visitor' ? '#69439b' : '#251c31',
          }}
          aria-pressed={role === 'visitor'}
          onClick={() => setRole('visitor')}>
          Visitor
        </button>
      </div>

      {role === 'visitor' && (
        <p style={{ fontSize: 13, color: '#c9bbd9' }}>
          Visitor preview: posting is restricted to the page owner.
          Like, Comment, Reply and Share remain available.
        </p>
      )}

      <CreatorVersePostComposer
        key={pageName}
        pageName={pageName}
        avatarUrl={avatarUrl}
        previewRole={role}
      />
    </>
  );
}
