"use client";

type ProfileThoughtBubbleProps = {
  text?: string;
};

export default function ProfileThoughtBubble({
  text = "What’s your day look like?",
}: ProfileThoughtBubbleProps) {
  return (
    <div className="profile-thought-bubble">
      <span className="profile-thought-text">{text}</span>
      <span className="profile-thought-tail" />

      <style jsx>{`
        .profile-thought-bubble {
          position: absolute;
          top: -24px;
          left: 58px;

          width: 112px;
          height: 29px;

          display: flex;
          align-items: center;

          padding: 0 10px;

          border-radius: 13px;
          background: #3a3b3c;

          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.28);

          overflow: visible;
          z-index: 40;
        }

        .profile-thought-text {
          width: 100%;

          overflow: hidden;
          white-space: nowrap;
          text-overflow: ellipsis;

          color: rgba(255, 255, 255, 0.68);
          font-size: 11px;
          font-weight: 500;
          line-height: 1;
        }

        .profile-thought-tail {
          position: absolute;

          left: 9px;
          bottom: -7px;

          width: 0;
          height: 0;

          border-top: 9px solid #3a3b3c;
          border-right: 10px solid transparent;

          transform: rotate(8deg);
        }
      `}</style>
    </div>
  );
}