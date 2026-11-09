'use client';

import { useState, type CSSProperties } from 'react';

export default function ExpandablePostText({
  text, style
}: {
  text: string;
  style?: CSSProperties;
}) {
  const [expanded, setExpanded] = useState(false);
  const limit = 300;
  const needsMore = text.length > limit;
  const preview = text.slice(0, limit);
  const boundary = preview.lastIndexOf(' ');
  const excerpt = boundary > 220
    ? preview.slice(0, boundary)
    : preview;

  return (
    <div style={{ minWidth: 0 }}>
      <p style={{
        ...style,
        whiteSpace: 'pre-wrap',
        overflowWrap: 'anywhere'
      }}>
        {needsMore && !expanded
          ? excerpt.trimEnd() + '…'
          : text}
      </p>
      {needsMore && (
        <button type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded(value => !value)}
          style={{
            border: 0,
            padding: '2px 0',
            color: '#c9a7ff',
            background: 'transparent',
            cursor: 'pointer',
            fontWeight: 700
          }}>
          {expanded ? 'See Less' : 'See More'}
        </button>
      )}
    </div>
  );
}
