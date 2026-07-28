"use client";

import { CSSProperties, ReactNode, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type BottomNavItem = "home" | "reels" | "parachat" | "profile";

type BottomNavProps = {
  currentUserId?: string;
  onCreatePost?: () => void;
  activeItem?: BottomNavItem;
};

export default function BottomNav({
  currentUserId = "",
  onCreatePost,
  activeItem,
}: BottomNavProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [resolvedUserId, setResolvedUserId] = useState(currentUserId);
  const [portalReady, setPortalReady] = useState(false);

  useEffect(() => {
    setPortalReady(true);
  }, []);

  useEffect(() => {
    if (currentUserId) {
      setResolvedUserId(currentUserId);
      return;
    }

    let mounted = true;

    supabase.auth.getUser().then(({ data }) => {
      if (!mounted) return;
      setResolvedUserId(data.user?.id || "");
    });

    return () => {
      mounted = false;
    };
  }, [currentUserId]);

  const detectedActiveItem = useMemo<BottomNavItem | undefined>(() => {
    if (activeItem) return activeItem;
    if (pathname?.startsWith("/reels")) return "reels";
    if (pathname?.startsWith("/messages")) return "parachat";
    if (pathname?.startsWith("/profile")) return "profile";
    if (pathname?.startsWith("/dashboard")) return "home";
    return undefined;
  }, [activeItem, pathname]);

  const shouldShow =
    pathname?.startsWith("/dashboard") ||
    pathname?.startsWith("/reels") ||
    pathname?.startsWith("/messages") ||
    pathname?.startsWith("/profile") ||
    pathname?.startsWith("/friends") ||
    pathname?.startsWith("/notifications") ||
    pathname?.startsWith("/settings");

  if (!shouldShow || !portalReady) return null;

  const profileHref = resolvedUserId ? `/profile/${resolvedUserId}` : "/dashboard";

  const goTo = (href: string) => {
    router.push(href);
  };

  const goToHomeFeed = () => {
    if (pathname?.startsWith("/dashboard")) {
      router.refresh();
      return;
    }

    router.push("/dashboard");
  };

  const handleCreatePost = () => {
    if (onCreatePost) {
      onCreatePost();
      return;
    }

    goTo("/dashboard?createPost=1");
  };

  return createPortal(
    <>
      <nav
        aria-label="Primary bottom navigation"
        className="parapost-bottom-nav"
        style={navStyle}
      >
        <NavButton
          label="Home"
          icon="⌂"
          active={detectedActiveItem === "home"}
          onClick={goToHomeFeed}
        />

        <NavButton
          label="Reels"
          icon="▣"
          active={detectedActiveItem === "reels"}
          onClick={() => goTo("/reels")}
        />

        <button
          type="button"
          aria-label="Create a post"
          onClick={handleCreatePost}
          className="parapost-bottom-nav-create"
          style={createButtonStyle}
        >
          +
        </button>

        <NavButton
          label="Parachat"
          icon="☏"
          active={detectedActiveItem === "parachat"}
          onClick={() => goTo("/messages")}
        />

        <NavButton
          label="Profile"
          customIcon={<span style={profileDotStyle} />}
          active={detectedActiveItem === "profile"}
          onClick={() => goTo(profileHref)}
        />
      </nav>

      <style jsx global>{`
        .parapost-bottom-nav,
        .parapost-bottom-nav * {
          box-sizing: border-box;
        }

        .parapost-bottom-nav {
          width: auto !important;
          max-width: none !important;
          min-height: 88px !important;
          left: max(12px, env(safe-area-inset-left)) !important;
          right: max(12px, env(safe-area-inset-right)) !important;
          bottom: max(12px, env(safe-area-inset-bottom)) !important;
          padding: 10px !important;
          gap: 6px !important;
          border-radius: 30px !important;
        }

        .parapost-bottom-nav button {
          -webkit-tap-highlight-color: transparent;
        }

        .parapost-bottom-nav-item {
          min-height: 68px !important;
          border-radius: 23px !important;
        }

        .parapost-bottom-nav-create {
          width: 74px !important;
          height: 74px !important;
          min-width: 74px !important;
          min-height: 74px !important;
          border-radius: 999px !important;
          aspect-ratio: 1 / 1 !important;
          padding: 0 !important;
          font-size: 44px !important;
          line-height: 1 !important;
          transform: translateY(-16px) !important;
        }

        @media (min-width: 760px) {
          .parapost-bottom-nav {
            left: max(12px, env(safe-area-inset-left)) !important;
            right: max(12px, env(safe-area-inset-right)) !important;
            width: auto !important;
            max-width: none !important;
            transform: none !important;
          }
        }

        @media (max-width: 430px) {
          .parapost-bottom-nav {
            min-height: 82px !important;
            border-radius: 26px !important;
            padding: 8px !important;
            gap: 3px !important;
          }

          .parapost-bottom-nav-item {
            min-height: 62px !important;
          }

          .parapost-bottom-nav-create {
            width: 66px !important;
            height: 66px !important;
            min-width: 66px !important;
            min-height: 66px !important;
            font-size: 38px !important;
            transform: translateY(-14px) !important;
          }
        }

        @media (max-width: 370px) {
          .parapost-bottom-nav {
            left: max(8px, env(safe-area-inset-left)) !important;
            right: max(8px, env(safe-area-inset-right)) !important;
            min-height: 76px !important;
            padding: 7px !important;
          }

          .parapost-bottom-nav-item {
            min-height: 58px !important;
          }

          .parapost-bottom-nav-create {
            width: 58px !important;
            height: 58px !important;
            min-width: 58px !important;
            min-height: 58px !important;
            font-size: 34px !important;
            transform: translateY(-11px) !important;
          }
        }

        @media (max-height: 560px) and (orientation: landscape) {
          .parapost-bottom-nav {
            min-height: 70px !important;
            bottom: max(8px, env(safe-area-inset-bottom)) !important;
            border-radius: 22px !important;
          }

          .parapost-bottom-nav-item {
            min-height: 54px !important;
          }

          .parapost-bottom-nav-create {
            width: 58px !important;
            height: 58px !important;
            min-width: 58px !important;
            min-height: 58px !important;
            transform: translateY(-10px) !important;
          }
        }
      `}</style>
    </>,
    document.body
  );
}

function NavButton({
  label,
  icon,
  customIcon,
  active,
  onClick,
}: {
  label: string;
  icon?: string;
  customIcon?: ReactNode;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="parapost-bottom-nav-item"
      style={active ? activeItemStyle : itemButtonStyle}
      aria-label={label}
      aria-current={active ? "page" : undefined}
    >
      {customIcon ? customIcon : <span style={iconStyle}>{icon}</span>}
      <span style={labelStyle}>{label}</span>
    </button>
  );
}

const navStyle: CSSProperties = {
  position: "fixed",
  left: "12px",
  right: "12px",
  bottom: "max(12px, env(safe-area-inset-bottom))",
  zIndex: 2147483647,
  width: "auto",
  maxWidth: "none",
  minHeight: "88px",
  borderRadius: "30px",
  border: "1px solid rgba(255,255,255,0.12)",
  background:
    "linear-gradient(180deg, rgba(10,14,22,0.98), rgba(5,7,12,1))",
  boxShadow: "0 18px 50px rgba(0,0,0,0.65)",
  backdropFilter: "blur(18px)",
  WebkitBackdropFilter: "blur(18px)",
  display: "grid",
  gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr) 74px minmax(0,1fr) minmax(0,1fr)",
  alignItems: "center",
  gap: "6px",
  padding: "10px",
  pointerEvents: "auto",
  overflow: "visible",
};

