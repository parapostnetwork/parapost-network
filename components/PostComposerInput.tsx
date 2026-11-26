'use client';

import type { CSSProperties, ReactNode, TextareaHTMLAttributes } from 'react';
import MentionTextarea from './MentionTextarea';
import type { MentionContext } from '@/lib/mentionLookup';
import { composerTopRowStyle, composerInputStyle, composerImageButtonStyle } from './postPresentation';

export function PhotoIcon() {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M4 17L8.5 12.5L11 15L15.5 10.5L20 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <rect x="3" y="5" width="18" height="15" rx="3" stroke="currentColor" strokeWidth="2" />
  </svg>;
}

// Keep each surface's responsive class hooks and upload rules intact.
export default function PostComposerInput({ avatar, inputProps, onSelectMedia, className,
  mediaLabel = 'Upload photos', disabled = false, rowStyle = composerTopRowStyle,
  inputStyle = composerInputStyle, mediaStyle = composerImageButtonStyle, mentionContext, mentionsDisabled = false, showMediaButton = true,
}: {
  avatar: ReactNode;
  inputProps: TextareaHTMLAttributes<HTMLTextAreaElement>;
  onSelectMedia: () => void;
  className?: string;
  mediaLabel?: string;
  disabled?: boolean;
  rowStyle?: CSSProperties;
  inputStyle?: CSSProperties;
  mediaStyle?: CSSProperties;
  mentionContext?: MentionContext;
  mentionsDisabled?: boolean;
  showMediaButton?: boolean;
}) {
  return <div className={className} style={rowStyle}>
    {avatar}
    <MentionTextarea rows={2} style={inputStyle} disabled={disabled} {...inputProps}
      mentionContext={mentionContext} mentionsDisabled={mentionsDisabled} />
    {showMediaButton && (
      <button type="button" onClick={onSelectMedia} style={mediaStyle} aria-label={mediaLabel} disabled={disabled}>
        <PhotoIcon />
      </button>
    )}
  </div>;
}
