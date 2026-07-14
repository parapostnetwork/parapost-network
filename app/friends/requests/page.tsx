"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { supabase } from "@/lib/supabase";
import { acceptFriendRequest, declineFriendRequest } from "@/lib/friends";

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
  const [relativeTimeNow, setRelativeTimeNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => {
      setRelativeTimeNow(Date.now());
    }, 60_000);

    return () => window.clearInterval(timer);
  }, []);

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

    try {
      await acceptFriendRequest(supabase, currentUserId, request.sender_id);

      setRequests((prev) => prev.filter((item) => item.id !== request.id));
      showStatus("Friend request accepted.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to accept friend request.";
      alert(`Accept error: ${message}`);
    } finally {
      setProcessingId(null);
    }
  };

  const handleDecline = async (request: RequestCard) => {
    if (!currentUserId) return;
    setProcessingId(request.id);

    try {
      await declineFriendRequest(supabase, currentUserId, request.sender_id);

      setRequests((prev) => prev.filter((item) => item.id !== request.id));
      showStatus("Friend request declined.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to decline friend request.";
      alert(`Decline error: ${message}`);
    } finally {
      setProcessingId(null);
    }
  };

  const getInitial = (name?: string | null, username?: string | null) => {
    const value = name || username || "U";
    return value.charAt(0).toUpperCase();
  };

  const formatRelativeTime = (value?: string | null) => {
    if (!value) return "Just now";

    const timestamp = new Date(value).getTime();
    if (Number.isNaN(timestamp)) return "Just now";

    const seconds = Math.max(1, Math.floor((relativeTimeNow - timestamp) / 1000));
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
    <div className="friend-requests-page min-h-screen text-white">
      <style jsx global>{`
        .friend-requests-page {
          min-height: 100svh;
          min-height: 100dvh;
          overflow-x: hidden;
          -webkit-overflow-scrolling: touch;
          background:
            radial-gradient(circle at 18% 8%, rgba(124, 58, 237, 0.34), transparent 34%),
            radial-gradient(circle at 82% 0%, rgba(168, 85, 247, 0.22), transparent 30%),
            radial-gradient(circle at 50% 100%, rgba(79, 70, 229, 0.18), transparent 42%),
            linear-gradient(180deg, #090611 0%, #05040a 48%, #030307 100%);
          color: #f8f5ff;
        }

        .friend-requests-page::before {
          content: "";
          position: fixed;
          inset: 0;
          pointer-events: none;
          background:
            linear-gradient(rgba(255, 255, 255, 0.025) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255, 255, 255, 0.018) 1px, transparent 1px);
          background-size: 44px 44px;
          mask-image: linear-gradient(to bottom, rgba(0,0,0,0.75), transparent 72%);
          opacity: 0.45;
        }

        .friend-requests-inner {
          position: relative;
          z-index: 1;
        }

        .friend-requests-card {
          position: relative;
          overflow: hidden;
        }

        .friend-requests-card::before {
          content: "";
          position: absolute;
          inset: 0;
          pointer-events: none;
          background:
            radial-gradient(circle at 12% 0%, rgba(168, 85, 247, 0.20), transparent 36%),
            radial-gradient(circle at 100% 18%, rgba(124, 58, 237, 0.15), transparent 35%);
        }

        .friend-requests-card > * {
          position: relative;
          z-index: 1;
        }

        .friend-requests-inner {
          padding-bottom: calc(96px + env(safe-area-inset-bottom));
        }

        .friend-requests-card,
        .friend-request-card {
          box-sizing: border-box;
        }

        .friend-request-actions button,
        .friend-request-top-actions a,
        .friend-request-top-actions span {
          white-space: nowrap;
        }

        @media (max-width: 640px) {
          .friend-requests-inner {
            padding: 14px 10px calc(104px + env(safe-area-inset-bottom)) !important;
          }

          .friend-requests-card {
            border-radius: 24px !important;
            padding: 15px !important;
          }

          .friend-requests-header {
            align-items: stretch !important;
          }

          .friend-requests-header h1 {
            font-size: 25px !important;
            letter-spacing: -0.04em !important;
          }

          .friend-requests-header p {
            font-size: 13px !important;
            line-height: 1.5 !important;
          }

          .friend-request-top-actions {
            width: 100% !important;
            display: grid !important;
            grid-template-columns: 1fr auto !important;
            gap: 8px !important;
          }

          .friend-request-top-actions a {
            width: 100% !important;
            min-height: 40px !important;
            padding: 0 12px !important;
            font-size: 13px !important;
          }

          .friend-request-top-actions span {
            min-height: 40px !important;
            padding: 0 12px !important;
            font-size: 13px !important;
          }

          .friend-requests-empty {
            border-radius: 20px !important;
            padding: 20px 16px !important;
          }

          .friend-requests-list {
            gap: 12px !important;
          }

          .friend-request-card {
            border-radius: 22px !important;
            padding: 14px !important;
          }

          .friend-request-row {
            align-items: flex-start !important;
          }

          .friend-request-body {
            width: 100% !important;
            align-items: flex-start !important;
          }

          .friend-request-copy {
            flex: 1 1 auto !important;
            min-width: 0 !important;
          }

          .friend-request-actions {
            width: 100% !important;
            display: grid !important;
            grid-template-columns: 1fr 1fr !important;
            gap: 9px !important;
          }

          .friend-request-actions button {
            width: 100% !important;
            min-height: 44px !important;
            padding: 0 12px !important;
            font-size: 14px !important;
          }
        }

        @media (max-width: 380px) {
          .friend-requests-inner {
            padding-left: 8px !important;
            padding-right: 8px !important;
          }

          .friend-requests-card {
            padding: 12px !important;
          }

          .friend-request-top-actions {
            grid-template-columns: 1fr !important;
          }

          .friend-request-top-actions span {
            width: 100% !important;
          }

          .friend-request-actions {
            grid-template-columns: 1fr !important;
          }
        }

        @media (min-width: 641px) and (max-width: 1024px) {
          .friend-requests-inner {
            max-width: 860px !important;
            padding: 22px 18px calc(110px + env(safe-area-inset-bottom)) !important;
          }

          .friend-requests-card {
            padding: 20px !important;
          }
        }

        @media (min-width: 1025px) and (max-width: 1366px) {
          .friend-requests-inner {
            max-width: 980px !important;
          }
        }

        @media (max-height: 520px) and (orientation: landscape) {
          .friend-requests-inner {
            padding-top: 10px !important;
            padding-bottom: 84px !important;
          }

          .friend-requests-card {
            border-radius: 22px !important;
          }
        }
      `}</style>
      <div className="friend-requests-inner mx-auto max-w-5xl px-4 py-6 lg:px-6">
        <div
          className="friend-requests-card"
          style={{
            background:
              "linear-gradient(180deg, rgba(26, 18, 46, 0.86) 0%, rgba(10, 7, 19, 0.92) 100%)",
            borderRadius: "30px",
            padding: "22px",
            border: "1px solid rgba(168, 85, 247, 0.24)",
            backdropFilter: "blur(18px)",
            boxShadow:
              "0 28px 70px rgba(0,0,0,0.45), 0 0 42px rgba(124,58,237,0.16), inset 0 1px 0 rgba(255,255,255,0.08)",
          }}
        >
          <div
            className="friend-requests-header"
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
              <h1
                style={{
                  margin: 0,
                  fontSize: "30px",
                  fontWeight: 900,
                  letterSpacing: "-0.04em",
                  textShadow: "0 0 24px rgba(168,85,247,0.22)",
                }}
              >
                Friend Requests
              </h1>
              <p style={{ margin: "7px 0 0", color: "#c8bfdc", fontSize: "14px" }}>
                Review incoming requests and grow your Parapost circle.
              </p>
            </div>

            <div className="friend-request-top-actions" style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
              <Link href="/dashboard?menu=friends" style={secondaryLinkStyle}>
                Back to Friends
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
                background: "linear-gradient(135deg, rgba(124,58,237,0.18), rgba(168,85,247,0.10))",
                border: "1px solid rgba(168,85,247,0.25)",
                color: "#f8f5ff",
                borderRadius: "18px",
                padding: "12px 14px",
              }}
            >
              {statusMessage}
            </div>
          )}

          {loading ? (
            <p style={{ color: "#c8bfdc", margin: 0 }}>Loading friend requests...</p>
          ) : requests.length === 0 ? (
            <div
              className="friend-requests-empty"
              style={{
                border: "1px solid rgba(168,85,247,0.20)",
                borderRadius: "24px",
                padding: "24px",
                background:
                  "linear-gradient(180deg, rgba(124,58,237,0.10) 0%, rgba(255,255,255,0.035) 100%)",
                boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06)",
              }}
            >
              <h2 style={{ marginTop: 0, marginBottom: "8px", fontSize: "20px", color: "#f8f5ff" }}>
                No pending requests
              </h2>
              <p style={{ margin: 0, color: "#c8bfdc", lineHeight: 1.6 }}>
                When someone sends you a friend request, it will show up here.
              </p>
            </div>
          ) : (
            <div className="friend-requests-list" style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              {requests.map((request) => {
                const sender = request.senderProfile;
                const label = sender?.full_name || sender?.username || "Unnamed User";
                const username = sender?.username || "no-username";
                const isBusy = processingId === request.id;

                return (
                  <div
                    key={request.id}
                    className="friend-request-card"
                    style={{
                      background:
                        "linear-gradient(180deg, rgba(30, 20, 54, 0.82) 0%, rgba(12, 8, 24, 0.88) 100%)",
                      border: "1px solid rgba(168,85,247,0.22)",
                      borderRadius: "24px",
                      padding: "16px",
                      boxShadow: "0 18px 42px rgba(0,0,0,0.36), 0 0 26px rgba(124,58,237,0.10)",
                    }}
                  >
                    <div
                      className="friend-request-row"
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: "14px",
                        flexWrap: "wrap",
                      }}
                    >
                      <div
                        className="friend-request-body"
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
                            <Image
                              src={sender.avatar_url}
                              alt={label}
                              width={54}
                              height={54}
                              sizes="54px"
                              unoptimized
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
                                background: "linear-gradient(135deg, #7c3aed, #a855f7)",
                                color: "#ffffff",
                                boxShadow: "0 0 22px rgba(124,58,237,0.34)",
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
                                border: "2px solid #090611",
                                boxShadow: "0 0 6px rgba(34,197,94,0.6)",
                              }}
                            />
                          )}
                        </Link>

                        <div className="friend-request-copy" style={{ minWidth: 0 }}>
                          <Link
                            href={`/profile/${request.sender_id}`}
                            style={{
                              color: "#f8f5ff",
                              textDecoration: "none",
                              fontWeight: 700,
                              fontSize: "16px",
                              display: "inline-block",
                              marginBottom: "4px",
                            }}
                          >
                            {label}
                          </Link>

                          <div style={{ color: "#b8aecb", fontSize: "13px", marginBottom: "6px" }}>
                            @{username} · {formatRelativeTime(request.created_at)}
                          </div>

                          <div style={{ color: "#ded7ea", fontSize: "14px" }}>
                            Wants to connect with you on Parapost.
                          </div>
                        </div>
                      </div>

                      <div className="friend-request-actions" style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
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
  color: "#f8f5ff",
  background: "linear-gradient(135deg, rgba(124,58,237,0.24), rgba(168,85,247,0.12))",
  border: "1px solid rgba(168,85,247,0.28)",
  boxShadow: "0 0 20px rgba(124,58,237,0.14), inset 0 1px 0 rgba(255,255,255,0.07)",
  fontWeight: 800,
};

const countPillStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: "42px",
  padding: "0 14px",
  borderRadius: "999px",
  color: "#f8f5ff",
  background: "rgba(124,58,237,0.16)",
  border: "1px solid rgba(168,85,247,0.30)",
  boxShadow: "0 0 20px rgba(124,58,237,0.12)",
  fontWeight: 800,
  fontSize: "14px",
};

const declineButtonStyle: React.CSSProperties = {
  minHeight: "44px",
  borderRadius: "999px",
  padding: "0 18px",
  border: "1px solid rgba(255,255,255,0.12)",
  background: "rgba(255,255,255,0.055)",
  color: "#f8f5ff",
  fontWeight: 800,
  cursor: "pointer",
};

const acceptButtonStyle: React.CSSProperties = {
  minHeight: "44px",
  borderRadius: "999px",
  padding: "0 18px",
  border: "1px solid rgba(196,181,253,0.42)",
  background: "linear-gradient(135deg, #8b5cf6 0%, #7c3aed 48%, #6d28d9 100%)",
  color: "#ffffff",
  boxShadow: "0 12px 28px rgba(124,58,237,0.34), inset 0 1px 0 rgba(255,255,255,0.22)",
  fontWeight: 900,
  cursor: "pointer",
};
