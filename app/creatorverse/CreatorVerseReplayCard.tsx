'use client';

import { useState } from 'react';
import { postCardStyle } from '@/components/postPresentation';
import LiveChatPanel from '@/components/live/LiveChatPanel';
import CreatorVerseReplayPlayer from './CreatorVerseReplayPlayer';

export type CreatorVerseReplayShow = {
  id: string;
  user_id: string;
  title: string | null;
  description: string | null;
  provider: string | null;
  views: number | null;
  status: string;
  scheduled_at: string | null;
  started_at: string | null;
  ended_at: string | null;
  updated_at: string | null;
  external_url: string | null;
  embed_url: string | null;
  thumbnail_url: string | null;
};

function formatReplayDate(value: string | null) {
  if (!value) return 'DATE UNAVAILABLE';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'DATE UNAVAILABLE';
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  }).toUpperCase();
}

function originalBroadcastUrl(value: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    if (url.protocol !== 'https:') return null;
    if (
      host === 'youtube.com' || host.endsWith('.youtube.com') ||
      host === 'youtu.be' || host === 'twitch.tv' ||
      host.endsWith('.twitch.tv')
    ) return url.href;
  } catch {
    // Invalid links should not be rendered.
  }
  return null;
}

export default function CreatorVerseReplayCard({
  show,
  currentUserId,
}: {
  show: CreatorVerseReplayShow;
  currentUserId: string | null;
}) {
  const [discussionOpen, setDiscussionOpen] = useState(false);
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);

  const description = show.description?.trim() || '';
  const longDescription = description.length > 150;
  const visibleDescription = longDescription && !descriptionExpanded
    ? `${description.slice(0, 150).trimEnd()}…`
    : description;
  const date = formatReplayDate(
    show.ended_at || show.started_at || show.scheduled_at || show.updated_at
  );
  const originalUrl = originalBroadcastUrl(show.external_url);
  const discussionId = `creatorverse-replay-discussion-${show.id}`;

  return (
    <article
      aria-label={`Replay: ${show.title || 'Parapost Live Show'}`}
      style={{
        ...postCardStyle,
        minWidth: 0,
        overflow: 'hidden',
        marginBottom: 18,
        padding: 14,
        borderColor: 'rgba(148,163,184,0.22)',
      }}
    >
      <CreatorVerseReplayPlayer
        title={show.title || 'Parapost Live Show'}
        externalUrl={show.external_url}
        embedUrl={show.embed_url}
        thumbnailUrl={show.thumbnail_url}
        active={false}
        onToggle={() => {}}
        inline
      />

      <div style={{ paddingTop: 12, minWidth: 0 }}>
        <div style={{
          fontSize: 12,
          fontWeight: 800,
          color: '#c5c0d5',
          letterSpacing: '0.02em',
          textTransform: 'uppercase',
          marginBottom: 7,
        }}>
          Replay from {date} · {Math.max(0, show.views ?? 0).toLocaleString()} views
        </div>

        <h3 style={{
          margin: '0 0 6px',
          fontSize: '1.05rem',
          lineHeight: 1.4,
          overflowWrap: 'anywhere',
        }}>
          {show.title || 'Parapost Live Show'}
        </h3>

        {description && (
          <p style={{
            margin: '0 0 5px',
            fontSize: 14,
            lineHeight: 1.5,
            whiteSpace: 'pre-wrap',
            overflowWrap: 'anywhere',
          }}>
            {visibleDescription}
          </p>
        )}
        {longDescription && (
          <button
            type="button"
            onClick={() => setDescriptionExpanded(value => !value)}
            aria-expanded={descriptionExpanded}
            style={{
              display: 'block',
              margin: '0 0 11px',
              padding: '5px 0',
              background: 'transparent',
              border: 0,
              color: '#d8b4fe',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            {descriptionExpanded ? '▾ Less' : '▸ More'}
          </button>
        )}

        <button
          type="button"
          aria-expanded={discussionOpen}
          aria-controls={discussionId}
          onClick={() => setDiscussionOpen(value => !value)}
          style={{
            width: '100%',
            minHeight: 44,
            marginTop: 12,
            padding: '10px 14px',
            borderRadius: 12,
            border: '1px solid rgba(216,180,254,0.18)',
            background: 'rgba(168,85,247,0.12)',
            color: '#f5f3ff',
            fontSize: 13,
            fontWeight: 800,
            cursor: 'pointer',
          }}
        >
          {discussionOpen
            ? 'Hide replay discussion'
            : 'View replay discussion / add comment'}
        </button>

        {discussionOpen && (
          <div
            id={discussionId}
            role="region"
            aria-label="Replay discussion"
            style={{ paddingTop: 12 }}
          >
            <LiveChatPanel
              liveStreamId={show.id}
              creatorUserId={show.user_id}
              currentUserId={currentUserId ?? ''}
              status="ended"
              compact
              maxVisibleMessages={4}
            />
          </div>
        )}

        {originalUrl && (
          <a
            href={originalUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'inline-block',
              marginTop: 12,
              fontSize: 12,
              color: '#d8b4fe',
            }}
          >
            Open original broadcast
          </a>
        )}
      </div>
    </article>
  );
}
