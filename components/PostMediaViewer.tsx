"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import styles from "./PostMediaViewer.module.css";

export type PostMediaViewerState = {
  urls: string[];
  initialIndex: number;
  alt: string;
};

export type OpenPostMediaViewer = (
  url: string,
  alt: string,
  urls?: string[],
  index?: number
) => void;

type Props = {
  viewer: PostMediaViewerState | null;
  onClose: () => void;
};

export default function PostMediaViewer({ viewer, onClose }: Props) {
  // Unmount between openings so the tapped thumbnail always sets the first slide.
  if (!viewer?.urls.length) return null;
  return <Gallery viewer={viewer} onClose={onClose} />;
}

function Gallery({ viewer, onClose }: { viewer: PostMediaViewerState; onClose: () => void }) {
  const [index, setIndex] = useState(() => Math.max(0, Math.min(viewer.initialIndex, viewer.urls.length - 1)));
  const [viewportBox, setViewportBox] = useState({ top: 0, left: 0, offsetTop: 0, offsetLeft: 0, width: 0, height: 0 });
  const [isTablet, setIsTablet] = useState(() =>
    typeof window !== "undefined" && window.matchMedia("(min-width: 768px) and (max-width: 1180px)").matches
  );
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const move = useCallback((direction: number) => {
    setIndex((current) => Math.max(0, Math.min(current + direction, viewer.urls.length - 1)));
  }, [viewer.urls.length]);

  useEffect(() => {
    const query = window.matchMedia("(min-width: 768px) and (max-width: 1180px)");
    const update = () => {
      const viewport = window.visualViewport;
      setIsTablet(query.matches);
      setViewportBox({
        top: window.scrollY + (viewport?.offsetTop || 0),
        left: window.scrollX + (viewport?.offsetLeft || 0),
        offsetTop: viewport?.offsetTop || 0,
        offsetLeft: viewport?.offsetLeft || 0,
        width: viewport?.width || window.innerWidth,
        height: viewport?.height || window.innerHeight,
      });
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    window.visualViewport?.addEventListener("resize", update);
    window.visualViewport?.addEventListener("scroll", update);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
      window.visualViewport?.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("scroll", update);
    };
  }, []);

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus({ preventScroll: true });
    return () => previousFocus?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    const body = document.body.style;
    const html = document.documentElement.style;
    const previous = {
      bodyOverflow: body.overflow,
      htmlOverflow: html.overflow,
      bodyOverscroll: body.overscrollBehavior,
      htmlOverscroll: html.overscrollBehavior,
    };
    // Preserve the existing iPad viewer fix: changing overflow on iPad moves
    // the page. Keep its document in place and block background touch movement.
    if (!isTablet) {
      body.overflow = "hidden";
      html.overflow = "hidden";
    }
    body.overscrollBehavior = "none";
    html.overscrollBehavior = "none";
    const preventTabletScroll = (event: TouchEvent) => {
      if (isTablet) event.preventDefault();
    };
    if (isTablet) document.addEventListener("touchmove", preventTabletScroll, { passive: false });

    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
      // Leave native video seeking and volume shortcuts available.
      if (!(event.target instanceof HTMLVideoElement)) {
        if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
          event.preventDefault();
          move(event.key === "ArrowLeft" ? -1 : 1);
        }
      }
      if (event.key === "Tab") {
        const controls = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>("button:not(:disabled), video, [tabindex='0']") || []);
        const first = controls[0];
        const last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => {
      body.overflow = previous.bodyOverflow;
      html.overflow = previous.htmlOverflow;
      body.overscrollBehavior = previous.bodyOverscroll;
      html.overscrollBehavior = previous.htmlOverscroll;
      document.removeEventListener("touchmove", preventTabletScroll);
      window.removeEventListener("keydown", handleKey);
    };
  }, [isTablet, move, onClose]);

  if (typeof document === "undefined") return null;
  const url = viewer.urls[index];
  const isVideo = /\.(mp4|webm|mov|m4v|ogg)$/i.test(url.split("?")[0].split("#")[0]);
  const hasGallery = viewer.urls.length > 1;
  const label = `${viewer.alt} ${index + 1} of ${viewer.urls.length}`;

  return createPortal(
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label="Post media viewer"
      className={styles.overlay}
      style={{
        // iPad uses visual viewport offsets, never document scroll offsets.
        position: isTablet ? "fixed" : "absolute",
        top: isTablet ? viewportBox.offsetTop : viewportBox.top,
        left: isTablet ? viewportBox.offsetLeft : viewportBox.left,
        width: viewportBox.width || "100vw",
        height: viewportBox.height || "100dvh",
        touchAction: isTablet ? "none" : "pan-y pinch-zoom",
      }}
    >
      <button ref={closeRef} type="button" onClick={onClose} aria-label="Close media viewer" className={styles.close}>×</button>
      <div
        className={styles.stage}
        onTouchStart={(event) => {
          touchStart.current = null;
          if (event.touches.length !== 1) return;
          // Native video controls must keep their own drag/seek gestures.
          if (event.target instanceof HTMLVideoElement) return;
          const touch = event.touches[0];
          touchStart.current = { x: touch.clientX, y: touch.clientY };
        }}
        onTouchCancel={() => { touchStart.current = null; }}
        onTouchEnd={(event) => {
          const start = touchStart.current;
          touchStart.current = null;
          if (!start || event.touches.length || !event.changedTouches.length) return;
          const touch = event.changedTouches[0];
          const dx = touch.clientX - start.x;
          const dy = touch.clientY - start.y;
          if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.2) move(dx < 0 ? 1 : -1);
        }}
      >
        {isVideo ? (
          <video key={url} src={url} controls playsInline preload="metadata" tabIndex={0} aria-label={label} className={styles.media} />
        ) : (
          <img key={url} src={url} alt={label} draggable={false} className={styles.media} />
        )}
      </div>
      <nav aria-label="Gallery navigation" className={styles.navigation}>
        {hasGallery ? <button type="button" aria-label="Previous attachment" disabled={index === 0} onClick={() => move(-1)} className={styles.arrow}>‹</button> : null}
        <span aria-live="polite" aria-atomic="true" className={styles.counter}>{index + 1} / {viewer.urls.length}</span>
        {hasGallery ? <button type="button" aria-label="Next attachment" disabled={index === viewer.urls.length - 1} onClick={() => move(1)} className={styles.arrow}>›</button> : null}
      </nav>
    </div>,
    document.body
  );
}
