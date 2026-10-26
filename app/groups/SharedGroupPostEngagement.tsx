"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { groupsFetch, groupAction } from "@/lib/groups/client";
import { supabase } from "@/lib/supabase";
import SharedGroupPostActions from "./SharedGroupPostActions";

type Comment = {
  id: string;
  author_id: string;
  parent_id: string | null;
  content: string;
  created_at: string;
  liked: boolean;
  like_count: number;
};

type Stats = {
  liked: boolean;
  like_count: number;
  comment_count: number;
  comments_limited: boolean;
  comments: Comment[];
};

type Profile = {
  id: string;
  full_name: string | null;
  username: string | null;
};

export default function SharedGroupPostEngagement({
  shareId, groupId, postId
}: {
  shareId: string;
  groupId: string;
  postId: string;
}) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [viewerId, setViewerId] = useState("");
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [sharing, setSharing] = useState(false);
  const [caption, setCaption] = useState("");

  const reload = useCallback(async () => {
    const response = await groupsFetch(
      `/api/groups/sharing/interactions?share=${encodeURIComponent(shareId)}`
    );
    const result = await response.json() as Stats;
    if (!Array.isArray(result.comments) ||
        typeof result.like_count !== "number" ||
        typeof result.comment_count !== "number") {
      throw new Error("Invalid reactions");
    }
    setStats(result);
  }, [shareId]);

  useEffect(() => {
    let active = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (active) setViewerId(data.session?.user.id ?? "");
    });
    void reload().catch(() => {
      if (active) setError("Reactions are temporarily unavailable.");
    });
    return () => { active = false; };
  }, [reload]);

  useEffect(() => {
    const ids = [...new Set(stats?.comments.map(c => c.author_id) ?? [])];
    if (!ids.length) return;
    let active = true;
    void supabase.from("profiles")
      .select("id,full_name,username")
      .in("id", ids)
      .then(({ data, error }) => {
        if (active && !error) {
          setProfiles(Object.fromEntries(
            (data ?? []).map(p => [p.id, p])
          ));
        }
      });
    return () => { active = false; };
  }, [stats]);

  async function interact(
    action: string,
    content?: string,
    parentId?: string
  ): Promise<boolean> {
    if (busy) return false;
    setBusy(true);
    setError("");
    try {
      await groupsFetch("/api/groups/sharing/interactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shareId,
          action,
          content: content ?? null,
          parentId: parentId ?? null
        })
      });
      await reload();
      return true;
    } catch {
      setError("Unable to complete this action. Please try again.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function submitComment(event: FormEvent) {
    event.preventDefault();
    const content = draft.trim();
    if (!content || content.length > 1200) return;
    if (await interact(replyTo ? "reply" : "comment",
      content, replyTo ?? undefined)) {
      setDraft("");
      setReplyTo(null);
    }
  }

  async function submitShare(event: FormEvent) {
    event.preventDefault();
    if (busy || caption.length > 1000) return;
    setBusy(true);
    setError("");
    try {
      await groupAction("share_post", groupId, {
        post_id: postId,
        caption: caption.trim() || null
      });
      setSharing(false);
      setCaption("");
      setNotice("Shared to Dashboard and your Profile.");
      window.dispatchEvent(new Event("parapost-group-shared"));
    } catch {
      setError("Unable to share. Check your Group membership and access.");
    } finally {
      setBusy(false);
    }
  }

  if (!stats) {
    return error
      ? <p role="status" style={{ fontSize: 13, opacity: 0.8 }}>{error}</p>
      : null;
  }

  return (
    <section aria-label="Shared Group post interactions">
      <div style={{
        display: "flex", justifyContent: "space-between",
        padding: "12px 4px 0", fontSize: 13, opacity: 0.8
      }}>
        <span>{stats.like_count} Likes</span>
        <button type="button" onClick={() => setCommentsOpen(v => !v)}
          style={{ background: "none", border: 0, color: "inherit" }}>
          {stats.comment_count} Comments
        </button>
      </div>

      <SharedGroupPostActions
        liked={stats.liked}
        commentsOpen={commentsOpen}
        busy={busy}
        onLike={() => {
          void interact(stats.liked ? "unlike" : "like");
        }}
        onComment={() => setCommentsOpen(v => !v)}
        onShare={() => setSharing(v => !v)}
      />

      {notice && <p role="status">{notice}</p>}
      {error && <p role="alert">{error}</p>}

      {sharing && (
        <form onSubmit={submitShare} style={{ padding: 12 }}>
          <label>
            Add a caption (optional)
            <textarea value={caption} maxLength={1000}
              onChange={e => setCaption(e.target.value)}
              rows={2} style={{ width: "100%", fontSize: 16 }} />
          </label>
          <button type="submit" disabled={busy}>Share post</button>
          <button type="button" onClick={() => setSharing(false)}>
            Cancel
          </button>
        </form>
      )}

      {commentsOpen && (
        <div style={{ padding: "12px 4px" }}>
          {stats.comments.map(comment => {
            const own = comment.author_id === viewerId;
            const author = profiles[comment.author_id];
            return (
              <div key={comment.id} style={{
                marginLeft: comment.parent_id ? 24 : 0,
                padding: "12px 0",
                borderBottom: "1px solid rgba(255,255,255,.1)"
              }}>
                <div style={{ fontSize: 13, opacity: 0.8 }}>
                  {author?.full_name || author?.username || "Member"}
                </div>

                {editingId === comment.id ? (
                  <form onSubmit={async e => {
                    e.preventDefault();
                    if (await interact("edit_comment",
                      editDraft.trim(), comment.id)) {
                      setEditingId(null);
                    }
                  }}>
                    <textarea value={editDraft} maxLength={1200}
                      onChange={e => setEditDraft(e.target.value)}
                      style={{ width: "100%", fontSize: 16 }} />
                    <button type="submit" disabled={busy || !editDraft.trim()}>
                      Save
                    </button>
                    <button type="button"
                      onClick={() => setEditingId(null)}>Cancel</button>
                  </form>
                ) : <p style={{ whiteSpace: "pre-wrap" }}>{comment.content}</p>}

                <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                  <button type="button" disabled={busy}
                    onClick={() => void interact(
                      comment.liked ? "unlike_comment" : "like_comment",
                      undefined, comment.id
                    )}>
                    {comment.liked ? "Unlike" : "Like"}
                    {comment.like_count > 0 ? ` (${comment.like_count})` : ""}
                  </button>

                  {!comment.parent_id && (
                    <button type="button"
                      onClick={() => {
                        setReplyTo(comment.id);
                        setCommentsOpen(true);
                      }}>
                      Reply
                    </button>
                  )}

                  {own && (
                    <>
                      <button type="button" onClick={() => {
                        setEditingId(comment.id);
                        setEditDraft(comment.content);
                      }}>Edit</button>
                      <button type="button" disabled={busy}
                        onClick={() => {
                          if (window.confirm("Delete this comment?")) {
                            void interact("delete_comment",
                              undefined, comment.id);
                          }
                        }}>
                        Delete
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}

          {stats.comments_limited && (
            <p>Showing the first 150 comments.</p>
          )}

          <form onSubmit={submitComment}
            style={{ marginTop: 14 }}>
            {replyTo && (
              <p>
                Writing a reply
                <button type="button"
                  onClick={() => setReplyTo(null)}>Cancel reply</button>
              </p>
            )}
            <textarea
              aria-label={replyTo ? "Write a reply" : "Write a comment"}
              placeholder={replyTo ? "Write a reply..." : "Write a comment..."}
              value={draft}
              maxLength={1200}
              rows={2}
              onChange={e => setDraft(e.target.value)}
              style={{ width: "100%", fontSize: 16 }}
            />
            <button type="submit" disabled={busy || !draft.trim()}>
              {replyTo ? "Post reply" : "Post comment"}
            </button>
          </form>
        </div>
      )}
    </section>
  );
}
