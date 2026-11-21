'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { HeartIcon, CommentIcon, ShareIcon } from '@/components/PostActionIcons';

const buttonStyle = {
  flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
  gap: 8, minHeight: 48, border: 0, background: 'transparent',
  color: '#d1d5db', fontWeight: 800, fontSize: 15, cursor: 'pointer',
} as const;

export function CommunityOverlayActions({
  liked, onLike, onComment, onShare, disabled = false,
}: {
  liked: boolean;
  onLike: () => void;
  onComment: () => void;
  onShare?: () => void;
  disabled?: boolean;
}) {
  return <div aria-label="Post actions" style={{
    display: 'flex', alignItems: 'stretch', gap: 4,
    borderTop: '1px solid rgba(255,255,255,.09)',
    borderBottom: '1px solid rgba(255,255,255,.09)',
    marginTop: 12,
  }}>
    <button type="button" disabled={disabled} aria-pressed={liked}
      onClick={onLike} style={{...buttonStyle, opacity: disabled ? .55 : 1}}>
      <HeartIcon filled={liked} /> <span>Like</span>
    </button>
    <button type="button" onClick={onComment} style={buttonStyle}>
      <CommentIcon /> <span>Comment</span>
    </button>
    {onShare && <button type="button" onClick={onShare} style={buttonStyle}>
      <ShareIcon /> <span>Share</span>
    </button>}
  </div>;
}

type Props = {
  title: string;
  onClose: () => void;
  children: ReactNode;
  postPreview?: ReactNode;
  postActions?: ReactNode;
  composer?: ReactNode;
  commentCount?: number;
  likeCount?: number;
  shareCount?: number;
};

/** Full post + comments dialog; layout mirrors Dashboard's three-row modal.
 * Source post and its existing interaction handlers remain mounted on the feed.
 */
export default function CommunityCommentsOverlay({
  title, onClose, children, postPreview, postActions, composer,
  commentCount, likeCount, shareCount,
}: Props) {
  const dialog = useRef<HTMLElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const focused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const body = document.body.style;
    const html = document.documentElement.style;
    const previous = {
      bodyOverflow: body.overflow, htmlOverflow: html.overflow,
      bodyOverscroll: body.overscrollBehavior, htmlOverscroll: html.overscrollBehavior,
    };
    // Keep the established iPad scroll-preservation behaviour.
    const tablet = window.matchMedia('(min-width: 768px) and (max-width: 1180px)').matches;
    if (!tablet) {
      body.overflow = 'hidden';
      html.overflow = 'hidden';
    }
    body.overscrollBehavior = 'none';
    html.overscrollBehavior = 'none';
    closeButton.current?.focus({ preventScroll: true });
    const onKey = (event: KeyboardEvent) => {
      // The full-screen image viewer is stacked above this dialog; only it
      // should handle Escape until the image is closed.
      if (document.querySelector('[role="dialog"][aria-label="Post media viewer"]')) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        closeRef.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const controls = Array.from(dialog.current?.querySelectorAll<HTMLElement>(
        'button:not(:disabled), a[href], input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [tabindex="0"]'
      ) ?? []);
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault(); last.focus({preventScroll:true});
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first.focus({preventScroll:true});
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      body.overflow = previous.bodyOverflow;
      html.overflow = previous.htmlOverflow;
      body.overscrollBehavior = previous.bodyOverscroll;
      html.overscrollBehavior = previous.htmlOverscroll;
      focused?.focus({ preventScroll: true });
    };
  }, []);

  if (typeof document === 'undefined') return null;
  return createPortal(
    <div role="presentation" onMouseDown={event => {
      if (event.currentTarget === event.target) onClose();
    }} style={{
      position: 'fixed', inset: 0, zIndex: 2147483000,
      display: 'grid', placeItems: 'center', padding: 16,
      background: 'rgba(0,0,0,.76)', backdropFilter: 'blur(8px)',
      WebkitBackdropFilter: 'blur(8px)',
    }}>
      <section ref={dialog} role="dialog" aria-modal="true" aria-label={title} style={{
        width: 'min(760px, calc(100vw - 32px))',
        height: 'min(900px, calc(100dvh - 32px))',
        maxHeight: 'calc(100dvh - 32px)',
        display: 'grid', gridTemplateRows: 'auto minmax(0,1fr) auto',
        borderRadius: 22, overflow: 'hidden',
        border: '1px solid rgba(255,255,255,.14)',
        background: 'linear-gradient(180deg,rgba(20,22,31,.99),rgba(8,10,17,.995))',
        boxShadow: '0 28px 90px rgba(0,0,0,.72)', color: '#fff',
      }}>
        <header style={{
          minHeight: 66, display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', gap: 16, padding: '12px 16px',
          borderBottom: '1px solid rgba(255,255,255,.10)',
          background: 'rgba(12,14,22,.98)',
        }}>
          <div style={{minWidth:0}}>
            <strong style={{display:'block',fontSize:17,fontWeight:950,
              textOverflow:'ellipsis',whiteSpace:'nowrap',overflow:'hidden'}}>{title}</strong>
            <span style={{display:'block',marginTop:3,color:'#9ca3af',fontSize:12,fontWeight:800}}>
              {typeof commentCount === 'number' ? `${commentCount} ${commentCount === 1 ? 'comment' : 'comments'}` : 'Comments'}
            </span>
          </div>
          <button ref={closeButton} type="button" onClick={onClose} aria-label="Close comments"
            style={{width:44,height:44,flexShrink:0,borderRadius:999,
              border:'1px solid rgba(255,255,255,.12)',background:'rgba(255,255,255,.07)',
              color:'#fff',fontSize:27,cursor:'pointer'}}>×</button>
        </header>
        <div style={{
          minHeight:0, overflowY:'auto',overflowX:'hidden',overscrollBehavior:'contain',
          WebkitOverflowScrolling:'touch',touchAction:'pan-y',scrollbarGutter:'stable',
        }}>
          {postPreview && <section aria-label="Original post" style={{
            padding:'16px 18px 14px',borderBottom:'1px solid rgba(255,255,255,.10)',
            background:'rgba(255,255,255,.018)',
          }}>
            {postPreview}
            {(typeof likeCount === 'number' || typeof commentCount === 'number' || typeof shareCount === 'number') &&
              <div style={{display:'flex',gap:10,alignItems:'center',fontSize:13,color:'#c3c6d1',marginTop:12}}>
                <span>{typeof likeCount === 'number' ? `${likeCount} ${likeCount === 1 ? 'Like' : 'Likes'}` : ''}</span>
                <span style={{marginLeft:'auto'}}>{typeof commentCount === 'number' ? `${commentCount} ${commentCount === 1 ? 'Comment' : 'Comments'}` : ''}</span>
                {typeof shareCount === 'number' && <span>{shareCount} {shareCount === 1 ? 'Share' : 'Shares'}</span>}
              </div>}
            {postActions}
          </section>}
          <section aria-label="Comments" style={{padding:'14px 18px 28px'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
              <strong style={{fontSize:15}}>Comments</strong>
              <span style={{fontSize:12,color:'#a3a6b0'}}>{typeof commentCount === 'number' ? `${commentCount} total` : ''}</span>
            </div>
            {children}
          </section>
        </div>
        {composer && <footer style={{
          display:'block',padding:'12px 14px',borderTop:'1px solid rgba(255,255,255,.10)',
          background:'rgba(10,12,19,.99)',
        }}>{composer}</footer>}
      </section>
    </div>, document.body
  );
}
