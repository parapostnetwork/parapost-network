"use client";

import type { CSSProperties } from "react";
import {
  HeartIcon,
  CommentIcon,
  ShareIcon
} from "@/components/PostActionIcons";

type Props = {
  liked: boolean;
  commentsOpen: boolean;
  busy?: boolean;
  canShare?: boolean;
  onLike: () => void;
  onComment: () => void;
  onShare: () => void;
};

const barStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-around",
  width: "100%",
  borderTop: "1px solid rgba(255,255,255,0.12)",
  marginTop: 12,
  paddingTop: 8
};

const buttonStyle: CSSProperties = {
  display: "flex",
  flex: 1,
  justifyContent: "center",
  alignItems: "center",
  minHeight: 44,
  border: 0,
  borderRadius: 8,
  background: "transparent",
  color: "inherit",
  cursor: "pointer"
};

export default function SharedGroupPostActions({
  liked,
  commentsOpen,
  busy = false,
  canShare = true,
  onLike,
  onComment,
  onShare
}: Props) {
  return (
    <div
      style={barStyle}
      role="group"
      aria-label="Shared Group post actions"
    >
      <button
        type="button"
        aria-label={liked ? "Unlike" : "Like"}
        aria-pressed={liked}
        disabled={busy}
        onClick={onLike}
        style={buttonStyle}
      >
        <HeartIcon filled={liked} />
      </button>

      <button
        type="button"
        aria-label="Comments"
        aria-expanded={commentsOpen}
        onClick={onComment}
        style={buttonStyle}
      >
        <CommentIcon />
      </button>

      <button
        type="button"
        aria-label="Share"
        disabled={busy || !canShare}
        onClick={onShare}
        style={buttonStyle}
      >
        <ShareIcon />
      </button>
    </div>
  );
}
