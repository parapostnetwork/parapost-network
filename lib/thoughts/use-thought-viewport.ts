"use client";

import { useEffect, useState, type CSSProperties } from "react";

// Thought overlays only: mobile keyboards may shrink the visual viewport without
// changing dvh. Keep the overlay inside that visible area, including browser pan.
export function useThoughtViewport(open: boolean): CSSProperties {
  const [viewport, setViewport] = useState<{ height: number; top: number } | null>(null);
  useEffect(() => {
    if (!open) return;
    const visual = window.visualViewport;
    const update = () => setViewport({
      height: visual?.height ?? window.innerHeight,
      top: visual?.offsetTop ?? 0,
    });
    update();
    visual?.addEventListener("resize", update);
    visual?.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    return () => {
      visual?.removeEventListener("resize", update);
      visual?.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [open]);

  return {
    "--thought-height": viewport ? `${viewport.height}px` : "100dvh",
    top: viewport?.top ?? 0,
    bottom: "auto",
    height: "var(--thought-height)",
    boxSizing: "border-box",
  } as CSSProperties;
}
