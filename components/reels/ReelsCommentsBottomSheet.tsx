"use client";

import React, { CSSProperties, useEffect } from "react";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
};

export default function ReelsCommentsBottomSheet({
  isOpen,
  onClose,
  title = "Comments",
  subtitle,
  children,
  footer,
}: Props) {
  useEffect(() => {
    if (!isOpen) return;

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };

    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <>
      {/* Overlay */}
      <div style={overlay} onClick={onClose} />

      {/* Bottom Sheet */}
      <div style={sheet}>
        {/* Handle */}
        <div style={handle} />

        {/* Header */}
        <div style={header}>
          <div style={titleStyle}>{title}</div>
          {subtitle && <div style={subtitleStyle}>{subtitle}</div>}
        </div>

        {/* Content */}
        <div style={content}>{children}</div>

        {/* Footer */}
        {footer && <div style={footerStyle}>{footer}</div>}
      </div>
    </>
  );
}

const overlay: CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.65)",
  zIndex: 100,
};

const sheet: CSSProperties = {
  position: "fixed",
  bottom: 0,
  left: 0,
  right: 0,
  height: "60%",
  background: "#0b1020",
  borderTopLeftRadius: 20,
  borderTopRightRadius: 20,
  zIndex: 101,
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
};

const handle: CSSProperties = {
  width: 40,
  height: 4,
  background: "#888",
  borderRadius: 999,
  margin: "10px auto",
};

const header: CSSProperties = {
  textAlign: "center",
  padding: "10px",
  borderBottom: "1px solid rgba(255,255,255,0.1)",
};

const titleStyle: CSSProperties = {
  fontWeight: 800,
  fontSize: "16px",
};

const subtitleStyle: CSSProperties = {
  fontSize: "12px",
  color: "#aaa",
  marginTop: "4px",
};

const content: CSSProperties = {
  flex: 1,
  overflowY: "auto",
  padding: "10px",
};

const footerStyle: CSSProperties = {
  padding: "10px",
  borderTop: "1px solid rgba(255,255,255,0.1)",
};