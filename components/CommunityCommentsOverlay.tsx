'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/** Community comments use the same fixed, scrollable overlay as Dashboard.
 * The post stays mounted underneath; drafts and engagement counts stay intact.
 */
export default function CommunityCommentsOverlay({
  title, onClose, children,
}: { title: string; onClose: () => void; children: ReactNode }) {
  const dialog = useRef<HTMLElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const focused = document.activeElement instanceof HTMLElement
      ? document.activeElement : null;
    const body = document.body.style;
    const html = document.documentElement.style;
    const original = {
      bodyOverflow: body.overflow, htmlOverflow: html.overflow,
      bodyOverscroll: body.overscrollBehavior,
      htmlOverscroll: html.overscrollBehavior,
    };
    // Match the existing Parapost gallery's iPad scroll preservation.
    const tablet = window.matchMedia('(min-width: 768px) and (max-width: 1180px)').matches;
    if (!tablet) {
      body.overflow = 'hidden';
      html.overflow = 'hidden';
    }
    body.overscrollBehavior = 'none';
    html.overscrollBehavior = 'none';
    closeButton.current?.focus({ preventScroll: true });
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeRef.current();
      }
      if (event.key !== 'Tab') return;
      const controls = Array.from(dialog.current?.querySelectorAll<HTMLElement>(
        'button:not(:disabled), a[href], input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [tabindex="0"]'
      ) ?? []);
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus({ preventScroll: true });
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus({ preventScroll: true });
      }
    }
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      body.overflow = original.bodyOverflow;
      html.overflow = original.htmlOverflow;
      body.overscrollBehavior = original.bodyOverscroll;
      html.overscrollBehavior = original.htmlOverscroll;
      focused?.focus({ preventScroll: true });
    };
  }, []);

  if (typeof document === 'undefined') return null;
  return createPortal(
    <div
      role="presentation"
      onClick={event => {
        if (event.currentTarget === event.target) onClose();
      }}
      style={{
        position: 'fixed', inset: 0, zIndex: 2147483000,
        display: 'grid', placeItems: 'center', padding: 12,
        background: 'rgba(0,0,0,.76)', backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
      }}
    >
      <section
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={{
          width: 'min(760px, calc(100vw - 24px))',
          height: 'min(900px, calc(100dvh - 24px))',
          maxHeight: 'calc(100dvh - 24px)',
          display: 'grid', gridTemplateRows: 'auto minmax(0,1fr)',
          borderRadius: 20, overflow: 'hidden',
          border: '1px solid rgba(255,255,255,.14)',
          background: 'linear-gradient(180deg,rgba(20,22,31,.99),rgba(8,10,17,.995))',
          boxShadow: '0 28px 90px rgba(0,0,0,.72)', color: '#fff',
        }}
      >
        <header style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          minHeight: 64, gap: 16, padding: '12px 16px',
          background: 'rgba(12,14,22,.98)',
          borderBottom: '1px solid rgba(255,255,255,.10)',
        }}>
          <strong style={{ fontSize: 17, fontWeight: 900 }}>{title}</strong>
          <button
            ref={closeButton}
            type="button"
            onClick={onClose}
            aria-label="Close comments"
            style={{
              display: 'grid', placeItems: 'center', flexShrink: 0,
              width: 44, height: 44, borderRadius: 999,
              border: '1px solid rgba(255,255,255,.12)',
              background: 'rgba(255,255,255,.07)',
              color: '#fff', fontSize: 27, cursor: 'pointer',
            }}
          >×</button>
        </header>
        <div style={{
          minHeight: 0, overflowY: 'auto', overflowX: 'hidden',
          overscrollBehavior: 'contain', WebkitOverflowScrolling: 'touch',
          touchAction: 'pan-y', padding: '12px 16px 28px',
        }}>
          {children}
        </div>
      </section>
    </div>,
    document.body
  );
}
