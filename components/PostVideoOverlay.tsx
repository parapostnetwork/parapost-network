'use client';

import {
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties
} from 'react';

import { createPortal } from 'react-dom';
import styles from './PostVideoOverlay.module.css';

type Props = {
  src: string;
  thumbnailSrc?: string;
  posterSrc?: string;
  generatePoster?: boolean;
  label: string;
  className?: string;
  style?: CSSProperties;
};

const OPEN_EVENT = 'parapost-video-overlay-open';

export default function PostVideoOverlay({
  src,
  thumbnailSrc,
  posterSrc,
  generatePoster = false,
  label,
  className,
  style
}: Props) {
  const [open, setOpen] = useState(false);
  const [failedPoster, setFailedPoster] = useState<string | null>(null);

  const [generatedPoster, setGeneratedPoster] = useState<{
    source: string;
    image: string;
  } | null>(null);

  const displayPoster = posterSrc ||
    (generatedPoster?.source === src ? generatedPoster.image : undefined);

  const id = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const playerRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (!generatePoster || posterSrc || !src) return;

    let active = true;
    let started = false;
    let observer: IntersectionObserver | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let deadline: ReturnType<typeof setTimeout> | undefined;
    let positions: number[] = [];
    let index = 0;

    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';

    function stop() {
      active = false;
      observer?.disconnect();
      clearTimeout(timer);
      clearTimeout(deadline);
      video.onloadedmetadata = null;
      video.onloadeddata = null;
      video.onseeked = null;
      video.onerror = null;
      video.pause();
      video.removeAttribute('src');
      video.load();
    }

    function scheduleCapture(delay = 150) {
      clearTimeout(timer);
      if (active) timer = setTimeout(capture, delay);
    }

    function seekNext() {
      if (!active) return;
      if (index >= positions.length) {
        stop();
        return;
      }

      try {
        video.currentTime = positions[index++];
        scheduleCapture(500);
      } catch {
        scheduleCapture();
      }
    }

    function capture() {
      if (!active) return;

      if (video.seeking || video.readyState < 2 ||
          !video.videoWidth || !video.videoHeight) {
        scheduleCapture(250);
        return;
      }

      try {
        const canvas = document.createElement('canvas');
        const scale = Math.min(
          1, 960 / Math.max(video.videoWidth, video.videoHeight)
        );

        canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
        canvas.height = Math.max(1, Math.round(video.videoHeight * scale));

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          stop();
          return;
        }

        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        const pixels = ctx.getImageData(
          0, 0, canvas.width, canvas.height
        ).data;

        let visible = false;

        for (let i = 0; i < pixels.length; i += 4) {
          if (pixels[i + 3] > 0 &&
              Math.max(pixels[i], pixels[i + 1], pixels[i + 2]) > 24) {
            visible = true;
            break;
          }
        }

        if (!visible) {
          seekNext();
          return;
        }

        const image = canvas.toDataURL('image/jpeg', 0.85);
        setGeneratedPoster({ source: src, image });
        stop();

      } catch {
        // Preserve normal playback if thumbnail generation is unavailable.
        stop();
      }
    }

    function start() {
      if (!active || started) return;
      started = true;

      video.onloadedmetadata = () => {
        const duration = Number.isFinite(video.duration)
          ? video.duration : 4;

        positions = [0.2, 0.8, 1.5, 3].map(
          time => Math.min(time, duration / 2)
        );

        seekNext();
      };

      video.onloadeddata = () => scheduleCapture();
      video.onseeked = () => scheduleCapture();
      video.onerror = stop;

      deadline = setTimeout(stop, 10000);
      video.src = src.split('#')[0];
      video.load();
    }

    if (typeof IntersectionObserver !== 'undefined' && triggerRef.current) {
      observer = new IntersectionObserver(entries => {
        if (entries.some(entry => entry.isIntersecting)) {
          observer?.disconnect();
          start();
        }
      }, { rootMargin: '100px' });

      observer.observe(triggerRef.current);
    } else {
      start();
    }

    return stop;
  }, [src, generatePoster, posterSrc]);

  useEffect(() => {
    if (!open) return;

    const previousOverflow =
      document.body.style.overflow;

    document.body.style.overflow = 'hidden';

    closeRef.current?.focus({
      preventScroll: true
    });

    const currentPlayer = playerRef.current;

    if (currentPlayer) {
      void currentPlayer.play().catch(() => {
        // Native controls remain available if autoplay is blocked.
      });
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        setOpen(false);
        return;
      }

      if (event.key !== 'Tab') return;

      const controls =
        dialogRef.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), video[controls]'
        );

      if (!controls || controls.length === 0) {
        return;
      }

      const first = controls[0];
      const last = controls[controls.length - 1];

      if (
        event.shiftKey &&
        document.activeElement === first
      ) {
        event.preventDefault();
        last.focus();
      } else if (
        !event.shiftKey &&
        document.activeElement === last
      ) {
        event.preventDefault();
        first.focus();
      }
    }

    function handleAnotherVideo(event: Event) {
      const opened = event as CustomEvent<string>;

      if (opened.detail !== id) {
        setOpen(false);
      }
    }

    window.addEventListener(
      'keydown',
      handleKeyDown
    );

    window.addEventListener(
      OPEN_EVENT,
      handleAnotherVideo
    );

    return () => {
      currentPlayer?.pause();

      document.body.style.overflow =
        previousOverflow;

      window.removeEventListener(
        'keydown',
        handleKeyDown
      );

      window.removeEventListener(
        OPEN_EVENT,
        handleAnotherVideo
      );

      triggerRef.current?.focus({
        preventScroll: true
      });
    };
  }, [open, id]);

  function openVideo() {
    window.dispatchEvent(
      new CustomEvent<string>(OPEN_EVENT, {
        detail: id
      })
    );

    setOpen(true);
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={[
          styles.thumbnail,
          className ?? ''
        ].join(' ')}
        style={style}
        onClick={openVideo}
        aria-label={`Play video: ${label}`}
      >
        {displayPoster && failedPoster !== displayPoster ? (
          <img
            src={displayPoster}
            onError={() => setFailedPoster(displayPoster)}
            alt=""
            aria-hidden="true"
            className={styles.thumbnailVideo}
          />
        ) : (
          <video
            src={thumbnailSrc ?? src}
            muted
            playsInline
            preload={thumbnailSrc ? "auto" : "metadata"}
            tabIndex={-1}
            aria-hidden="true"
            className={styles.thumbnailVideo}
          />
        )}

        <span
          className={styles.playBadge}
          aria-hidden="true"
        >
          <svg
            width="26"
            height="26"
            viewBox="0 0 24 24"
            fill="currentColor"
          >
            <path d="M8 5v14l11-7z" />
          </svg>
        </span>
      </button>

      {open && createPortal(
        <div
          ref={dialogRef}
          className={styles.backdrop}
          role="dialog"
          aria-modal="true"
          aria-label={`Video player: ${label}`}
          tabIndex={-1}
          onClick={event => {
            if (
              event.target === event.currentTarget
            ) {
              setOpen(false);
            }
          }}
        >
          <button
            ref={closeRef}
            type="button"
            className={styles.close}
            aria-label="Close video player"
            onClick={() => setOpen(false)}
          >
            ×
          </button>

          <video
            ref={playerRef}
            src={src}
            controls
            autoPlay
            playsInline
            preload="metadata"
            className={styles.player}
            aria-label={label}
          />
        </div>,
        document.body
      )}
    </>
  );
}
