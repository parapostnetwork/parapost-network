"use client";

import { useEffect, type RefObject } from "react";
import { attachReelPlayback } from "@/lib/reels/playback";

export default function useReelPlayback({
  videoRefs, reels, activeId, pausedId, blocked, muted,
}: {
  videoRefs: RefObject<Record<string, HTMLVideoElement | null>>;
  reels: readonly { id: string }[];
  activeId: string;
  pausedId: string | null;
  blocked: boolean;
  muted: boolean;
}) {
  useEffect(() => attachReelPlayback({
    videos: videoRefs.current, activeId, pausedId, blocked, muted,
  }), [videoRefs, reels, activeId, pausedId, blocked, muted]);

  useEffect(() => {
    const videos = videoRefs.current;
    return () => Object.values(videos).forEach((video) => video?.pause());
  }, [videoRefs]);
}
