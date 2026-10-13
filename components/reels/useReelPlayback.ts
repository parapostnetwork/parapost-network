"use client";

import { useCallback, useEffect, useState, type RefObject } from "react";
import { attachReelPlayback, type ReelPlaybackIssue } from "@/lib/reels/playback";

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
  const [issue, setIssue] = useState<{ id: string; reason: ReelPlaybackIssue } | null>(null);
  const onIssue = useCallback((id: string, reason: ReelPlaybackIssue | null) => {
    setIssue((current) => {
      if (!reason) return current?.id === id ? null : current;
      return current?.id === id && current.reason === reason ? current : { id, reason };
    });
  }, []);
  useEffect(() => attachReelPlayback({
    videos: videoRefs.current, activeId, pausedId, blocked, muted, onIssue,
  }), [videoRefs, reels, activeId, pausedId, blocked, muted, onIssue]);

  useEffect(() => {
    const videos = videoRefs.current;
    return () => Object.values(videos).forEach((video) => video?.pause());
  }, [videoRefs]);
  return issue?.id === activeId ? issue : null;
}
