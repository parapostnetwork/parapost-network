"use client";

import React, { useEffect, useRef } from "react";

export type InReelCommentsBottomSheetProps = {
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
}: InReelCommentsBottomSheetProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  return (
    <div
      aria-hidden={!isOpen}
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 20,
        pointerEvents: isOpen ? "auto" : "none",
      }}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Close comments"
        style={{
          position: "absolute",
          inset: 0,
          border: "none",
          padding: 0,
          background:
            "linear-gradient(180deg, rgba(0,0,0,0.00) 0%, rgba(0,0,0,0.03) 38%, rgba(0,0,0,0.18) 67%, rgba(0,0,0,0.34) 100%)",
          opacity: isOpen ? 1 : 0,
          transition: "opacity 180ms ease",
          cursor: "default",
        }}
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="false"
        aria-label={title}
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: "52%",
          minHeight: "260px",
          maxHeight: "56%",
          transform: isOpen ? "translateY(0%)" : "translateY(108%)",
          transition:
            "transform 240ms cubic-bezier(0.22, 1, 0.36, 1), box-shadow 180ms ease",
          borderTopLeftRadius: "24px",
          borderTopRightRadius: "24px",
          background:
            "linear-gradient(180deg, rgba(20,20,24,0.985) 0%, rgba(11,11,14,0.99) 100%)",
          borderTop: "1px solid rgba(255,255,255,0.09)",
          boxShadow: "0 -12px 32px rgba(0,0,0,0.42)",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          pointerEvents: "auto",
          backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
          willChange: "transform",
        }}
      >
        <div
          style={{
            padding: "10px 14px 12px",
            borderBottom: "1px solid rgba(255,255,255,0.06)",
            background:
              "linear-gradient(180deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.00) 100%)",
            flexShrink: 0,
          }}
        >
          <div
            style={{
              width: "34px",
              height: "4px",
              borderRadius: "999px",
              background: "rgba(255,255,255,0.26)",
              margin: "0 auto 10px auto",
            }}
          />

          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
              gap: "12px",
            }}
          >
            <div style={{ minWidth: 0, flex: 1 }}>
              <div
                style={{
                  fontSize: "16px",
                  fontWeight: 850,
                  color: "#ffffff",
                  lineHeight: 1.2,
                  letterSpacing: "-0.01em",
                }}
              >
                {title}
              </div>

              {subtitle ? (
                <div
                  style={{
                    marginTop: "4px",
                    fontSize: "12px",
                    color: "rgba(255,255,255,0.62)",
                    lineHeight: 1.35,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    maxWidth: "100%",
                  }}
                >
                  {subtitle}
                </div>
              ) : null}
            </div>

            <button
              type="button"
              onClick={onClose}
              aria-label="Close comments"
              style={{
                width: "32px",
                height: "32px",
                borderRadius: "999px",
                border: "1px solid rgba(255,255,255,0.08)",
                background: "rgba(255,255,255,0.065)",
                color: "#ffffff",
                cursor: "pointer",
                fontSize: "17px",
                lineHeight: 1,
                flexShrink: 0,
                display: "grid",
                placeItems: "center",
                transition: "background 160ms ease, transform 160ms ease",
              }}
              onMouseEnter={(event) => {
                event.currentTarget.style.background = "rgba(255,255,255,0.12)";
                event.currentTarget.style.transform = "scale(1.04)";
              }}
              onMouseLeave={(event) => {
                event.currentTarget.style.background = "rgba(255,255,255,0.065)";
                event.currentTarget.style.transform = "scale(1)";
              }}
            >
              ×
            </button>
          </div>
        </div>

        <div
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: "auto",
            overscrollBehavior: "contain",
            padding: "12px 12px 14px",
            WebkitOverflowScrolling: "touch",
            scrollbarWidth: "thin",
          }}
        >
          {children}
        </div>

        {footer ? (
          <div
            style={{
              padding: "10px 12px calc(12px + env(safe-area-inset-bottom, 0px))",
              borderTop: "1px solid rgba(255,255,255,0.06)",
              background:
                "linear-gradient(180deg, rgba(15,15,18,0.94) 0%, rgba(9,9,12,0.98) 100%)",
              flexShrink: 0,
            }}
          >
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}
