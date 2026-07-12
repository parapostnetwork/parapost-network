"use client";

import { ChangeEvent, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

type AdminRole = "owner" | "admin" | "support" | "moderator";
type ModerationRole = AdminRole;

type ReportStatus = "open" | "reviewing" | "resolved" | "dismissed";
type ReportTargetType = "profile" | "post" | "comment" | "reel" | "message";

type ReportRow = {
  id: string;
  reporter_id: string;
  reported_user_id: string | null;
  target_type: ReportTargetType | string;
  target_id: string;
  reason: string;
  details: string | null;
  status: ReportStatus | string;
  moderator_note: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
};

type AdminUser = {
  user_id: string;
  role: AdminRole | string;
};

type ProfileSummary = {
  id: string;
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
};

const ALLOWED_MODERATION_ROLES: ModerationRole[] = ["owner", "admin", "support", "moderator"];
const REPORT_MANAGER_ROLES: ModerationRole[] = ["owner", "admin", "moderator"];

const STATUS_OPTIONS: Array<{ value: ReportStatus; label: string }> = [
  { value: "open", label: "Open" },
  { value: "reviewing", label: "Reviewing" },
  { value: "resolved", label: "Resolved" },
  { value: "dismissed", label: "Dismissed" },
];

const TARGET_TYPE_OPTIONS: Array<{ value: ReportTargetType; label: string }> = [
  { value: "profile", label: "Profile" },
  { value: "post", label: "Post" },
  { value: "comment", label: "Comment" },
  { value: "reel", label: "Reel" },
  { value: "message", label: "Message" },
];

function formatDateTime(value?: string | null) {
  if (!value) return "Not available";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not available";

  return date.toLocaleString([], {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatRelativeTime(value?: string | null) {
  if (!value) return "just now";

  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) return "just now";

  const seconds = Math.max(1, Math.floor((Date.now() - timestamp) / 1000));
  if (seconds < 60) return "just now";

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;

  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w ago`;

  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;

  return `${Math.floor(days / 365)}y ago`;
}

function getTargetTypeLabel(targetType: string) {
  return TARGET_TYPE_OPTIONS.find((option) => option.value === targetType)?.label || targetType;
}

function getStatusLabel(status: string) {
  return STATUS_OPTIONS.find((option) => option.value === status)?.label || status;
}

function getStatusClass(status: string) {
  if (status === "resolved") return "border-emerald-300/30 bg-emerald-400/12 text-emerald-100";
  if (status === "dismissed") return "border-slate-300/20 bg-white/5 text-slate-300";
  if (status === "reviewing") return "border-amber-300/25 bg-amber-400/10 text-amber-100";
  return "border-fuchsia-300/25 bg-fuchsia-400/10 text-fuchsia-100";
}

function getTypeClass(targetType: string) {
  if (targetType === "profile") return "border-purple-300/25 bg-purple-400/10 text-purple-100";
  if (targetType === "post") return "border-blue-300/25 bg-blue-400/10 text-blue-100";
  if (targetType === "comment") return "border-cyan-300/25 bg-cyan-400/10 text-cyan-100";
  if (targetType === "reel") return "border-pink-300/25 bg-pink-400/10 text-pink-100";
  return "border-white/10 bg-white/5 text-slate-200";
}

function getProfileDisplayName(profile?: ProfileSummary | null) {
  return profile?.full_name?.trim() || profile?.username?.trim() || "Unknown user";
}

function getProfileHandle(profile?: ProfileSummary | null) {
  return profile?.username ? `@${profile.username.replace(/^@+/, "")}` : "No username";
}

function getTargetHref(report: ReportRow) {
  if (report.target_type === "profile") return `/profile/${report.target_id}`;
  if (report.target_type === "reel") return `/reels#${report.target_id}`;
  return "";
}

function shortenId(value?: string | null) {
  if (!value) return "Not available";
  if (value.length <= 18) return value;
  return `${value.slice(0, 8)}…${value.slice(-6)}`;
}

export default function AdminModerationPage() {
  const [currentUserId, setCurrentUserId] = useState("");
  const [adminRole, setAdminRole] = useState("");
  const [checkingAccess, setCheckingAccess] = useState(true);
  const [accessError, setAccessError] = useState("");
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [profilesMap, setProfilesMap] = useState<Record<string, ProfileSummary>>({});
  const [loadingReports, setLoadingReports] = useState(false);
  const [selectedId, setSelectedId] = useState("");
  const [statusFilter, setStatusFilter] = useState<ReportStatus | "all">("open");
  const [typeFilter, setTypeFilter] = useState<ReportTargetType | "all">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [moderatorNoteDraft, setModeratorNoteDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const isModerationAdmin = Boolean(
    currentUserId &&
      ALLOWED_MODERATION_ROLES.includes(adminRole as ModerationRole)
  );

  const canManageReports = Boolean(
    currentUserId &&
      REPORT_MANAGER_ROLES.includes(adminRole as ModerationRole)
  );

  const selectedReport = useMemo(() => {
    return reports.find((report) => report.id === selectedId) || reports[0] || null;
  }, [reports, selectedId]);

  const selectedReporter = selectedReport ? profilesMap[selectedReport.reporter_id] || null : null;
  const selectedReportedUser =
    selectedReport?.reported_user_id ? profilesMap[selectedReport.reported_user_id] || null : null;

  const filteredReports = useMemo(() => {
    const cleanSearch = searchQuery.trim().toLowerCase();

    return reports.filter((report) => {
      const statusMatch = statusFilter === "all" || report.status === statusFilter;
      const typeMatch = typeFilter === "all" || report.target_type === typeFilter;

      if (!statusMatch || !typeMatch) return false;
      if (!cleanSearch) return true;

      const reporter = profilesMap[report.reporter_id];
      const reportedUser = report.reported_user_id ? profilesMap[report.reported_user_id] : null;

      const combined = [
        report.reason,
        report.details,
        report.status,
        report.target_type,
        report.target_id,
        report.reporter_id,
        report.reported_user_id,
        report.moderator_note,
        reporter?.full_name,
        reporter?.username,
        reportedUser?.full_name,
        reportedUser?.username,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return combined.includes(cleanSearch);
    });
  }, [profilesMap, reports, searchQuery, statusFilter, typeFilter]);

  const stats = useMemo(() => {
    return {
      total: reports.length,
      open: reports.filter((report) => report.status === "open").length,
      reviewing: reports.filter((report) => report.status === "reviewing").length,
      resolved: reports.filter((report) => report.status === "resolved").length,
      dismissed: reports.filter((report) => report.status === "dismissed").length,
    };
  }, [reports]);

  const fetchProfiles = useCallback(async (reportRows: ReportRow[]) => {
    const profileIds = Array.from(
      new Set(
        reportRows
          .flatMap((report) => [report.reporter_id, report.reported_user_id])
          .filter(Boolean)
      )
    ) as string[];

    if (profileIds.length === 0) {
      setProfilesMap({});
      return;
    }

    const { data, error } = await supabase
      .from("profiles")
      .select("id, username, full_name, avatar_url")
      .in("id", profileIds);

    if (error) {
      console.warn("Could not load moderation profile summaries:", error.message);
      setProfilesMap({});
      return;
    }

    const nextMap: Record<string, ProfileSummary> = {};

    for (const profile of (data || []) as ProfileSummary[]) {
      nextMap[profile.id] = profile;
    }

    setProfilesMap(nextMap);
  }, []);

  const fetchReports = useCallback(async () => {
    setLoadingReports(true);
    setErrorMessage("");

    const { data, error } = await supabase
      .from("reports")
      .select(
        "id, reporter_id, reported_user_id, target_type, target_id, reason, details, status, moderator_note, reviewed_by, reviewed_at, created_at"
      )
      .order("created_at", { ascending: false })
      .limit(250);

    if (error) {
      setErrorMessage(`Could not load moderation reports: ${error.message}`);
      setReports([]);
      setProfilesMap({});
      setLoadingReports(false);
      return;
    }

    const nextReports = (data || []) as ReportRow[];
    setReports(nextReports);
    await fetchProfiles(nextReports);

    if (nextReports.length > 0) {
      setSelectedId((previousId) => {
        if (previousId && nextReports.some((report) => report.id === previousId)) {
          return previousId;
        }

        return nextReports[0].id;
      });
    } else {
      setSelectedId("");
    }

    setLoadingReports(false);
  }, [fetchProfiles]);

  useEffect(() => {
    let cancelled = false;

    async function checkAccess() {
      setCheckingAccess(true);
      setAccessError("");

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (cancelled) return;

      if (userError || !user) {
        setCurrentUserId("");
        setAdminRole("");
        setAccessError("Please sign in before opening the Parapost Network moderation dashboard.");
        setCheckingAccess(false);
        return;
      }

      setCurrentUserId(user.id);

      const { data: adminRow, error: adminError } = await supabase
        .from("admin_users")
        .select("user_id, role")
        .eq("user_id", user.id)
        .maybeSingle();

      if (cancelled) return;

      if (adminError) {
        setAdminRole("");
        setAccessError(`Could not verify moderation access: ${adminError.message}`);
        setCheckingAccess(false);
        return;
      }

      const role = (adminRow as AdminUser | null)?.role || "";

      if (!ALLOWED_MODERATION_ROLES.includes(role as ModerationRole)) {
        setAdminRole("");
        setAccessError("This page is private. Your account does not have owner, admin, support, or moderator access.");
        setCheckingAccess(false);
        return;
      }

      setAdminRole(role);
      setCheckingAccess(false);
    }

    void checkAccess();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isModerationAdmin) return;

    const timeoutId = window.setTimeout(() => {
      void fetchReports();
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [fetchReports, isModerationAdmin]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setModeratorNoteDraft(selectedReport?.moderator_note || "");
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [selectedReport?.id, selectedReport?.moderator_note]);

  const handleSelectReport = (reportId: string) => {
    setSelectedId(reportId);
    setNotice("");
    setErrorMessage("");
  };

  const handleUpdateReport = async (
    updates: Partial<Pick<ReportRow, "status" | "moderator_note">>
  ) => {
    if (!selectedReport || !currentUserId) return;

    if (!canManageReports) {
      setErrorMessage("Support access is read-only. A moderator, admin, or owner must update this report.");
      return;
    }

    setSaving(true);
    setNotice("");
    setErrorMessage("");

    const { error } = await supabase
      .from("reports")
      .update({
        ...updates,
        reviewed_by: currentUserId,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", selectedReport.id);

    setSaving(false);

    if (error) {
      setErrorMessage(`Could not update moderation report: ${error.message}`);
      return;
    }

    setNotice("Moderation report updated.");
    await fetchReports();
  };

  const handleStatusChange = async (event: ChangeEvent<HTMLSelectElement>) => {
    await handleUpdateReport({ status: event.target.value });
  };

  const handleSaveNotes = async () => {
    await handleUpdateReport({ moderator_note: moderatorNoteDraft.trim() || null });
  };

  if (checkingAccess) {
    return (
      <main className="h-dvh min-h-dvh overflow-y-auto overflow-x-hidden overscroll-y-contain bg-[#05050b] px-4 py-6 pb-[calc(7rem+env(safe-area-inset-bottom))] text-white sm:px-6 lg:px-8">
        <div className="mx-auto max-w-5xl rounded-[28px] border border-white/10 bg-white/[0.055] p-6">
          <p className="text-sm font-bold text-slate-300">Checking moderation dashboard access...</p>
        </div>
      </main>
    );
  }

  if (!isModerationAdmin) {
    return (
      <main className="h-dvh min-h-dvh overflow-y-auto overflow-x-hidden overscroll-y-contain bg-[#05050b] px-4 py-6 pb-[calc(7rem+env(safe-area-inset-bottom))] text-white sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl rounded-[28px] border border-white/10 bg-white/[0.055] p-6 shadow-2xl">
          <Link href="/settings" className="text-sm font-bold text-purple-200 no-underline hover:text-white">
            ← Back to Settings
          </Link>

          <h1 className="mt-6 text-3xl font-black tracking-[-0.04em]">Moderation Dashboard</h1>
          <p className="mt-3 text-sm leading-7 text-slate-300">{accessError}</p>

          <div className="mt-5 rounded-2xl border border-amber-300/25 bg-amber-400/10 p-4 text-sm leading-6 text-amber-100">
            To use this dashboard, your authenticated user ID must be stored in the{" "}
            <strong>admin_users</strong> table with the role <strong>owner</strong>, <strong>admin</strong>,{" "}
            <strong>support</strong>, or <strong>moderator</strong>.
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="parapost-admin-moderation-page h-dvh min-h-dvh overflow-y-auto overflow-x-hidden overscroll-y-contain bg-[#05050b] px-4 py-6 pb-[calc(7rem+env(safe-area-inset-bottom))] text-white sm:px-6 lg:px-8">
      <div className="pointer-events-none fixed -right-32 -top-32 h-96 w-96 rounded-full bg-purple-600/20 blur-3xl" />
      <div className="pointer-events-none fixed -bottom-32 -left-32 h-96 w-96 rounded-full bg-pink-500/10 blur-3xl" />

      <div className="relative z-10 mx-auto w-full max-w-7xl">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <Link href="/settings" className="text-sm font-bold text-purple-200 no-underline hover:text-white">
              ← Back to Settings
            </Link>

            <Link href="/admin/support" className="text-sm font-bold text-slate-300 no-underline hover:text-white">
              Support Inbox
            </Link>

            <Link href="/dashboard" className="text-sm font-bold text-slate-300 no-underline hover:text-white">
              Dashboard
            </Link>
          </div>

          <span className="rounded-full border border-emerald-300/25 bg-emerald-400/10 px-3 py-2 text-xs font-black uppercase tracking-[0.16em] text-emerald-100">
            {adminRole} access
          </span>
        </div>

        <header className="mb-5 rounded-[30px] border border-white/10 bg-gradient-to-br from-white/[0.075] to-purple-900/20 p-5 shadow-2xl sm:p-7">
          <p className="mb-3 text-xs font-black uppercase tracking-[0.18em] text-purple-200">
            Parapost Network Admin
          </p>
          <h1 className="text-3xl font-black leading-[0.95] tracking-[-0.055em] sm:text-5xl lg:text-6xl">
            Moderation Dashboard
          </h1>
          <p className="mt-5 max-w-3xl text-sm leading-7 text-slate-300 sm:text-base">
            Review user reports for profiles, posts, comments, Reels, and future Parachat messages.
            Track each report from open review through resolution while preserving an internal moderation record.
          </p>
        </header>

        {!canManageReports ? (
          <div className="mb-5 rounded-2xl border border-blue-300/25 bg-blue-400/10 px-4 py-3 text-sm font-bold leading-6 text-blue-100">
            Support access is read-only. You can review reports and open profiles, but a moderator, admin, or owner must update report statuses or private moderator notes.
          </div>
        ) : null}

        <section className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
          <StatCard label="Total" value={stats.total} />
          <StatCard label="Open" value={stats.open} />
          <StatCard label="Reviewing" value={stats.reviewing} />
          <StatCard label="Resolved" value={stats.resolved} />
          <StatCard label="Dismissed" value={stats.dismissed} />
        </section>

        <section className="grid gap-4 lg:grid-cols-[390px_minmax(0,1fr)]">
          <aside className="rounded-[28px] border border-white/10 bg-white/[0.055] p-4 shadow-2xl">
            <div className="mb-4 grid gap-3">
              <label className="block">
                <span className="mb-2 block text-xs font-black uppercase tracking-[0.14em] text-slate-400">
                  Search
                </span>
                <input
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Search reports..."
                  className="w-full rounded-2xl border border-white/10 bg-black/35 px-4 py-3 text-sm text-white outline-none placeholder:text-white/35 focus:border-purple-300/50"
                />
              </label>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-2 block text-xs font-black uppercase tracking-[0.14em] text-slate-400">
                    Status
                  </span>
                  <select
                    value={statusFilter}
                    onChange={(event) => setStatusFilter(event.target.value as ReportStatus | "all")}
                    className="w-full rounded-2xl border border-white/10 bg-black/35 px-3 py-3 text-sm text-white outline-none focus:border-purple-300/50"
                  >
                    <option value="all">All</option>
                    {STATUS_OPTIONS.map((status) => (
                      <option key={status.value} value={status.value}>
                        {status.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="mb-2 block text-xs font-black uppercase tracking-[0.14em] text-slate-400">
                    Type
                  </span>
                  <select
                    value={typeFilter}
                    onChange={(event) => setTypeFilter(event.target.value as ReportTargetType | "all")}
                    className="w-full rounded-2xl border border-white/10 bg-black/35 px-3 py-3 text-sm text-white outline-none focus:border-purple-300/50"
                  >
                    <option value="all">All</option>
                    {TARGET_TYPE_OPTIONS.map((targetType) => (
                      <option key={targetType.value} value={targetType.value}>
                        {targetType.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <button
                type="button"
                onClick={() => fetchReports()}
                disabled={loadingReports}
                className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-black text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loadingReports ? "Refreshing..." : "Refresh Reports"}
              </button>
            </div>

            <div className="max-h-[42dvh] space-y-3 overflow-y-auto pr-1 lg:max-h-[680px]">
              {loadingReports ? (
                <div className="rounded-2xl border border-white/10 bg-black/25 p-4 text-sm text-slate-300">
                  Loading moderation reports...
                </div>
              ) : filteredReports.length === 0 ? (
                <div className="rounded-2xl border border-white/10 bg-black/25 p-4 text-sm leading-6 text-slate-300">
                  No moderation reports match the current filters.
                </div>
              ) : (
                filteredReports.map((report) => {
                  const reportedUser = report.reported_user_id ? profilesMap[report.reported_user_id] : null;

                  return (
                    <button
                      key={report.id}
                      type="button"
                      onClick={() => handleSelectReport(report.id)}
                      className={`block w-full rounded-2xl border p-4 text-left transition ${
                        selectedReport?.id === report.id
                          ? "border-purple-300/40 bg-purple-500/15"
                          : "border-white/10 bg-black/25 hover:bg-white/[0.06]"
                      }`}
                    >
                      <div className="mb-3 flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-black text-white">
                            {getProfileDisplayName(reportedUser)}
                          </div>
                          <div className="truncate text-xs text-slate-500">
                            {getProfileHandle(reportedUser)}
                          </div>
                        </div>

                        <span className="shrink-0 text-xs font-bold text-slate-500">
                          {formatRelativeTime(report.created_at)}
                        </span>
                      </div>

                      <div className="mb-3 flex flex-wrap gap-2">
                        <span className={`rounded-full border px-2.5 py-1 text-[11px] font-black ${getStatusClass(report.status)}`}>
                          {getStatusLabel(report.status)}
                        </span>
                        <span className={`rounded-full border px-2.5 py-1 text-[11px] font-black ${getTypeClass(report.target_type)}`}>
                          {getTargetTypeLabel(report.target_type)}
                        </span>
                      </div>

                      <p className="line-clamp-3 text-sm leading-6 text-slate-300">{report.reason}</p>
                    </button>
                  );
                })
              )}
            </div>
          </aside>

          <section className="min-w-0 rounded-[24px] border border-white/10 bg-white/[0.055] p-4 shadow-2xl sm:rounded-[28px] sm:p-6">
            {!selectedReport ? (
              <div className="rounded-2xl border border-white/10 bg-black/25 p-5 text-sm text-slate-300">
                Select a moderation report to view details.
              </div>
            ) : (
              <>
                <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="mb-2 text-xs font-black uppercase tracking-[0.18em] text-purple-200">
                      {getTargetTypeLabel(selectedReport.target_type)} report
                    </p>
                    <h2 className="break-words text-2xl font-black tracking-[-0.035em] sm:text-3xl">
                      {getProfileDisplayName(selectedReportedUser)}
                    </h2>
                    <p className="mt-2 text-sm text-slate-400">
                      Submitted {formatDateTime(selectedReport.created_at)}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <span className={`rounded-full border px-3 py-2 text-xs font-black ${getStatusClass(selectedReport.status)}`}>
                      {getStatusLabel(selectedReport.status)}
                    </span>
                    <span className={`rounded-full border px-3 py-2 text-xs font-black ${getTypeClass(selectedReport.target_type)}`}>
                      {getTargetTypeLabel(selectedReport.target_type)}
                    </span>
                  </div>
                </div>

                <div className="mb-5 rounded-[24px] border border-white/10 bg-black/25 p-5">
                  <div className="mb-2 text-xs font-black uppercase tracking-[0.16em] text-slate-500">
                    Report reason
                  </div>
                  <p className="whitespace-pre-wrap text-sm leading-7 text-slate-100">{selectedReport.reason}</p>

                  {selectedReport.details ? (
                    <>
                      <div className="mb-2 mt-5 text-xs font-black uppercase tracking-[0.16em] text-slate-500">
                        Additional details
                      </div>
                      <p className="whitespace-pre-wrap text-sm leading-7 text-slate-300">{selectedReport.details}</p>
                    </>
                  ) : null}
                </div>

                <div className="mb-5 grid gap-4 md:grid-cols-2">
                  <InfoCard
                    label="Reported user"
                    title={getProfileDisplayName(selectedReportedUser)}
                    meta={getProfileHandle(selectedReportedUser)}
                    profileId={selectedReport.reported_user_id}
                  />

                  <InfoCard
                    label="Reported by"
                    title={getProfileDisplayName(selectedReporter)}
                    meta={getProfileHandle(selectedReporter)}
                    profileId={selectedReport.reporter_id}
                  />
                </div>

                <div className="mb-5 rounded-[24px] border border-white/10 bg-black/25 p-5">
                  <div className="mb-2 text-xs font-black uppercase tracking-[0.16em] text-slate-500">
                    Reported target
                  </div>

                  <div className="text-sm font-black text-white">
                    {getTargetTypeLabel(selectedReport.target_type)} · {shortenId(selectedReport.target_id)}
                  </div>

                  <div className="mt-3 text-xs leading-6 text-slate-500">
                    Full target ID: <span className="break-all">{selectedReport.target_id}</span>
                  </div>

                  {getTargetHref(selectedReport) ? (
                    <Link
                      href={getTargetHref(selectedReport)}
                      className="mt-4 inline-flex rounded-xl border border-purple-300/25 bg-purple-400/10 px-4 py-2 text-sm font-black text-purple-100 no-underline transition hover:bg-purple-400/15"
                    >
                      Open reported target
                    </Link>
                  ) : (
                    <div className="mt-4 text-xs leading-6 text-slate-500">
                      Direct opening will be added later for this target type. The saved target ID is available for review.
                    </div>
                  )}
                </div>

                <label className="mb-5 block">
                  <span className="mb-2 block text-sm font-black text-slate-200">Moderation status</span>
                  <select
                    value={selectedReport.status}
                    onChange={handleStatusChange}
                    disabled={saving || !canManageReports}
                    className="w-full rounded-2xl border border-white/10 bg-black/35 px-4 py-3 text-sm text-white outline-none focus:border-purple-300/50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {STATUS_OPTIONS.map((status) => (
                      <option key={status.value} value={status.value}>
                        {status.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="mb-5 block">
                  <span className="mb-2 block text-sm font-black text-slate-200">Private moderator notes</span>
                  <textarea
                    value={moderatorNoteDraft}
                    onChange={(event) => setModeratorNoteDraft(event.target.value)}
                    placeholder="Add private moderation notes..."
                    rows={6}
                    disabled={saving || !canManageReports}
                    className="min-h-[150px] w-full resize-y rounded-2xl border border-white/10 bg-black/35 px-4 py-3 text-sm leading-6 text-white outline-none placeholder:text-white/35 focus:border-purple-300/50 disabled:cursor-not-allowed disabled:opacity-60"
                  />
                </label>

                <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                  <div className="text-xs leading-6 text-slate-500">
                    {selectedReport.reviewed_at
                      ? `Last reviewed ${formatDateTime(selectedReport.reviewed_at)}`
                      : "Not reviewed yet"}
                  </div>

                  <button
                    type="button"
                    onClick={handleSaveNotes}
                    disabled={saving || !canManageReports}
                    className="w-full rounded-2xl bg-white px-5 py-3 text-sm font-black text-black transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
                  >
                    {saving ? "Saving..." : canManageReports ? "Save Notes" : "Read-only access"}
                  </button>
                </div>

                {notice ? (
                  <div className="rounded-2xl border border-emerald-300/25 bg-emerald-400/10 px-4 py-3 text-sm font-bold text-emerald-100">
                    {notice}
                  </div>
                ) : null}

                {errorMessage ? (
                  <div className="rounded-2xl border border-red-300/25 bg-red-400/10 px-4 py-3 text-sm font-bold text-red-100">
                    {errorMessage}
                  </div>
                ) : null}
              </>
            )}
          </section>
        </section>

        <style jsx global>{`
          .parapost-admin-moderation-page {
            touch-action: pan-y;
            -webkit-overflow-scrolling: touch;
            scroll-padding-bottom: calc(7rem + env(safe-area-inset-bottom));
          }

          .parapost-admin-moderation-page *,
          .parapost-admin-moderation-page *::before,
          .parapost-admin-moderation-page *::after {
            box-sizing: border-box;
          }

          .parapost-admin-moderation-page input,
          .parapost-admin-moderation-page textarea,
          .parapost-admin-moderation-page select {
            font-size: 16px;
          }

          @media (max-width: 640px) {
            .parapost-admin-moderation-page header {
              border-radius: 24px;
              padding: 16px;
            }

            .parapost-admin-moderation-page aside,
            .parapost-admin-moderation-page section {
              min-width: 0;
            }

            .parapost-admin-moderation-page textarea {
              min-height: 132px;
            }
          }

          @media (max-width: 430px) {
            .parapost-admin-moderation-page {
              padding-left: 10px;
              padding-right: 10px;
            }
          }
        `}</style>
      </div>
    </main>
  );
}

function InfoCard({
  label,
  title,
  meta,
  profileId,
}: {
  label: string;
  title: string;
  meta: string;
  profileId?: string | null;
}) {
  return (
    <div className="rounded-[22px] border border-white/10 bg-black/25 p-4">
      <div className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">{label}</div>
      <div className="mt-3 text-base font-black text-white">{title}</div>
      <div className="mt-1 text-xs text-slate-500">{meta}</div>

      {profileId ? (
        <Link
          href={`/profile/${profileId}`}
          className="mt-4 inline-flex rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-black text-slate-200 no-underline transition hover:bg-white/10"
        >
          View profile
        </Link>
      ) : null}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-[20px] border border-white/10 bg-white/[0.055] p-3 shadow-xl sm:rounded-[22px] sm:p-4">
      <div className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">{label}</div>
      <div className="mt-2 text-2xl font-black tracking-[-0.04em] text-white sm:text-3xl">{value}</div>
    </div>
  );
}
