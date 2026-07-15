"use client";

import React, {
  CSSProperties,
  useEffect,
  useMemo,
  useState,
} from "react";
import { createPortal } from "react-dom";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
};

type ViewportType = "mobile" | "tablet" | "desktop";

function getViewportType(width: number): ViewportType {
  if (width <= 767) return "mobile";
  if (width <= 1180) return "tablet";
  return "desktop";
}

export default function ReelsCommentsBottomSheet({
  isOpen,
  onClose,
  title = "Comments",
  subtitle,
  children,
  footer,
}: Props) {
  const [viewportWidth, setViewportWidth] = useState(1440);
  const [viewportHeight, setViewportHeight] = useState(900);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // This flag is required because createPortal can only run after the component
    // reaches the browser. The update intentionally occurs once on mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);

    const setViewport = () => {
      setViewportWidth(window.innerWidth);
      setViewportHeight(window.innerHeight);
    };

    setViewport();
    window.addEventListener("resize", setViewport, { passive: true });
    window.addEventListener("orientationchange", setViewport);

    return () => {
      window.removeEventListener("resize", setViewport);
      window.removeEventListener("orientationchange", setViewport);
    };
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    const previousHtmlOverscroll =
      document.documentElement.style.overscrollBehavior;

    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    document.documentElement.style.overscrollBehavior = "none";

    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    window.addEventListener("keydown", handleKey);

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
      document.documentElement.style.overscrollBehavior =
        previousHtmlOverscroll;
      window.removeEventListener("keydown", handleKey);
    };
  }, [isOpen, onClose]);

  const viewportType = getViewportType(viewportWidth);
  const isDesktop = viewportType === "desktop";
  const isTablet = viewportType === "tablet";
  const isMobile = viewportType === "mobile";
  const isShortMobile = isMobile && viewportHeight <= 700;
  const isLandscapeTablet = isTablet && viewportWidth > viewportHeight;

  const sheetStyle = useMemo<CSSProperties>(() => {
    const shared: CSSProperties = {
      position: "fixed",
      left: "50%",
      right: "auto",
      bottom: 0,
      transform: "translate3d(-50%, 0, 0)",
      background:
        "linear-gradient(180deg, rgba(15,23,42,0.995) 0%, rgba(7,9,13,0.995) 100%)",
      borderTopLeftRadius: 30,
      borderTopRightRadius: 30,
      border: "1px solid rgba(255,255,255,0.12)",
      borderBottom: "none",
      zIndex: 2147483647,
      display: "flex",
      flexDirection: "column",
      overflow: "hidden",
      boxSizing: "border-box",
      isolation: "isolate",
      margin: 0,
    };

    if (isDesktop) {
      return {
        ...shared,
        width: "min(620px, calc(100vw - 48px))",
        height: "min(74dvh, 760px)",
        maxHeight: "calc(100dvh - 92px)",
        boxShadow:
          "0 -24px 70px rgba(0,0,0,0.56), 0 0 44px rgba(168,85,247,0.12)",
      };
    }

    if (isTablet) {
      const sideGap = isLandscapeTablet ? 34 : 24;

      return {
        ...shared,
        top: "50%",
        bottom: "auto",
        width: `min(760px, calc(100vw - ${sideGap * 2}px - env(safe-area-inset-left) - env(safe-area-inset-right)))`,
        height: isLandscapeTablet
          ? "min(72dvh, 650px)"
          : "min(70dvh, 720px)",
        maxHeight: isLandscapeTablet
          ? "calc(100dvh - 88px - env(safe-area-inset-top) - env(safe-area-inset-bottom))"
          : "calc(100dvh - 120px - env(safe-area-inset-top) - env(safe-area-inset-bottom))",
        transform: "translate3d(-50%, -50%, 0)",
        borderRadius: 28,
        borderBottom: "1px solid rgba(255,255,255,0.12)",
        boxShadow:
          "0 24px 70px rgba(0,0,0,0.58), 0 0 36px rgba(168,85,247,0.12)",
      };
    }

    return {
      ...shared,
      left: 0,
      right: 0,
      width: "100%",
      transform: "none",
      height: isShortMobile ? "72dvh" : "68dvh",
      maxHeight: "calc(100dvh - 72px)",
      minHeight: "min(54dvh, 520px)",
      borderTopLeftRadius: 26,
      borderTopRightRadius: 26,
      boxShadow:
        "0 -24px 60px rgba(0,0,0,0.56), 0 -1px 28px rgba(168,85,247,0.10)",
    };
  }, [
    isDesktop,
    isTablet,
    isLandscapeTablet,
    isShortMobile,
  ]);

  if (!isOpen || !mounted || typeof document === "undefined") return null;

  return createPortal(
    <>
      <button
        type="button"
        aria-label="Close comments"
        style={overlayStyle}
        onClick={onClose}
      />

      <aside
        className="parapost-reels-comments-sheet"
        style={sheetStyle}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
      >
        <div style={handleWrapStyle}>
          <div style={handleStyle} />
        </div>

        <div
          style={{
            ...headerStyle,
            padding: isDesktop
              ? "14px 18px 13px"
              : isMobile
                ? "10px 14px 11px"
                : "13px 18px 14px",
          }}
        >
          <div style={{ minWidth: 0, width: "100%" }}>
            <div style={eyebrowStyle}>Parapost Reels</div>

            <div style={titleRowStyle}>
              <h2
                style={{
                  ...titleStyle,
                  fontSize: isMobile ? 20 : 22,
                }}
              >
                {title}
              </h2>

              <button
                type="button"
                onClick={onClose}
                style={{
                  ...closeButtonStyle,
                  width: isMobile ? 36 : 40,
                  height: isMobile ? 36 : 40,
                }}
                aria-label="Close comments"
              >
                ×
              </button>
            </div>

            {subtitle ? (
              <div
                style={{
                  ...subtitleStyle,
                  WebkitLineClamp: isMobile ? 1 : 2,
                }}
              >
                {subtitle}
              </div>
            ) : null}
          </div>
        </div>

        <div
          style={{
            ...contentStyle,
            padding: isMobile
              ? "10px 12px 12px"
              : isTablet
                ? "12px 18px 16px"
                : contentStyle.padding,
          }}
        >
          {children}
        </div>

        {footer ? (
          <div
            style={{
              ...footerStyle,
              padding: isMobile
                ? "10px 12px calc(12px + env(safe-area-inset-bottom))"
                : isTablet
                  ? "12px 18px calc(14px + env(safe-area-inset-bottom))"
                  : footerStyle.padding,
            }}
          >
            {footer}
          </div>
        ) : null}
      </aside>
    </>,
    document.body,
  );
}

const overlayStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  width: "100%",
  height: "100%",
  padding: 0,
  border: "none",
  background:
    "radial-gradient(circle at center, rgba(0,0,0,0.36), rgba(0,0,0,0.72))",
  backdropFilter: "blur(5px)",
  WebkitBackdropFilter: "blur(5px)",
  zIndex: 2147483646,
  cursor: "default",
};

const handleWrapStyle: CSSProperties = {
  display: "grid",
  placeItems: "center",
  paddingTop: 8,
  flexShrink: 0,
};

const handleStyle: CSSProperties = {
  width: 44,
  height: 5,
  background: "rgba(255,255,255,0.30)",
  borderRadius: 999,
};

const headerStyle: CSSProperties = {
  borderBottom: "1px solid rgba(255,255,255,0.10)",
  flexShrink: 0,
  boxSizing: "border-box",
};

const eyebrowStyle: CSSProperties = {
  color: "#a78bfa",
  fontSize: 11,
  fontWeight: 900,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  marginBottom: 7,
};

const titleRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  minWidth: 0,
};

const titleStyle: CSSProperties = {
  margin: 0,
  minWidth: 0,
  color: "#fff",
  fontSize: 22,
  fontWeight: 950,
  letterSpacing: "-0.03em",
  lineHeight: 1.08,
};

const subtitleStyle: CSSProperties = {
  color: "#9ca3af",
  fontSize: 13,
  lineHeight: 1.45,
  marginTop: 6,
  overflow: "hidden",
  textOverflow: "ellipsis",
  display: "-webkit-box",
  WebkitLineClamp: 2,
  WebkitBoxOrient: "vertical",
};

const closeButtonStyle: CSSProperties = {
  width: 40,
  height: 40,
  borderRadius: "999px",
  border: "1px solid rgba(255,255,255,0.12)",
  background: "rgba(255,255,255,0.07)",
  color: "#ffffff",
  display: "grid",
  placeItems: "center",
  cursor: "pointer",
  fontSize: 24,
  lineHeight: 1,
  fontWeight: 500,
  flexShrink: 0,
  WebkitTapHighlightColor: "transparent",
};

const contentStyle: CSSProperties = {
  flex: 1,
  minHeight: 0,
  width: "100%",
  overflowY: "auto",
  overflowX: "hidden",
  padding: "12px 16px 14px",
  boxSizing: "border-box",
  overscrollBehavior: "contain",
  WebkitOverflowScrolling: "touch",
  touchAction: "pan-y",
};

const footerStyle: CSSProperties = {
  width: "100%",
  padding: "12px 16px calc(12px + env(safe-area-inset-bottom))",
  borderTop: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(7,9,13,0.97)",
  backdropFilter: "blur(14px)",
  WebkitBackdropFilter: "blur(14px)",
  flexShrink: 0,
  boxSizing: "border-box",
};