const itemButtonStyle: CSSProperties = {
  minHeight: "68px",
  width: "100%",
  minWidth: 0,
  border: "none",
  background: "transparent",
  borderRadius: "23px",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: "5px",
  color: "#9ca3af",
  fontSize: "12px",
  fontWeight: 900,
  letterSpacing: "-0.01em",
  cursor: "pointer",
  touchAction: "manipulation",
  WebkitTapHighlightColor: "transparent",
  userSelect: "none",
  position: "relative",
  zIndex: 2,
  padding: "7px 3px",
};

const activeItemStyle: CSSProperties = {
  ...itemButtonStyle,
  color: "#ffffff",
  background: "rgba(168,85,247,0.18)",
  boxShadow: "inset 0 0 0 1px rgba(168,85,247,0.22)",
};

const iconStyle: CSSProperties = {
  fontSize: "24px",
  lineHeight: 1,
};

const labelStyle: CSSProperties = {
  fontSize: "12px",
  lineHeight: 1.1,
  maxWidth: "100%",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const createButtonStyle: CSSProperties = {
  width: "74px",
  height: "74px",
  minWidth: "74px",
  minHeight: "74px",
  aspectRatio: "1 / 1",
  borderRadius: "999px",
  border: "3px solid rgba(255,255,255,0.88)",
  background:
    "linear-gradient(135deg, #ffffff 0%, #ffffff 42%, #a855f7 43%, #ec4899 100%)",
  color: "#05070a",
  fontSize: "44px",
  fontWeight: 900,
  lineHeight: 1,
  display: "grid",
  placeItems: "center",
  boxShadow: "0 0 28px rgba(168,85,247,0.56)",
  cursor: "pointer",
  transform: "translateY(-16px)",
  touchAction: "manipulation",
  WebkitTapHighlightColor: "transparent",
  userSelect: "none",
  flexShrink: 0,
  position: "relative",
  zIndex: 3,
  padding: 0,
};

const profileDotStyle: CSSProperties = {
  width: "20px",
  height: "20px",
  borderRadius: "999px",
  background: "linear-gradient(135deg, #a855f7, #7c3aed)",
  boxShadow: "0 0 18px rgba(168,85,247,0.45)",
};
