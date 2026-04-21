"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

type RequestProfile = {
  id: string;
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
  is_online?: boolean | null;
};

type FriendRequestRow = {
  id: string;
  sender_id: string;
  receiver_id: string;
  status: string;
  created_at: string;
};

type RequestCard = FriendRequestRow & {
  senderProfile: RequestProfile | null;
};

export default function FriendRequestsPage() {
  const [currentUserId, setCurrentUserId] = useState("");
  const [requests, setRequests] = useState<RequestCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState("");

  const pendingCount = useMemo(
    () => requests.filter((request) => request.status === "pending").length,
    [requests]
  );

  const showStatus = useCallback((message: string) => {
    setStatusMessage(message);
    window.setTimeout(() => {
      setStatusMessage("");
    }, 2500);
  }, []);

  const fetchRequests = useCallback(async (userId: string) => {
    setLoading(true);

    const { data: requestRows, error: requestError } = await supabase
      .from("friend_requests")
      .select("id, sender_id, receiver_id, status, created_at")
      .eq("receiver_id", userId)
      .eq("status", "pending")
      .order("created_at", { ascending: false });

    if (requestError) {
      console.error("Error fetching friend requests:", requestError.message);
      setRequests([]);
      setLoading(false);
      return;
    }

    const rows = (requestRows || []) as FriendRequestRow[];
    const senderIds = [...new Set(rows.map((row) => row.sender_id).filter(Boolean))];

    let profileMap: Record<string, RequestProfile> = {};

    if (senderIds.length > 0) {
      const { data: profileRows, error: profileError } = await supabase
        .from("profiles")
        .select("id, username, full_name, avatar_url, is_online")
        .in("id", senderIds);

      if (profileError) {
        console.error("Error fetching sender profiles:", profileError.message);
      } else {
        profileMap = Object.fromEntries(
          ((profileRows || []) as RequestProfile[]).map((profile) => [profile.id, profile])
        );
      }
    }

    const mapped = rows.map((row) => ({
      ...row,
      senderProfile: profileMap[row.sender_id] || null,
    }));

    setRequests(mapped);
    setLoading(false);
  }, []);

  useEffect(() => {
    const initialize = async () => {
      const {
        data: { user },
        error,
      } = await supabase.auth.getUser();

      if (error || !user) {
        setCurrentUserId("");
        setRequests([]);
        setLoading(false);
        return;
      }

      setCurrentUserId(user.id);
      await fetchRequests(user.id);
    };

    initialize();
  }, [fetchRequests]);

  useEffect(() => {
    if (!currentUserId) return;

    const channel = supabase
      .channel(`friend-requests-${currentUserId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "friend_requests" },
        async () => {
          await fetchRequests(currentUserId);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUserId, fetchRequests]);

  const handleAccept = async (request: RequestCard) => {
    if (!currentUserId) return;
    setProcessingId(request.id);

    const { error: updateError } = await supabase
      .from("friend_requests")
      .update({ status: "accepted" })
      .eq("id", request.id)
      .eq("receiver_id", currentUserId);

    if (updateError) {
      alert(`Accept error: ${updateError.message}`);
      setProcessingId(null);
      return;
    }

    const { error: notifyError } = await supabase.from("notifications").insert([
      {
        user_id: request.sender_id,
        actor_id: currentUserId,
        type: "friend_accept",
        post_id: null,
        comment_id: null,
        friend_request_id: request.id,
        message: "accepted your friend request.",
        is_read: false,
      },
    ]);

    if (notifyError) {
      console.error("Friend accept notification error:", notifyError.message);
    }

    setRequests((prev) => prev.filter((item) => item.id !== request.id));
    setProcessingId(null);
    showStatus("Friend request accepted.");
  };

  const handleDecline = async (request: RequestCard) => {
    if (!currentUserId) return;
    setProcessingId(request.id);

    const { error } = await supabase
      .from("friend_requests")
      .update({ status: "declined" })
      .eq("id", request.id)
      .eq("receiver_id", currentUserId);

    if (error) {
      alert(`Decline error: ${error.message}`);
      setProcessingId(null);
      return;
    }

    setRequests((prev) => prev.filter((item) => item.id !== request.id));
    setProcessingId(null);
    showStatus("Friend request declined.");
  };

  const getInitial = (name?: string | null, username?: string | null) => {
    const value = name || username || "U";
    return value.charAt(0).toUpperCase();
  };

  const formatRelativeTime = (value?: string | null) => {
    if (!value) return "Just now";

    const timestamp = new Date(value).getTime();
    if (Number.isNaN(timestamp)) return "Just now";

    const seconds = Math.max(1, Math.floor((Date.now() - timestamp) / 1000));
    if (seconds < 60) return `${seconds}s ago`;

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
  };

  return (
    <div className="min-h-screen bg-[#07090d] text-white">
      <div className="mx-auto max-w-5xl px-4 py-6 lg:px-6">
        <div
          style={{
            background: "linear-gradient(180deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.04) 100%)",
            borderRadius: "28px",
            padding: "20px",
            border: "1px solid rgba(255,255,255,0.10)",
            backdropFilter: "blur(10px)",
            boxShadow: "0 10px 30px rgba(0,0,0,0.22)",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "12px",
              flexWrap: "wrap",
              marginBottom: "18px",
            }}
          >
            <div>
              <h1 style={{ margin: 0, fontSize: "28px", fontWeight: 800 }}>Friend Requests</h1>
              <p style={{ margin: "6px 0 0", color: "#9ca3af", fontSize: "14px" }}>
                Review incoming requests and grow your Parapost circle.
              </p>
            </div>

            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
              <Link href="/dashboard" style={secondaryLinkStyle}>
                Back to Dashboard
              </Link>
              <span style={countPillStyle}>
                {pendingCount} pending
              </span>
            </div>
          </div>

          {statusMessage && (
            <div
              style={{
                marginBottom: "16px",
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.10)",
                color: "#f9fafb",
                borderRadius: "18px",
                padding: "12px 14px",
              }}
            >
              {statusMessage}
            </div>
          )}

          {loading ? (
            <p style={{ color: "#9ca3af", margin: 0 }}>Loading friend requests...</p>
          ) : requests.length === 0 ? (
            <div
              style={{
                border: "1px solid rgba(255,255,255,0.10)",
                borderRadius: "24px",
                padding: "24px",
                background: "rgba(255,255,255,0.03)",
              }}
            >
              <h2 style={{ marginTop: 0, marginBottom: "8px", fontSize: "20px" }}>No pending requests</h2>
              <p style={{ margin: 0, color: "#9ca3af", lineHeight: 1.6 }}>
                When someone sends you a friend request, it will show up here.
              </p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              {requests.map((request) => {
                const sender = request.senderProfile;
                const label = sender?.full_name || sender?.username || "Unnamed User";
                const username = sender?.username || "no-username";
                const isBusy = processingId === request.id;

                return (
                  <div
                    key={request.id}
                    style={{
                      background: "linear-gradient(180deg, rgba(255,255,255,0.055) 0%, rgba(255,255,255,0.035) 100%)",
                      border: "1px solid rgba(255,255,255,0.12)",
                      borderRadius: "24px",
                      padding: "16px",
                      boxShadow: "0 10px 26px rgba(0,0,0,0.24)",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: "14px",
                        flexWrap: "wrap",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "12px",
                          minWidth: 0,
                          flex: 1,
                        }}
                      >
                        <Link
                          href={`/profile/${request.sender_id}`}
                          style={{
                            position: "relative",
                            width: "54px",
                            height: "54px",
                            borderRadius: "50%",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            textDecoration: "none",
                            flexShrink: 0,
                          }}
                        >
                          {sender?.avatar_url ? (
                            <img
                              src={sender.avatar_url}
                              alt={label}
                              style={{
                                width: "54px",
                                height: "54px",
                                borderRadius: "50%",
                                objectFit: "cover",
                              }}
                            />
                          ) : (
                            <div
                              style={{
                                width: "54px",
                                height: "54px",
                                borderRadius: "50%",
                                background: "#374151",
                                color: "#f9fafb",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontWeight: 700,
                                fontSize: "18px",
                              }}
                            >
                              {getInitial(sender?.full_name, sender?.username)}
                            </div>
                          )}

                          {sender?.is_online && (
                            <span
                              style={{
                                position: "absolute",
                                bottom: "2px",
                                right: "2px",
                                width: "12px",
                                height: "12px",
                                borderRadius: "50%",
                                background: "#22c55e",
                                border: "2px solid #07090d",
                                boxShadow: "0 0 6px rgba(34,197,94,0.6)",
                              }}
                            />
                          )}
                        </Link>

                        <div style={{ minWidth: 0 }}>
                          <Link
                            href={`/profile/${request.sender_id}`}
                            style={{
                              color: "#f9fafb",
                              textDecoration: "none",
                              fontWeight: 700,
                              fontSize: "16px",
                              display: "inline-block",
                              marginBottom: "4px",
                            }}
                          >
                            {label}
                          </Link>

                          <div style={{ color: "#9ca3af", fontSize: "13px", marginBottom: "6px" }}>
                            @{username} · {formatRelativeTime(request.created_at)}
                          </div>

                          <div style={{ color: "#d1d5db", fontSize: "14px" }}>
                            Wants to connect with you on Parapost.
                          </div>
                        </div>
                      </div>

                      <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                        <button
                          type="button"
                          onClick={() => handleDecline(request)}
                          disabled={isBusy}
                          style={declineButtonStyle}
                        >
                          {isBusy ? "Working..." : "Decline"}
                        </button>

                        <button
                          type="button"
                          onClick={() => handleAccept(request)}
                          disabled={isBusy}
                          style={acceptButtonStyle}
                        >
                          {isBusy ? "Working..." : "Accept"}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const secondaryLinkStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: "42px",
  padding: "0 16px",
  borderRadius: "999px",
  textDecoration: "none",
  color: "#f9fafb",
  background: "rgba(255,255,255,0.05)",
  border: "1px solid rgba(255,255,255,0.10)",
  fontWeight: 600,
};

const countPillStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: "42px",
  padding: "0 14px",
  borderRadius: "999px",
  color: "#f9fafb",
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.10)",
  fontWeight: 700,
  fontSize: "14px",
};

const declineButtonStyle: React.CSSProperties = {
  minHeight: "44px",
  borderRadius: "999px",
  padding: "0 18px",
  border: "1px solid rgba(255,255,255,0.12)",
  background: "rgba(255,255,255,0.04)",
  color: "#f9fafb",
  fontWeight: 700,
  cursor: "pointer",
};

const acceptButtonStyle: React.CSSProperties = {
  minHeight: "44px",
  borderRadius: "999px",
  padding: "0 18px",
  border: "1px solid rgba(255,255,255,0.12)",
  background: "#ffffff",
  color: "#000000",
  fontWeight: 700,
  cursor: "pointer",
};
