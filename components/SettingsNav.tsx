"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type NavLink = {
  label: string;
  href: string;
  comingSoon?: boolean;
};

type NavGroup = {
  label: string;
  links: NavLink[];
};

const NAV_GROUPS: NavGroup[] = [
  {
    label: "Your Account",
    links: [
      { label: "Account & Security", href: "/settings/account" },
      { label: "Profile Settings", href: "/settings/profile" },
      { label: "Profile Visibility", href: "/settings/profile-visibility" },
    ],
  },
  {
    label: "Privacy & Safety",
    links: [
      { label: "Privacy & Safety", href: "/settings/privacy-safety" },
      { label: "Blocked Users", href: "/settings/blocked-users" },
    ],
  },
  {
    label: "Preferences",
    links: [
      { label: "Personalization", href: "/settings/personalization" },
      { label: "Notifications", href: "/settings/notifications" },
      { label: "Content & Feed", href: "/settings/content-feed" },
    ],
  },
  {
    label: "Data & Support",
    links: [
      { label: "Data & Account Files", href: "/settings/data" },
      { label: "Help & Support", href: "/settings/help-support" },
      { label: "Legal & Policies", href: "/settings/legal" },
    ],
  },
  {
    label: "Monetization",
    links: [
      { label: "Payments", href: "/settings/payments", comingSoon: true },
    ],
  },
];

function isActivePath(pathname: string, href: string) {
  if (pathname === href) return true;

  // Keep the parent Settings section highlighted while viewing a nested page,
  // such as /settings/legal/terms or /settings/legal/privacy.
  return pathname.startsWith(`${href}/`);
}

export default function SettingsNav() {
  const pathname = usePathname();

  return (
    <aside
      className="settings-desktop-nav hidden h-[100dvh] min-h-0 w-60 shrink-0 flex-col overflow-hidden border-r border-white/[0.06] bg-[#05050b] lg:flex"
    >
      {/* Top — back to dashboard + settings label */}
      <div className="shrink-0 border-b border-white/[0.06] px-4 pb-3 pt-5">
        <Link
          href="/dashboard"
          className="mb-4 inline-flex items-center gap-1.5 text-xs font-bold text-slate-400 no-underline transition hover:text-white"
        >
          ← Dashboard
        </Link>

        <p className="text-[11px] font-black uppercase tracking-[0.2em] text-purple-300/60">
          Settings
        </p>
      </div>

      {/* Nav groups — this is the only scrolling section */}
      <nav
        className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-3 py-3"
        style={{
          WebkitOverflowScrolling: "touch",
          scrollbarWidth: "thin",
          scrollbarGutter: "stable",
        }}
      >
        <div className="space-y-1">
          {NAV_GROUPS.map((group) => (
            <div key={group.label}>
              <p className="px-2 pb-1 pt-4 text-[10px] font-black uppercase tracking-[0.18em] text-purple-300/50 first:pt-2">
                {group.label}
              </p>

              {group.links.map((link) => {
                const isActive = isActivePath(pathname, link.href);

                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className="flex items-center justify-between rounded-xl px-3 py-2 text-sm font-bold no-underline transition-all"
                    style={
                      isActive
                        ? {
                            background: "var(--parapost-accent-active-bg)",
                            color: "var(--parapost-accent-readable-text)",
                            boxShadow:
                              "inset 0 0 0 1px var(--parapost-accent-active-border)",
                          }
                        : { color: "#94a3b8" }
                    }
                    onMouseEnter={(event) => {
                      if (!isActive) {
                        event.currentTarget.style.color = "#ffffff";
                        event.currentTarget.style.background =
                          "rgba(255,255,255,0.04)";
                      }
                    }}
                    onMouseLeave={(event) => {
                      if (!isActive) {
                        event.currentTarget.style.color = "#94a3b8";
                        event.currentTarget.style.background = "transparent";
                      }
                    }}
                  >
                    <span>{link.label}</span>

                    {link.comingSoon ? (
                      <span className="rounded-full border border-amber-300/25 bg-amber-400/10 px-2 py-0.5 text-[10px] font-black text-amber-200">
                        Soon
                      </span>
                    ) : null}
                  </Link>
                );
              })}
            </div>
          ))}
        </div>
      </nav>

      {/* Bottom — settings hub link */}
      <div className="shrink-0 border-t border-white/[0.06] px-3 pb-[calc(12px+env(safe-area-inset-bottom))] pt-3">
        <Link
          href="/settings"
          className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold text-slate-500 no-underline transition hover:bg-white/[0.04] hover:text-white"
        >
          ⚙ Settings Overview
        </Link>
      </div>
    </aside>
  );
}
