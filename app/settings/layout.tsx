"use client";

import SettingsNav from "@/components/SettingsNav";

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="settings-app-shell relative flex min-h-svh bg-[#05050b] text-white lg:h-dvh lg:min-h-dvh lg:overflow-hidden">
      {/* Decorative background orbs */}
      <div className="pointer-events-none fixed -right-28 -top-28 h-96 w-96 rounded-full bg-purple-600/20 blur-3xl" />
      <div className="pointer-events-none fixed left-1/2 top-24 h-80 w-80 -translate-x-1/2 rounded-full bg-fuchsia-500/8 blur-3xl" />
      <div className="pointer-events-none fixed -bottom-28 -left-28 h-96 w-96 rounded-full bg-indigo-500/10 blur-3xl" />

      {/* Left sidebar navigation — desktop only */}
      <SettingsNav />

      {/*
        Mobile and tablet use the document scroll instead of a nested fixed-height
        scroller. This is more reliable with iOS Safari, Android Chrome, dynamic
        address bars, keyboards, and safe-area insets.

        Desktop keeps the dedicated Settings content scroller beside the sidebar.
      */}
      <div
        className="settings-content-scroll relative z-10 min-w-0 flex-1 overflow-x-hidden touch-pan-y lg:h-dvh lg:overflow-y-auto lg:overscroll-y-contain"
        style={{
          WebkitOverflowScrolling: "touch",
          scrollbarGutter: "stable",
        }}
      >
        {children}
      </div>

      <style jsx global>{`
        @media (max-width: 1023px) {
          .settings-app-shell {
            min-height: 100svh;
            height: auto;
            overflow: visible;
          }

          .settings-content-scroll {
            min-height: 100svh;
            height: auto;
            overflow-y: visible;
            overscroll-behavior-y: auto;
          }
        }

        @media (min-width: 1024px) {
          .settings-content-scroll {
            overscroll-behavior-y: contain;
          }
        }
      `}</style>
    </div>
  );
}
