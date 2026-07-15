"use client";

import SettingsNav from "@/components/SettingsNav";

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="settings-app-shell relative isolate flex min-h-[100dvh] overflow-x-hidden bg-[#05050b] text-white lg:h-[100dvh] lg:min-h-[100dvh] lg:overflow-hidden">
      {/* Decorative background orbs */}
      <div className="pointer-events-none absolute -right-28 -top-28 h-96 w-96 rounded-full bg-purple-600/20 blur-3xl" />
      <div className="pointer-events-none absolute left-1/2 top-24 h-80 w-80 -translate-x-1/2 rounded-full bg-fuchsia-500/8 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-28 -left-28 h-96 w-96 rounded-full bg-indigo-500/10 blur-3xl" />

      {/* Left sidebar navigation — desktop only */}
      <SettingsNav />

      {/*
        Mobile and tablet use the browser document scroll.
        Desktop keeps a dedicated Settings content scroller beside the sidebar.
      */}
      <div
        className="settings-content-scroll relative z-10 min-w-0 flex-1 overflow-x-hidden touch-pan-y lg:h-[100dvh] lg:overflow-y-auto lg:overscroll-y-contain"
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
            width: 100%;
            min-height: 100dvh;
            height: auto;
            overflow-x: hidden;
            overflow-y: visible;
          }

          .settings-content-scroll {
            width: 100%;
            min-height: 100dvh;
            height: auto;
            overflow-x: hidden;
            overflow-y: visible;
            overscroll-behavior-y: auto;
          }
        }

        @media (min-width: 1024px) {
          .settings-app-shell {
            height: 100dvh;
            min-height: 100dvh;
            overflow: hidden;
          }

          .settings-content-scroll {
            height: 100dvh;
            overflow-x: hidden;
            overflow-y: auto;
            overscroll-behavior-y: contain;
          }
        }
      `}</style>
    </div>
  );
}
