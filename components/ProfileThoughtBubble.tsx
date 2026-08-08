"use client";

import { useMemo } from "react";

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
};

export default function ProfileThoughtBubble({
  text,
}: ProfileThoughtBubbleProps) {
  const dailyPrompt = useMemo(() => {
    const now = new Date();

    const utcDayNumber = Math.floor(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate()
      ) / 86400000
    );

    return DAILY_PROMPTS[utcDayNumber % DAILY_PROMPTS.length];
  }, []);

  const displayText = (text?.trim() || dailyPrompt).slice(0, 60);

  return (
    <div
      className="profile-thought-bubble"
      role="button"
      tabIndex={0}
      aria-label={displayText}
    >
      <span className="profile-thought-window">
        <span className="profile-thought-text">
          {displayText}
        </span>
      </span>

      <span className="profile-thought-tail" aria-hidden="true" />

      <style jsx>{`
        .profile-thought-bubble {
          position: absolute;

          /*
           * IMPORTANT:
           * Position from the RIGHT edge of the avatar instead of
           * using a fixed LEFT value. This keeps placement stable
           * when the avatar size changes between mobile/tablet/desktop.
           */
          top: -18px;
          right: -110px;

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
            inset 0 1px 0 rgba(255, 255, 255, 0.045);

          overflow: visible;

          z-index: 50;

          cursor: pointer;

          /*
           * Prevent this element from participating in any avatar
           * flex/grid sizing inherited from the profile page.
           */
          flex: none !important;
          min-width: 0 !important;
          min-height: 0 !important;
          max-width: none !important;
          max-height: none !important;
        }

        .profile-thought-window {
          position: relative;

          display: block;

          width: 100%;
          height: 100%;

          overflow: hidden;
          white-space: nowrap;

          border-radius: inherit;
        }

        .profile-thought-text {
          position: absolute;
          top: 0;
          left: 0;

          display: inline-flex;
          align-items: center;

          height: 100%;
          min-width: max-content;

          color: rgba(255, 255, 255, 0.72);

          font-size: 12.5px;
          font-weight: 600;
          line-height: 1;

          white-space: nowrap;

          animation: profileThoughtScrollLeft 12s linear infinite;
          will-change: transform;
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

          filter: drop-shadow(0 2px 1px rgba(0, 0, 0, 0.18));

          pointer-events: none;
        }

        @keyframes profileThoughtScrollLeft {
          0% {
            transform: translateX(100%);
          }

          12% {
            transform: translateX(100%);
          }

          88% {
            transform: translateX(-100%);
          }

          100% {
            transform: translateX(-100%);
          }
        }

        /*
         * TABLET
         * Slightly smaller than desktop, while still remaining
         * clearly readable and attached to the avatar.
         */
        @media (min-width: 700px) and (max-width: 1100px) {
          .profile-thought-bubble {
            top: -17px;
            right: -96px;

            width: 148px;
            height: 32px;

            padding: 0 10px;

            border-radius: 11px;
          }

          .profile-thought-text {
            font-size: 12px;
          }

          .profile-thought-tail {
            left: 11px;
            bottom: -6px;

            border-top-width: 8px;
            border-right-width: 8px;
          }
        }

        /*
         * MOBILE
         * Designed around the much larger mobile profile avatar.
         * The bubble stays at the avatar's top-right and does not
         * push, resize, crop, or distort the avatar itself.
         */
        @media (max-width: 699px) {
          .profile-thought-bubble {
            top: -15px;
            right: -78px;

            width: 132px;
            height: 30px;

            padding: 0 9px;

            border-radius: 11px;
          }

          .profile-thought-text {
            font-size: 11.25px;
          }

          .profile-thought-tail {
            left: 10px;
            bottom: -5px;

            border-top-width: 7px;
            border-right-width: 7px;
          }
        }

        /*
         * SMALL MOBILE
         * Keeps the bubble from reaching too far toward the screen edge.
         */
        @media (max-width: 390px) {
          .profile-thought-bubble {
            top: -14px;
            right: -68px;

            width: 122px;
            height: 29px;

            padding: 0 8px;
          }

          .profile-thought-text {
            font-size: 10.75px;
          }
        }

        /*
         * Motion accessibility.
         */
        @media (prefers-reduced-motion: reduce) {
          .profile-thought-text {
            position: static;

            width: 100%;

            overflow: hidden;
            text-overflow: ellipsis;

            animation: none;
          }
        }
      `}</style>
    </div>
  );
}
