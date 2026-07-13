"use client";

import { ChangeEvent, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

type AdminRole = "owner" | "admin" | "support" | "moderator";

const ALLOWED_SUPPORT_ROLES: AdminRole[] = ["owner", "admin", "support", "moderator"];

type SupportStatus = "open" | "in_review" | "waiting" | "resolved" | "closed";
type SupportPriority = "low" | "normal" | "high" | "urgent";
type SupportTopic =
  | "account"
  | "privacy_safety"
  | "report_problem"
  | "data_delete_account"
  | "payments"
  | "bug_report"
  | "legal_policy"
  | "other";

type SupportMessage = {
  id: string;
  user_id: string | null;
  user_email: string | null;
  user_name: string | null;
  topic: SupportTopic | string;
  message: string;
  status: SupportStatus | string;
  priority: SupportPriority | string;
  source: string | null;
  page_url: string | null;
  attachment_url: string | null;
  admin_notes: string | null;
  handled_by: string | null;
  resolved_at: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

type AdminUser = {
  user_id: string;
  role: AdminRole | string;
};

const STATUS_OPTIONS: Array<{ value: SupportStatus; label: string }> = [
  { value: "open", label: "Open" },
  { value: "in_review", label: "In review" },
  { value: "waiting", label: "Waiting" },
  { value: "resolved", label: "Resolved" },
  { value: "closed", label: "Closed" },
];

const PRIORITY_OPTIONS: Array<{ value: SupportPriority; label: string }> = [
  { value: "low", label: "Low" },
  { value: "normal", label: "Normal" },
  { value: "high", label: "High" },
  { value: "urgent", label: "Urgent" },
];

const TOPIC_LABELS: Record<string, string> = {
  account: "Account",
  privacy_safety: "Privacy & Safety",
  report_problem: "Report a Problem",
  data_delete_account: "Data / Delete Account",
  payments: "Payments",
  bug_report: "Bug Report",
  legal_policy: "Legal / Policy",
  other: "Other",
};

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

  const years = Math.floor(days / 365);
  return `${years}y ago`;
}

function getTopicLabel(topic: string) {
  return TOPIC_LABELS[topic] || "Other";
}

function getPriorityClass(priority: string) {
  if (priority === "urgent") return "border-red-300/30 bg-red-400/12 text-red-100";
  if (priority === "high") return "border-amber-300/30 bg-amber-400/12 text-amber-100";
  if (priority === "low") return "border-slate-300/20 bg-white/5 text-slate-300";
  return "border-purple-300/25 bg-purple-400/10 text-purple-100";
}

function getStatusClass(status: string) {
  if (status === "resolved") return "border-emerald-300/30 bg-emerald-400/12 text-emerald-100";
  if (status === "closed") return "border-slate-300/20 bg-white/5 text-slate-300";
  if (status === "waiting") return "border-blue-300/25 bg-blue-400/10 text-blue-100";
  if (status === "in_review") return "border-amber-300/25 bg-amber-400/10 text-amber-100";
  return "border-fuchsia-300/25 bg-fuchsia-400/10 text-fuchsia-100";
}

export default function AdminSupportInboxPage() {
  const [currentUserId, setCurrentUserId] = useState("");
  const [adminRole, setAdminRole] = useState<string>("");
  const [checkingAccess, setCheckingAccess] = useState(true);
  const [accessError, setAccessError] = useState("");
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [selectedId, setSelectedId] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<SupportStatus | "all">("open");
  const [topicFilter, setTopicFilter] = useState<SupportTopic | "all">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [adminNotesDraft, setAdminNotesDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const isAdmin = Boolean(
    currentUserId &&
      ALLOWED_SUPPORT_ROLES.includes(adminRole as AdminRole)
  );

  const selectedMessage = useMemo(() => {
    return messages.find((message) => message.id === selectedId) || messages[0] || null;
  }, [messages, selectedId]);

  const filteredMessages = useMemo(() => {
    const cleanSearch = searchQuery.trim().toLowerCase();

    return messages.filter((message) => {
      const statusMatch = statusFilter === "all" || message.status === statusFilter;
      const topicMatch = topicFilter === "all" || message.topic === topicFilter;

      if (!statusMatch || !topicMatch) return false;

      if (!cleanSearch) return true;

      const combined = [
        message.user_name,
        message.user_email,
        getTopicLabel(message.topic),
        message.message,
        message.status,
        message.priority,
        message.admin_notes,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return combined.includes(cleanSearch);
    });
  }, [messages, searchQuery, statusFilter, topicFilter]);

  const stats = useMemo(() => {
    return {
      total: messages.length,
      open: messages.filter((message) => message.status === "open").length,
      inReview: messages.filter((message) => message.status === "in_review").length,
      urgent: messages.filter((message) => message.priority === "urgent").length,
      resolved: messages.filter((message) => message.status === "resolved").length,
    };
  }, [messages]);

  const fetchMessages = useCallback(async () => {
    setLoadingMessages(true);
    setErrorMessage("");

    const { data, error } = await supabase
      .from("support_messages")
      .select(
        "id, user_id, user_email, user_name, topic, message, status, priority, source, page_url, attachment_url, admin_notes, handled_by, resolved_at, metadata, created_at, updated_at"
      )
      .order("created_at", { ascending: false })
      .limit(150);

    if (error) {
      setErrorMessage(`Could not load support messages: ${error.message}`);
      setMessages([]);
      setLoadingMessages(false);
      return;
    }

    const nextMessages = (data || []) as SupportMessage[];
    setMessages(nextMessages);

    if (nextMessages.length > 0) {
      setSelectedId((prev) => {
        if (prev && nextMessages.some((message) => message.id === prev)) return prev;
        return nextMessages[0].id;
      });
    } else {
      setSelectedId("");
    }

    setLoadingMessages(false);
  }, []);

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
        setAccessError("Please sign in before opening the Parapost Network support inbox.");
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
        setAccessError(`Could not verify admin access: ${adminError.message}`);
        setCheckingAccess(false);
        return;
      }

      const role = (adminRow as AdminUser | null)?.role || "";

      if (!ALLOWED_SUPPORT_ROLES.includes(role as AdminRole)) {
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
    if (!isAdmin) return;

    const timeoutId = window.setTimeout(() => {
      void fetchMessages();
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [fetchMessages, isAdmin]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setAdminNotesDraft(selectedMessage?.admin_notes || "");
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [selectedMessage?.admin_notes, selectedMessage?.id]);

  const handleSelectMessage = (messageId: string) => {
    setSelectedId(messageId);
    setNotice("");
    setErrorMessage("");
  };

  const handleUpdateMessage = async (updates: Partial<SupportMessage>) => {
    if (!selectedMessage || !currentUserId) return;

    setSaving(true);
    setNotice("");
    setErrorMessage("");

    const nextStatus = updates.status || selectedMessage.status;
    const shouldResolve = nextStatus === "resolved" || nextStatus === "closed";

    const { error } = await supabase
      .from("support_messages")
      .update({
        ...updates,
        handled_by: currentUserId,
        resolved_at: shouldResolve ? new Date().toISOString() : null,
      })
      .eq("id", selectedMessage.id);

    setSaving(false);

    if (error) {
      setErrorMessage(`Could not update support message: ${error.message}`);
      return;
    }

    setNotice("Support message updated.");
    await fetchMessages();
  };

  const handleStatusChange = async (event: ChangeEvent<HTMLSelectElement>) => {
    await handleUpdateMessage({ status: event.target.value });
  };

  const handlePriorityChange = async (event: ChangeEvent<HTMLSelectElement>) => {
    await handleUpdateMessage({ priority: event.target.value });
  };

  const handleSaveNotes = async () => {
    await handleUpdateMessage({ admin_notes: adminNotesDraft.trim() || null });
  };

  const handleDeleteMessage = async () => {
    if (!selectedMessage) return;

    const confirmDelete = window.confirm(
      "Delete this support message? This removes it from the admin inbox and cannot be undone."
    );

    if (!confirmDelete) return;

    setSaving(true);
    setNotice("");
    setErrorMessage("");

    const { error } = await supabase
      .from("support_messages")
      .delete()
      .eq("id", selectedMessage.id);

    setSaving(false);

    if (error) {
      setErrorMessage(`Could not delete support message: ${error.message}`);
      return;
    }

    setNotice("Support message deleted.");
    setSelectedId("");
    await fetchMessages();
  };

  if (checkingAccess) {
    return (
      <main className="h-dvh min-h-dvh overflow-y-auto overflow-x-hidden overscroll-y-contain bg-[#05050b] px-4 py-6 pb-[calc(7rem+env(safe-area-inset-bottom))] text-white sm:px-6 lg:px-8">
        <div className="mx-auto max-w-5xl rounded-[28px] border border-white/10 bg-white/[0.055] p-6">
          <p className="text-sm font-bold text-slate-300">Checking support inbox access...</p>
        </div>
      </main>
    );
  }

  if (!isAdmin) {
    return (
      <main className="h-dvh min-h-dvh overflow-y-auto overflow-x-hidden overscroll-y-contain bg-[#05050b] px-4 py-6 pb-[calc(7rem+env(safe-area-inset-bottom))] text-white sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl rounded-[28px] border border-white/10 bg-white/[0.055] p-6 shadow-2xl">
          <Link href="/settings" className="text-sm font-bold text-purple-200 no-underline hover:text-white">
            ← Back to Settings
          </Link>

          <h1 className="mt-6 text-3xl font-black tracking-[-0.04em]">Support Inbox</h1>
          <p className="mt-3 text-sm leading-7 text-slate-300">{accessError}</p>

          <div className="mt-5 rounded-2xl border border-amber-300/25 bg-amber-400/10 p-4 text-sm leading-6 text-amber-100">
            To use this inbox, add your authenticated user ID to the <strong>admin_users</strong> table
            with the role <strong>owner</strong>, <strong>admin</strong>, <strong>support</strong>, or{" "}
            <strong>moderator</strong>.
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="parapost-admin-support-page h-dvh min-h-dvh overflow-y-auto overflow-x-hidden overscroll-y-contain bg-[#05050b] px-4 py-6 pb-[calc(7rem+env(safe-area-inset-bottom))] text-white sm:px-6 lg:px-8">
      <div className="pointer-events-none fixed -right-32 -top-32 h-96 w-96 rounded-full bg-purple-600/20 blur-3xl" />
      <div className="pointer-events-none fixed -bottom-32 -left-32 h-96 w-96 rounded-full bg-blue-500/10 blur-3xl" />

      <div className="relative z-10 mx-auto w-full max-w-7xl">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <Link href="/settings" className="text-sm font-bold text-purple-200 no-underline hover:text-white">
              ← Back to Settings
            </Link>

            <Link href="/admin/moderation" className="text-sm font-bold text-slate-300 no-underline hover:text-white">
              Moderation Dashboard
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
            Support Inbox
          </h1>
          <p className="mt-5 max-w-3xl text-sm leading-7 text-slate-300 sm:text-base">
            Review Contact Support messages, data/account deletion requests, bug reports, privacy/safety issues,
            and payment questions sent from the Parapost Network Settings page.
          </p>
        </header>

        <section className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
          <StatCard label="Total" value={stats.total} />
          <StatCard label="Open" value={stats.open} />
          <StatCard label="In review" value={stats.inReview} />
          <StatCard label="Urgent" value={stats.urgent} />
          <StatCard label="Resolved" value={stats.resolved} />
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
                  placeholder="Search messages..."
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
                    onChange={(event) => setStatusFilter(event.target.value as SupportStatus | "all")}
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
                    Topic
                  </span>
                  <select
                    value={topicFilter}
                    onChange={(event) => setTopicFilter(event.target.value as SupportTopic | "all")}
                    className="w-full rounded-2xl border border-white/10 bg-black/35 px-3 py-3 text-sm text-white outline-none focus:border-purple-300/50"
                  >
                    <option value="all">All</option>
                    {Object.entries(TOPIC_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <button
                type="button"
                onClick={() => fetchMessages()}
                disabled={loadingMessages}
                className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-black text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loadingMessages ? "Refreshing..." : "Refresh Inbox"}
              </button>
            </div>

            <div className="max-h-[42dvh] space-y-3 overflow-y-auto pr-1 lg:max-h-[680px]">
              {loadingMessages ? (
                <div className="rounded-2xl border border-white/10 bg-black/25 p-4 text-sm text-slate-300">
                  Loading support messages...
                </div>
              ) : filteredMessages.length === 0 ? (
                <div className="rounded-2xl border border-white/10 bg-black/25 p-4 text-sm leading-6 text-slate-300">
                  No support messages match the current filters.
                </div>
              ) : (
                filteredMessages.map((message) => (
                  <button
                    key={message.id}
                    type="button"
                    onClick={() => handleSelectMessage(message.id)}
                    className={`block w-full rounded-2xl border p-4 text-left transition ${
                      selectedMessage?.id === message.id
                        ? "border-purple-300/40 bg-purple-500/15"
                        : "border-white/10 bg-black/25 hover:bg-white/[0.06]"
                    }`}
                  >
                    <div className="mb-3 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-black text-white">
                          {message.user_name || "Unknown user"}
                        </div>
                        <div className="truncate text-xs text-slate-500">
                          {message.user_email || "No email"}
                        </div>
                      </div>

                      <span className="shrink-0 text-xs font-bold text-slate-500">
                        {formatRelativeTime(message.created_at)}
                      </span>
                    </div>

                    <div className="mb-3 flex flex-wrap gap-2">
                      <span className={`rounded-full border px-2.5 py-1 text-[11px] font-black ${getStatusClass(message.status)}`}>
                        {STATUS_OPTIONS.find((status) => status.value === message.status)?.label || message.status}
                      </span>
                      <span className={`rounded-full border px-2.5 py-1 text-[11px] font-black ${getPriorityClass(message.priority)}`}>
                        {message.priority}
                      </span>
                    </div>

                    <div className="text-xs font-black uppercase tracking-[0.12em] text-purple-200">
                      {getTopicLabel(message.topic)}
                    </div>
                    <p className="mt-2 line-clamp-3 text-sm leading-6 text-slate-300">{message.message}</p>
                  </button>
                ))
              )}
            </div>
          </aside>

          <section className="min-w-0 rounded-[24px] border border-white/10 bg-white/[0.055] p-4 shadow-2xl sm:rounded-[28px] sm:p-6">
            {!selectedMessage ? (
              <div className="rounded-2xl border border-white/10 bg-black/25 p-5 text-sm text-slate-300">
                Select a support message to view details.
              </div>
            ) : (
              <>
                <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="mb-2 text-xs font-black uppercase tracking-[0.18em] text-purple-200">
                      {getTopicLabel(selectedMessage.topic)}
                    </p>
                    <h2 className="break-words text-2xl font-black tracking-[-0.035em] sm:text-3xl">
                      {selectedMessage.user_name || "Unknown user"}
                    </h2>
                    <p className="mt-2 text-sm text-slate-400">
                      {selectedMessage.user_email || "No email"} · Sent {formatDateTime(selectedMessage.created_at)}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <span className={`rounded-full border px-3 py-2 text-xs font-black ${getStatusClass(selectedMessage.status)}`}>
                      {STATUS_OPTIONS.find((status) => status.value === selectedMessage.status)?.label ||
                        selectedMessage.status}
                    </span>
                    <span className={`rounded-full border px-3 py-2 text-xs font-black ${getPriorityClass(selectedMessage.priority)}`}>
                      {selectedMessage.priority}
                    </span>
                  </div>
                </div>

                <div className="mb-5 rounded-[24px] border border-white/10 bg-black/25 p-5">
                  <div className="mb-2 text-xs font-black uppercase tracking-[0.16em] text-slate-500">
                    Message
                  </div>
                  <p className="whitespace-pre-wrap text-sm leading-7 text-slate-100">{selectedMessage.message}</p>
                </div>

                <div className="mb-5 grid gap-4 md:grid-cols-2">
                  <label className="block">
                    <span className="mb-2 block text-sm font-black text-slate-200">Status</span>
                    <select
                      value={selectedMessage.status}
                      onChange={handleStatusChange}
                      disabled={saving}
                      className="w-full rounded-2xl border border-white/10 bg-black/35 px-4 py-3 text-sm text-white outline-none focus:border-purple-300/50 disabled:opacity-60"
                    >
                      {STATUS_OPTIONS.map((status) => (
                        <option key={status.value} value={status.value}>
                          {status.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="block">
                    <span className="mb-2 block text-sm font-black text-slate-200">Priority</span>
                    <select
                      value={selectedMessage.priority}
                      onChange={handlePriorityChange}
                      disabled={saving}
                      className="w-full rounded-2xl border border-white/10 bg-black/35 px-4 py-3 text-sm text-white outline-none focus:border-purple-300/50 disabled:opacity-60"
                    >
                      {PRIORITY_OPTIONS.map((priority) => (
                        <option key={priority.value} value={priority.value}>
                          {priority.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <label className="mb-5 block">
                  <span className="mb-2 block text-sm font-black text-slate-200">Admin notes</span>
                  <textarea
                    value={adminNotesDraft}
                    onChange={(event) => setAdminNotesDraft(event.target.value)}
                    placeholder="Add private admin/support notes..."
                    rows={6}
                    disabled={saving}
                    className="min-h-[150px] w-full resize-y rounded-2xl border border-white/10 bg-black/35 px-4 py-3 text-sm leading-6 text-white outline-none placeholder:text-white/35 focus:border-purple-300/50 disabled:opacity-60"
                  />
                </label>

                <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                  <div className="text-xs leading-6 text-slate-500">
                    Updated {formatDateTime(selectedMessage.updated_at)}
                    {selectedMessage.resolved_at ? ` · Resolved ${formatDateTime(selectedMessage.resolved_at)}` : ""}
                  </div>

                  <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
                    <button
                      type="button"
                      onClick={handleDeleteMessage}
                      disabled={saving}
                      className="w-full rounded-2xl border border-red-300/25 bg-red-400/10 px-5 py-3 text-sm font-black text-red-100 transition hover:bg-red-400/15 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
                    >
                      Delete Message
                    </button>

                    <button
                      type="button"
                      onClick={handleSaveNotes}
                      disabled={saving}
                      className="w-full rounded-2xl bg-white px-5 py-3 text-sm font-black text-black transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
                    >
                      {saving ? "Saving..." : "Save Notes"}
                    </button>
                  </div>
                </div>

                {selectedMessage.page_url ? (
                  <div className="mb-5 rounded-2xl border border-white/10 bg-black/25 p-4 text-sm leading-6 text-slate-300">
                    <strong className="text-slate-100">Submitted from:</strong>{" "}
                    <span className="break-all">{selectedMessage.page_url}</span>
                  </div>
                ) : null}

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
          .parapost-admin-support-page {
            touch-action: pan-y;
            -webkit-overflow-scrolling: touch;
            scroll-padding-bottom: calc(7rem + env(safe-area-inset-bottom));
          }

          .parapost-admin-support-page *,
          .parapost-admin-support-page *::before,
          .parapost-admin-support-page *::after {
            box-sizing: border-box;
          }

          .parapost-admin-support-page input,
          .parapost-admin-support-page textarea,
          .parapost-admin-support-page select {
            font-size: 16px;
          }

          @media (max-width: 640px) {
            .parapost-admin-support-page header {
              border-radius: 24px;
              padding: 16px;
            }

            .parapost-admin-support-page aside,
            .parapost-admin-support-page section {
              min-width: 0;
            }

            .parapost-admin-support-page textarea {
              min-height: 132px;
            }
          }

          @media (max-width: 430px) {
            .parapost-admin-support-page {
              padding-left: 10px;
              padding-right: 10px;
            }
          }
        `}</style>

      </div>
    </main>
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
