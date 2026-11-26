'use client';

import { useEffect, useState } from 'react';
import { searchMentionMembers, type MentionMember } from '@/lib/mentions/search';

type Props = {
  query: string | null;
  onSelect: (member: MentionMember) => void;
  onClose: () => void;
  disabled?: boolean;
};

export default function MentionSuggestions({
  query,
  onSelect,
  onClose,
  disabled = false,
}: Props) {
  const [members, setMembers] = useState<MentionMember[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    let cancelled = false;

    if (!query || disabled) {
      return;
    }

    const timer = setTimeout(() => {
      void searchMentionMembers(query)
        .then(results => {
          if (!cancelled) {
            setMembers(results);
            setSelectedIndex(0);
          }
        })
        .catch(() => {
          if (!cancelled) setMembers([]);
        });
    }, 200);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, disabled]);

  useEffect(() => {
    if (!query || disabled) {
      setMembers([]);
      setSelectedIndex(0);
    }
  }, [query, disabled]);

  useEffect(() => {
    if (!query || disabled || members.length === 0) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      } else if (event.key === 'ArrowDown') {
        event.preventDefault();
        setSelectedIndex(index => (index + 1) % members.length);
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        setSelectedIndex(index => (index - 1 + members.length) % members.length);
      } else if (event.key === 'Enter') {
        event.preventDefault();
        onSelect(members[selectedIndex]);
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [query, disabled, members, selectedIndex, onClose, onSelect]);

  if (!query || disabled || members.length === 0) return null;

  return (
    <div
      role="listbox"
      aria-label="Mention a Parapost member"
      style={{
        position: 'absolute',
        zIndex: 50,
        top: '100%',
        left: 48,
        right: 48,
        maxHeight: 240,
        overflowY: 'auto',
        padding: 6,
        border: '1px solid var(--border-color, #d4d4d4)',
        borderRadius: 12,
        background: 'var(--background, #fff)',
        boxShadow: '0 8px 24px rgba(0,0,0,.14)',
      }}
    >
      {members.map((member, index) => (
        <button
          key={member.id}
          type="button"
          role="option"
          aria-selected={index === selectedIndex}
          onMouseDown={event => event.preventDefault()}
          onClick={() => onSelect(member)}
          style={{
            display: 'block',
            width: '100%',
            padding: '10px 12px',
            textAlign: 'left',
            border: 0,
            borderRadius: 8,
            cursor: 'pointer',
            color: 'inherit',
            background: index === selectedIndex
              ? 'rgba(127,127,127,.15)'
              : 'transparent',
          }}
        >
          @{member.username}
        </button>
      ))}
    </div>
  );
}
