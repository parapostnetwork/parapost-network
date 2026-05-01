"use client";

import { CSSProperties, ReactNode, useEffect, useMemo, useState } from "react";
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
    pathname?.startsWith("/notifications");

  if (!shouldShow) return null;

  const profileHref = resolvedUserId ? `/profile/${resolvedUserId}` : "/dashboard";

  const goTo = (href: string) => {
    router.push(href);
  };

  const handleCreatePost = () => {
    if (onCreatePost) {
      onCreatePost();
      return;
    }

    goTo("/dashboard?createPost=1");
  };

  return (
    <nav className="xl:hidden" aria-label="Primary bottom navigation" style={navStyle}>
      <NavButton
        label="Home"
        icon="⌂"
        active={detectedActiveItem === "home"}
        onClick={() => goTo("/dashboard")}
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
      style={active ? activeItemStyle : itemButtonStyle}
      aria-label={label}
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
  bottom: "12px",
  zIndex: 2147483647,
  minHeight: "76px",
  borderRadius: "28px",
  border: "1px solid rgba(255,255,255,0.12)",
  background:
    "linear-gradient(180deg, rgba(10,14,22,0.98), rgba(5,7,12,1))",
  boxShadow: "0 18px 50px rgba(0,0,0,0.65)",
  backdropFilter: "blur(18px)",
  WebkitBackdropFilter: "blur(18px)",
  display: "grid",
  gridTemplateColumns: "1fr 1fr auto 1fr 1fr",
  alignItems: "center",
  gap: "4px",
  padding: "8px",
  pointerEvents: "auto",
};

const itemButtonStyle: CSSProperties = {
  minHeight: "58px",
  width: "100%",
  border: "none",
  background: "transparent",
  borderRadius: "22px",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: "4px",
  color: "#9ca3af",
  fontSize: "11px",
  fontWeight: 900,
  letterSpacing: "-0.01em",
  cursor: "pointer",
  touchAction: "manipulation",
  WebkitTapHighlightColor: "transparent",
  userSelect: "none",
  position: "relative",
  zIndex: 2,
};

const activeItemStyle: CSSProperties = {
  ...itemButtonStyle,
  color: "#ffffff",
  background: "rgba(168,85,247,0.18)",
  boxShadow: "inset 0 0 0 1px rgba(168,85,247,0.22)",
};

const iconStyle: CSSProperties = {
  fontSize: "22px",
  lineHeight: 1,
};

const labelStyle: CSSProperties = {
  fontSize: "11px",
  lineHeight: 1.1,
};

const createButtonStyle: CSSProperties = {
  width: "62px",
  height: "62px",
  borderRadius: "50%",
  border: "3px solid rgba(255,255,255,0.88)",
  background:
    "linear-gradient(135deg, #ffffff 0%, #ffffff 42%, #a855f7 43%, #ec4899 100%)",
  color: "#05070a",
  fontSize: "38px",
  fontWeight: 900,
  lineHeight: 1,
  display: "grid",
  placeItems: "center",
  boxShadow: "0 0 26px rgba(168,85,247,0.50)",
  cursor: "pointer",
  transform: "translateY(-14px)",
  touchAction: "manipulation",
  WebkitTapHighlightColor: "transparent",
  userSelect: "none",
};

const profileDotStyle: CSSProperties = {
  width: "18px",
  height: "18px",
  borderRadius: "999px",
  background: "linear-gradient(135deg, #a855f7, #7c3aed)",
  boxShadow: "0 0 18px rgba(168,85,247,0.45)",
};
