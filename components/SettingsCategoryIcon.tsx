export default function SettingsCategoryIcon({ route }: { route: string }) {
  const paths: Record<string, string> = {
    account: "M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2 M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0",
    profile: "M12 20h9 M16 4l4 4 M4 16 16 4a2.8 2.8 0 0 1 4 4L8 20H4z",
    "profile-visibility": "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7 M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0",
    "privacy-safety": "M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11 M9 12l2 2 4-4",
    "blocked-users": "M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0 M5 5l14 14",
    personalization: "M12 22a10 10 0 1 1 10-10c0 2-2 3-4 3h-2a2 2 0 0 0-2 2c0 1 1 2 1 3s-1 2-3 2 M7 12h.01 M10 7h.01 M15 7h.01 M18 11h.01",
    notifications: "M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9 M10 21h4",
    "content-feed": "M4 6h16 M4 12h16 M4 18h16",
    data: "M4 6c0-4 16-4 16 0s-16 4-16 0 M4 6v12c0 4 16 4 16 0V6 M4 12c0 4 16 4 16 0",
    "help-support": "M3 14v-2a9 9 0 0 1 18 0v2 M3 14h4v6H5a2 2 0 0 1-2-2z M21 14h-4v6h2a2 2 0 0 0 2-2z",
    legal: "M6 2h9l5 5v15H6z M14 2v6h6 M9 12h8 M9 16h8",
    payments: "M3 5h18v14H3z M3 10h18 M7 15h4",
  };

  return (
    <svg width="22" height="22" viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="1.7"
      strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true">
      <path d={paths[route.split("/").pop() || ""] || paths.account} />
    </svg>
  );
}
