"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import NotificationsPage from "@/app/notifications/page";

export default function DesktopNotificationsModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    window.addEventListener("keydown", handleEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleEscape);
    };
  }, [open, onClose]);

  if (!mounted || !open) return null;

  return createPortal(
    <div style={{ position: "fixed", inset: 0, zIndex: 200000 }}>
      <button
        type="button"
        aria-label="Close Notifications overlay"
        onClick={onClose}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          border: 0,
          background: "rgba(0,0,0,.76)",
          cursor: "default",
        }}
      />

      <section
        role="dialog"
        aria-modal="true"
        aria-label="Notifications"
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: "min(1080px, calc(100vw - 64px))",
          height: "min(800px, calc(100dvh - 64px))",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          borderRadius: 20,
          border: "1px solid rgba(184,144,230,.28)",
          background: "#0d0917",
          boxShadow: "0 30px 100px rgba(0,0,0,.75)",
        }}
      >
        <div
          style={{
            flexShrink: 0,
            height: 46,
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            padding: "0 16px",
            background: "#130c20",
            borderBottom: "1px solid rgba(184,144,230,.14)",
          }}
        >
          <button
            ref={closeRef}
            type="button"
            aria-label="Close Notifications"
            onClick={onClose}
            style={{
              width: 34,
              height: 34,
              borderRadius: 999,
              border: "1px solid rgba(184,144,230,.25)",
              background: "rgba(255,255,255,.06)",
              color: "#fff",
              fontSize: 24,
              cursor: "pointer",
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>

        <div
          className="desktop-notifications-modal-content"
          style={{ flex: 1, minHeight: 0, overflowY: "auto" }}
        >
          <style>{`
            .desktop-notifications-modal-content .notifications-page-root {
              min-height: 0 !important;
              height: auto !important;
              width: 100% !important;
            }
            .desktop-notifications-modal-content .notifications-page-inner {
              width: 100% !important;
              max-width: 100% !important;
              padding: 18px 28px 32px !important;
            }
          `}</style>
          <NotificationsPage />
        </div>
      </section>
    </div>,
    document.body
  );
}
