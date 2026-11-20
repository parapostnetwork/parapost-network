'use client';

import { useEffect } from 'react';

// Dashboard, Profile, Discover Groups, Public Groups and CreatorVerse use
// different navigation components, but all three tablet bars portal a fixed
// layer directly into document.body. Keep that layer aligned to the *visible*
// iPad viewport when the browser chrome changes during scrolling.
const LAYERS = [
  '.dashboard-tablet-nav-fixed-layer',
  '.profile-tablet-nav-fixed-layer',
  '.community-tablet-nav-fixed-layer',
].join(', ');

const TABLET = '(min-width: 761px) and (max-width: 1180px)';

export default function TabletBottomNavViewportLock() {
  useEffect(() => {
    const query = window.matchMedia(TABLET);
    const applied = new WeakMap<HTMLElement, number>();
    let frame = 0;

    const layers = () => document.querySelectorAll<HTMLElement>(LAYERS);

    const restore = () => {
      layers().forEach((layer) => {
        layer.style.removeProperty('transform');
        layer.style.removeProperty('-webkit-transform');
        applied.delete(layer);
      });
    };

    const align = () => {
      frame = 0;
      if (!query.matches) {
        restore();
        return;
      }

      const viewport = window.visualViewport;
      const visibleBottom = viewport
        ? viewport.offsetTop + viewport.height
        : window.innerHeight;

      layers().forEach((layer) => {
        if (window.getComputedStyle(layer).position !== 'fixed') return;
        const difference = visibleBottom - layer.getBoundingClientRect().bottom;
        if (!Number.isFinite(difference) || Math.abs(difference) < 1) return;

        const next = Math.max(-300, Math.min(300, (applied.get(layer) ?? 0) + difference));
        const transform = `translate3d(0, ${next.toFixed(2)}px, 0)`;
        // Older global styles set transform:none !important. Inline important
        // wins without changing unrelated CSS or the phone/desktop layouts.
        layer.style.setProperty('transform', transform, 'important');
        layer.style.setProperty('-webkit-transform', transform, 'important');
        applied.set(layer, next);
      });
    };

    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(align);
    };

    const onBreakpoint = () => {
      if (!query.matches) restore();
      schedule();
    };

    // Portals appear after hydration or route transitions as body children.
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true });

    window.addEventListener('scroll', schedule, { passive: true });
    document.addEventListener('scroll', schedule, true);
    window.addEventListener('resize', schedule);
    window.addEventListener('orientationchange', schedule);
    window.visualViewport?.addEventListener('scroll', schedule);
    window.visualViewport?.addEventListener('resize', schedule);
    query.addEventListener('change', onBreakpoint);
    schedule();

    return () => {
      observer.disconnect();
      window.removeEventListener('scroll', schedule);
      document.removeEventListener('scroll', schedule, true);
      window.removeEventListener('resize', schedule);
      window.removeEventListener('orientationchange', schedule);
      window.visualViewport?.removeEventListener('scroll', schedule);
      window.visualViewport?.removeEventListener('resize', schedule);
      query.removeEventListener('change', onBreakpoint);
      if (frame) window.cancelAnimationFrame(frame);
      restore();
    };
  }, []);

  return null;
}
