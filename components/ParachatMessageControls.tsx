"use client";

import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type Ref,
} from "react";
import { createPortal } from "react-dom";
import styles from "./ParachatMessageControls.module.css";

export const PARACHAT_REACTIONS = {
  like: "👍",
  love: "❤️",
  laugh: "😂",
  wow: "😮",
  sad: "😢",
  angry: "😠",
} as const;

export type ParachatReaction =
  keyof typeof PARACHAT_REACTIONS;

const reactions = Object.keys(
  PARACHAT_REACTIONS
) as ParachatReaction[];

type Props = {
  children: ReactNode;
  own: boolean;
  counts?: Partial<Record<ParachatReaction, number>>;
  mine?: ParachatReaction | null;
  onReact?: (reaction: ParachatReaction | null) =>
    Promise<void>;
  onReply?: () => void;
  onMore: (button: HTMLButtonElement) => void;
  moreButtonRef?: Ref<HTMLButtonElement>;
  menuOpen?: boolean;
  disabled?: boolean;
};

export default function ParachatMessageControls({
  children,
  own,
  counts = {},
  mine,
  onReact,
  onReply,
  onMore,
  moreButtonRef,
  menuOpen = false,
  disabled = false,
}: Props) {
  const root = useRef<HTMLDivElement>(null);
  const bubble = useRef<HTMLDivElement>(null);
  const picker = useRef<HTMLDivElement>(null);
  const timer = useRef<number | null>(null);
  const start = useRef({ x: 0, y: 0 });
  const suppressClick = useRef(false);
  const busyRef = useRef(false);

  const [touchActive, setTouchActive] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [position, setPosition] = useState({
    top: 0,
    left: 0,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const active = reactions.filter(
    (reaction) => (counts[reaction] || 0) > 0
  );

  function cancelPress() {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
  }

  function openPicker() {
    if (!onReact || disabled || busyRef.current) return;

    const rect = bubble.current?.getBoundingClientRect();
    if (!rect) return;

    const width = Math.min(280, window.innerWidth - 16);

    setPosition({
      top: rect.top >= 64
        ? rect.top - 54
        : Math.min(rect.bottom + 8, window.innerHeight - 54),
      left: Math.max(
        8,
        Math.min(
          rect.right - width,
          window.innerWidth - width - 8
        )
      ),
    });

    setError("");
    setPickerOpen(true);
  }

  async function react(reaction: ParachatReaction) {
    if (!onReact || busyRef.current || disabled) return;

    busyRef.current = true;
    setBusy(true);
    setError("");

    try {
      await onReact(mine === reaction ? null : reaction);
      setPickerOpen(false);
      setTouchActive(false);
    } catch {
      setError("Unable to update reaction.");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  useEffect(() => {
    return () => {
      if (timer.current !== null) {
        window.clearTimeout(timer.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!pickerOpen && !touchActive) return;

    function close() {
      setPickerOpen(false);
      setTouchActive(false);
    }

    function outside(event: PointerEvent) {
      const target = event.target as Node;

      if (
        !root.current?.contains(target) &&
        !picker.current?.contains(target)
      ) {
        close();
      }
    }

    function keyboard(event: KeyboardEvent) {
      if (event.key === "Escape") close();
    }

    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", keyboard);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);

    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", keyboard);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [pickerOpen, touchActive]);

  return (
    <div
      ref={root}
      className={[
        styles.root,
        own ? styles.own : styles.received,
        touchActive || pickerOpen || menuOpen
          ? styles.active : "",
        active.length ? styles.hasReactions : "",
      ].join(" ")}
    >
      <div
        ref={bubble}
        className={styles.bubble}
        onPointerDown={(event) => {
          if (event.pointerType === "mouse" || disabled) return;

          if (
            (event.target as HTMLElement).closest(
              "button,input,textarea,a,video"
            )
          ) return;

          suppressClick.current = false;

          start.current = {
            x: event.clientX,
            y: event.clientY,
          };

          cancelPress();

          timer.current = window.setTimeout(() => {
            suppressClick.current = true;
            setTouchActive(true);
            timer.current = null;
          }, 450);
        }}
        onPointerMove={(event) => {
          if (
            Math.abs(event.clientX - start.current.x) > 10 ||
            Math.abs(event.clientY - start.current.y) > 10
          ) cancelPress();
        }}
        onPointerUp={cancelPress}
        onPointerCancel={cancelPress}
        onPointerLeave={cancelPress}
        onClickCapture={(event) => {
          if (suppressClick.current) {
            event.preventDefault();
            event.stopPropagation();
            suppressClick.current = false;
          }
        }}
      >
        {children}
      </div>

      <div className={styles.actions}>
        {onReact ? (
          <button
            type="button"
            aria-label="React to message"
            title="React"
            disabled={disabled || busy}
            aria-expanded={pickerOpen}
            onClick={() =>
              pickerOpen
                ? setPickerOpen(false)
                : openPicker()
            }
          >
            <svg width="19" height="19"
              viewBox="0 0 24 24"
              fill="none" stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              aria-hidden="true">
              <circle cx="12" cy="12" r="9" />
              <path d="M8 14c2 3 6 3 8 0" />
              <path d="M9 9h.01M15 9h.01" />
            </svg>
          </button>
        ) : null}

        {onReply ? (
          <button
            type="button"
            title="Reply"
            aria-label="Reply to message"
            disabled={disabled}
            onClick={() => {
              setPickerOpen(false);
              setTouchActive(false);
              onReply();
            }}
          >
            <svg width="19" height="19"
              viewBox="0 0 24 24"
              fill="none" stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true">
              <path d="M9 6l-6 6 6 6" />
              <path d="M3 12h11a7 7 0 017 7" />
            </svg>
          </button>
        ) : null}

        <button
          ref={moreButtonRef}
          type="button"
          title="More"
          aria-label="Message options"
          aria-expanded={menuOpen}
          disabled={disabled}
          onClick={(event) => {
            setPickerOpen(false);
            onMore(event.currentTarget);
          }}
        >
          ⋯
        </button>
      </div>

      {active.length ? (
        <button
          type="button"
          className={styles.reactionBadge}
          aria-label="Message reactions"
          disabled={!onReact || disabled || busy}
          onClick={openPicker}
        >
          {active.map((reaction) => (
            <span key={reaction}>
              {PARACHAT_REACTIONS[reaction]}
            </span>
          ))}
          <span className={styles.count}>
            {active.reduce(
              (sum, reaction) =>
                sum + (counts[reaction] || 0),
              0
            )}
          </span>
        </button>
      ) : null}

      {pickerOpen && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={picker}
              className={styles.picker}
              style={position}
              role="group"
              aria-label="Choose a reaction"
            >
              {reactions.map((reaction) => (
                <button
                  key={reaction}
                  type="button"
                  title={reaction}
                  aria-label={reaction}
                  aria-pressed={mine === reaction}
                  disabled={busy}
                  onClick={() => void react(reaction)}
                >
                  {PARACHAT_REACTIONS[reaction]}
                </button>
              ))}
              {error ? (
                <span className={styles.error} role="alert">
                  {error}
                </span>
              ) : null}
            </div>,
            document.body
          )
        : null}
    </div>
  );
}
