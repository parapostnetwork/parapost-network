"use client";
// PROFILE THOUGHT BUBBLE v36 - true continuous ticker using enough repeated segments to cover the viewport during loop reset.
// PROFILE THOUGHT BUBBLE v30 - universal body portal, desktop hit-target compatible, real save callback, tools removed.

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

const THOUGHT_TICKER_COPY_COUNT = 12;

const DAILY_PROMPTS = [
  "What’s your day look like?",
  "What’s on your mind today?",
  "What are you looking forward to?",
  "How are you feeling today?",
  "What are you working on?",
  "What’s happening tonight?",
  "What made you smile today?",
  "What are you excited about?",
  "What’s your plan for today?",
  "What are you thinking about?",
  "What’s keeping you busy?",
  "What’s something good today?",
  "What are you grateful for?",
  "What’s your current mood?",
  "What are you up to today?",
  "What’s happening this weekend?",
  "What are you focused on?",
  "What would make today great?",
  "What’s something on your radar?",
  "What do you want to share today?",
];

type ProfileThoughtBubbleProps = {
  text?: string;
  avatarUrl?: string | null;
  isOwnProfile?: boolean;
  onShare?: (text: string, audience: "friends" | "everyone") => void | Promise<void>;
};

export default function ProfileThoughtBubble({
  text,
  avatarUrl,
  isOwnProfile = true,
  onShare,
}: ProfileThoughtBubbleProps) {
  const [composerOpen, setComposerOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [audience, setAudience] = useState<"friends" | "everyone">("friends");
  const [sharing, setSharing] = useState(false);
  const [shareError, setShareError] = useState("");
  const [mounted, setMounted] = useState(false);

  const dailyPrompt = useMemo(() => {
    const now = new Date();
    const dayNumber = Math.floor(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) / 86400000
    );
    return DAILY_PROMPTS[dayNumber % DAILY_PROMPTS.length];
  }, []);

  const displayText = (text?.trim() || dailyPrompt).slice(0, 60);

  // v30: always portal the composer through document.body. The visible thought
  // bubble may live inside deeply nested/stacked profile layout containers, but
  // the composer itself must always escape those stacking and clipping contexts.
  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!composerOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setComposerOpen(false);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [composerOpen]);

  const submitThought = async () => {
    const clean = draft.trim().slice(0, 60);
    if (!clean || sharing) return;

    setShareError("");

    try {
      setSharing(true);

      if (!onShare) {
        throw new Error("Thought saving is not connected on this profile yet.");
      }

      await onShare(clean, audience);
      setDraft("");
      setComposerOpen(false);
    } catch (error) {
      const message =
        error instanceof Error && error.message
          ? error.message
          : "Your thought could not be saved. Please try again.";
      console.error("Profile thought save failed:", error);
      setShareError(message);
    } finally {
      setSharing(false);
    }
  };

  const openComposer = () => {
    if (!isOwnProfile) return;
    setDraft((text?.trim() || "").slice(0, 60));
    setShareError("");
    setComposerOpen(true);
  };

  const composerNode = composerOpen ? (
    <div
      className="thought-composer-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) setComposerOpen(false);
      }}
    >
      <section
        className="thought-composer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="thought-composer-title"
      >
        <header className="thought-composer-header">
          <button
            type="button"
            className="thought-close"
            aria-label="Close"
            onClick={() => setComposerOpen(false)}
          >
            ×
          </button>

          <h2 id="thought-composer-title">New Thought</h2>

          <button
            type="button"
            className="thought-top-share"
            disabled={!draft.trim() || sharing}
            onClick={submitThought}
          >
            {sharing ? "Sharing…" : "Share"}
          </button>
        </header>

        <div className="thought-composer-body">
          <div className="thought-identity">
            <div className="thought-input-wrap">
              <textarea
                autoFocus
                maxLength={60}
                value={draft}
                onChange={(event) => setDraft(event.target.value.slice(0, 60))}
                placeholder="What’s on your mind?"
                aria-label="Your thought"
              />
              <span className="composer-tail" aria-hidden="true" />
            </div>

            <div className="thought-avatar" aria-hidden="true">
              {avatarUrl ? <img src={avatarUrl} alt="" /> : <span>YOU</span>}
            </div>

            <div className="thought-count">{draft.length}/60</div>
            {shareError ? (
              <div className="thought-share-error" role="alert">
                {shareError}
              </div>
            ) : null}
          </div>
        </div>

        <footer className="thought-composer-footer">
          <button
            type="button"
            className="thought-audience"
            onClick={() =>
              setAudience((current) => (current === "friends" ? "everyone" : "friends"))
            }
          >
            <span aria-hidden="true">{audience === "friends" ? "♟" : "◎"}</span>
            {audience === "friends" ? "Share with friends" : "Share with everyone"}
            <span aria-hidden="true">›</span>
          </button>

          <button
            type="button"
            className="thought-main-share"
            disabled={!draft.trim() || sharing}
            onClick={submitThought}
          >
            {sharing ? "Sharing…" : "Share"}
          </button>
        </footer>
      </section>
    </div>
  ) : null;

  return (
    <>
      <button
        type="button"
        className="profile-thought-bubble"
        aria-label={isOwnProfile ? "Create or edit thought" : `Thought: ${displayText}`}
        aria-expanded={isOwnProfile ? composerOpen : undefined}
        onPointerUp={(event) => {
          event.stopPropagation();
          openComposer();
        }}
        onClick={(event) => {
          event.stopPropagation();
          openComposer();
        }}
      >
        <span className="profile-thought-window">
          <span className="profile-thought-track" aria-hidden="true">
            {Array.from({ length: THOUGHT_TICKER_COPY_COUNT }).map((_, index) => (
              <span className="profile-thought-text" key={`thought-ticker-${index}`}>
                {displayText}
              </span>
            ))}
          </span>
        </span>
        <span className="profile-thought-tail" aria-hidden="true" />
      </button>

      {mounted && composerOpen ? createPortal(composerNode, document.body) : null}

      <style jsx global>{`
        .profile-thought-bubble {
          position: absolute;

          /* LOCKED v26 DESKTOP POSITION — DO NOT CHANGE */
          top: -14px;
          right: -102px;

          width: 160px;
          height: 34px;
          display: flex;
          align-items: center;
          padding: 0 11px;
          box-sizing: border-box;
          border: 0;
          border-radius: 12px;
          background: #444446;
          box-shadow:
            0 5px 14px rgba(0, 0, 0, 0.34),
            inset 0 1px 0 rgba(255, 255, 255, 0.035);
          overflow: visible;
          z-index: 9999 !important;
          cursor: pointer;
          pointer-events: auto !important;
          touch-action: manipulation;
          flex: none !important;
          min-width: 0 !important;
          min-height: 0 !important;
          max-width: none !important;
          max-height: none !important;
          isolation: isolate;
          transform: translateZ(0);
          font: inherit;
          text-align: left;
        }

        .profile-thought-window {
          position: relative;
          display: block;
          width: 100%;
          height: 100%;
          overflow: hidden;
          white-space: nowrap;
          border-radius: inherit;
          z-index: 2;
        }

        .profile-thought-track {
          position: absolute;
          top: 0;
          left: 0;
          display: inline-flex;
          align-items: center;
          width: max-content;
          height: 100%;
          white-space: nowrap;
          animation: profileThoughtTickerLoop 12s linear infinite;
          will-change: transform;
          backface-visibility: hidden;
          transform: translate3d(0, 0, 0);
        }

        .profile-thought-text {
          position: relative;
          display: inline-flex;
          align-items: center;
          flex: 0 0 auto;
          height: 100%;
          min-width: max-content;
          padding-right: 28px;
          color: rgba(255, 255, 255, 0.52);
          font-size: 12.5px;
          font-weight: 600;
          line-height: 1;
          white-space: nowrap;
          animation: none !important;
          transform: none !important;
        }

        .profile-thought-tail {
          position: absolute;
          left: 12px;
          bottom: -6px;
          width: 0;
          height: 0;
          border-top: 8px solid #444446;
          border-right: 8px solid transparent;
          transform: rotate(7deg);
          filter: drop-shadow(0 2px 1px rgba(0, 0, 0, 0.16));
          z-index: 1;
          pointer-events: none;
        }

        @keyframes profileThoughtTickerLoop {
          /*
           * v36 TRUE CONTINUOUS TICKER
           *
           * v35 used only two copies. That is NOT enough when one thought
           * segment is narrower than the visible bubble: near the end of the
           * cycle the viewport can see past copy #2 into empty track space,
           * then the animation reset visibly brings text back.
           *
           * v36 repeats the exact same segment 12 times. The track moves by
           * exactly ONE of those 12 equal segments (1/12 = 8.3333333333%).
           * At the reset, every visible pixel has the same repeated content in
           * the same relative position, including short thoughts, so there is
           * no blank tail and no visible jump/reappearance.
           */
          from { transform: translate3d(0, 0, 0); }
          to { transform: translate3d(-8.3333333333%, 0, 0); }
        }

        /* New Thought overlay */
        .thought-composer-backdrop {
          position: fixed;
          inset: 0;
          z-index: 2147483000;
          background: rgba(3, 5, 10, 0.78);
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
          display: grid;
          place-items: center;
          padding: 24px;
          pointer-events: auto;
          isolation: isolate;
        }

        .thought-composer {
          width: min(620px, 100%);
          min-height: 640px;
          max-height: min(820px, calc(100dvh - 48px));
          overflow: auto;
          display: flex;
          flex-direction: column;
          color: #fff;
          background:
            radial-gradient(circle at 50% 25%, rgba(125, 55, 255, 0.12), transparent 34%),
            #090c12;
          border: 1px solid rgba(255, 255, 255, 0.09);
          border-radius: 26px;
          box-shadow: 0 30px 90px rgba(0, 0, 0, 0.6);
        }

        .thought-composer-header {
          height: 82px;
          display: grid;
          grid-template-columns: 90px 1fr 90px;
          align-items: center;
          padding: 0 22px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.08);
        }

        .thought-composer-header h2 {
          margin: 0;
          text-align: center;
          font-size: 25px;
          line-height: 1;
          font-weight: 750;
        }

        .thought-close,
        .thought-top-share,
        .thought-audience,
        .thought-main-share {
          font: inherit;
          border: 0;
          cursor: pointer;
        }

        .thought-close {
          justify-self: start;
          width: 46px;
          height: 46px;
          padding: 0;
          color: #fff;
          background: transparent;
          font-size: 48px;
          font-weight: 200;
          line-height: 40px;
        }

        .thought-top-share {
          justify-self: end;
          color: #a873ff;
          background: transparent;
          font-size: 16px;
          font-weight: 700;
        }

        .thought-top-share:disabled,
        .thought-main-share:disabled {
          opacity: 0.35;
          cursor: default;
        }

        .thought-composer-body {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 90px 30px 36px;
        }

        .thought-identity {
          display: flex;
          flex-direction: column;
          align-items: center;
        }

        .thought-input-wrap {
          position: relative;
          width: min(330px, 74vw);
          min-height: 92px;
          margin-bottom: 10px;
          border-radius: 28px;
          background: #414247;
          box-shadow: 0 12px 30px rgba(0, 0, 0, 0.28);
        }

        .thought-input-wrap textarea {
          width: 100%;
          height: 92px;
          resize: none;
          box-sizing: border-box;
          padding: 28px 26px 18px;
          border: 0;
          outline: 0;
          border-radius: inherit;
          background: transparent;
          color: #fff;
          font: inherit;
          font-size: 22px;
          line-height: 1.25;
          text-align: center;
          overflow: hidden;
        }

        .thought-input-wrap textarea::placeholder {
          color: rgba(255, 255, 255, 0.52);
        }

        .composer-tail {
          position: absolute;
          left: 46%;
          bottom: -14px;
          width: 0;
          height: 0;
          border-top: 20px solid #414247;
          border-right: 18px solid transparent;
          transform: rotate(8deg);
        }

        .thought-avatar {
          position: relative;
          z-index: 2;
          width: 142px;
          height: 142px;
          overflow: hidden;
          display: grid;
          place-items: center;
          border-radius: 50%;
          background: #252a34;
          border: 3px solid rgba(167, 94, 255, 0.72);
          box-shadow: 0 0 28px rgba(121, 66, 255, 0.22);
        }

        .thought-avatar img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .thought-avatar span {
          color: rgba(255,255,255,.55);
          font-size: 17px;
          font-weight: 800;
        }

        .thought-count {
          margin-top: 20px;
          color: rgba(255, 255, 255, 0.82);
          font-size: 18px;
        }

        .thought-share-error {
          width: min(360px, 78vw);
          margin-top: 16px;
          color: #fca5a5;
          font-size: 13px;
          font-weight: 650;
          line-height: 1.35;
          text-align: center;
        }

        .thought-composer-footer {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 18px;
          padding: 22px 28px calc(22px + env(safe-area-inset-bottom));
          border-top: 1px solid rgba(255, 255, 255, 0.08);
        }

        .thought-audience {
          display: flex;
          align-items: center;
          gap: 9px;
          min-width: 0;
          color: rgba(255, 255, 255, 0.9);
          background: transparent;
          font-size: 15px;
          font-weight: 650;
        }

        .thought-main-share {
          flex: none;
          min-width: 108px;
          height: 48px;
          padding: 0 22px;
          border-radius: 24px;
          color: #fff;
          background: linear-gradient(135deg, #743cff, #9d4dff);
          box-shadow: 0 8px 24px rgba(117, 61, 255, 0.28);
          font-size: 16px;
          font-weight: 800;
        }

        /* LOCKED v26 TABLET POSITION — DO NOT CHANGE */
        @media (min-width: 700px) and (max-width: 1100px) {
          .profile-thought-bubble {
            top: -15px;
            right: -88px;
            width: 148px;
            height: 32px;
            padding: 0 10px;
            border-radius: 11px;
            z-index: 9999 !important;
          }

          .profile-thought-track {
            animation-duration: 12s;
          }

          .profile-thought-text {
            font-size: 12px;
            color: rgba(255, 255, 255, 0.52);
          }

          .profile-thought-tail {
            left: 11px;
            bottom: -6px;
            border-top-width: 8px;
            border-right-width: 8px;
          }
        }

        /* LOCKED v26 MOBILE POSITION — DO NOT CHANGE */
        @media (max-width: 699px) {
          .profile-thought-bubble {
            top: -18px;
            right: -84px;
            width: 132px;
            height: 30px;
            padding: 0 9px;
            border-radius: 11px;
            z-index: 9999 !important;
          }

          .profile-thought-track {
            animation-duration: 12s;
          }

          .profile-thought-text {
            font-size: 11.25px;
            color: rgba(255, 255, 255, 0.52);
          }

          .profile-thought-tail {
            left: 10px;
            bottom: -5px;
            border-top-width: 7px;
            border-right-width: 7px;
          }

          .thought-composer-backdrop {
            padding: 0;
            place-items: stretch;
            background: #080b10;
            backdrop-filter: none;
            -webkit-backdrop-filter: none;
          }

          .thought-composer {
            width: 100%;
            height: 100dvh;
            min-height: 100dvh;
            max-height: 100dvh;
            border: 0;
            border-radius: 0;
            box-shadow: none;
          }

          .thought-composer-header {
            height: 76px;
            grid-template-columns: 74px 1fr 74px;
            padding: env(safe-area-inset-top) 18px 0;
          }

          .thought-composer-header h2 {
            font-size: 21px;
          }

          .thought-top-share {
            font-size: 15px;
          }

          .thought-composer-body {
            padding: 110px 22px 28px;
          }

          .thought-input-wrap {
            width: min(315px, 78vw);
            min-height: 84px;
          }

          .thought-input-wrap textarea {
            height: 84px;
            padding: 25px 20px 16px;
            font-size: 20px;
          }

          .thought-avatar {
            width: 132px;
            height: 132px;
          }

          .thought-composer-footer {
            padding-left: 22px;
            padding-right: 22px;
          }
        }

        /* LOCKED v26 SMALL MOBILE POSITION — DO NOT CHANGE */
        @media (max-width: 390px) {
          .profile-thought-bubble {
            top: -17px;
            right: -74px;
            width: 122px;
            height: 29px;
            padding: 0 8px;
          }

          .profile-thought-text {
            font-size: 10.75px;
          }

          .thought-composer-body {
            padding-top: 78px;
          }

          .thought-main-share {
            min-width: 92px;
            padding: 0 18px;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .profile-thought-track {
            animation-duration: 20s;
          }
        }
      `}</style>
    </>
  );
}
