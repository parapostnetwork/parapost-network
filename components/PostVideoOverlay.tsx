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
  label: string;
  className?: string;
  style?: CSSProperties;
};

const OPEN_EVENT = 'parapost-video-overlay-open';

export default function PostVideoOverlay({
  src,
  label,
  className,
  style
}: Props) {
  const [open, setOpen] = useState(false);

  const id = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const playerRef = useRef<HTMLVideoElement>(null);

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
        <video
          src={src}
          muted
          playsInline
          preload="metadata"
          tabIndex={-1}
          aria-hidden="true"
          className={styles.thumbnailVideo}
        />

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
