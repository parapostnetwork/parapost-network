"use client";

import React, { CSSProperties } from "react";

type ReelCardProps = {
  children: React.ReactNode;
  width: string;
  height: string;
  borderRadius: number;
  isDimmed?: boolean;
  isMobile?: boolean;
};

export default function ReelCard({
  children,
  width,
  height,
  borderRadius,
  isDimmed = false,
  isMobile = false,
}: ReelCardProps) {
  const cardStyle: CSSProperties = {
    position: "relative",
    width,
    height,
    maxWidth: "100%",
    overflow: "hidden",
    borderRadius,
    background: "#000",
    boxShadow: isMobile ? "none" : "0 16px 44px rgba(0,0,0,0.46)",
    transform: isDimmed ? "scale(0.985)" : "scale(1)",
    filter: isDimmed ? "brightness(0.78)" : "brightness(1)",
    transition: "transform 220ms ease, filter 220ms ease",
  };

  return <div style={cardStyle}>{children}</div>;
}