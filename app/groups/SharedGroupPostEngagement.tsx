"use client";

import { shareErrorMessage } from '@/lib/groups/shareErrors';
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { groupsFetch, groupAction } from "@/lib/groups/client";
import { supabase } from "@/lib/supabase";
import SharedGroupPostActions from "./SharedGroupPostActions";
import { createPortal } from "react-dom";
import { ShareDialog } from "./GroupShareButton";
import { PostAvatar, type PostProfile } from './PostIdentity';
import { dashboardCommentTextareaStyle, dashboardCommentSubmitButtonStyle } from '@/components/postPresentation';
import styles from './groupPosting.module.css';

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

type Profile = PostProfile & { id: string };

export default function SharedGroupPostEngagement({
  shareId, groupId, postId, kind = "post", canShare = true
}: {
  shareId: string;
  groupId: string;
  postId?: string;
  kind?: "post" | "promotion";
  canShare?: boolean;
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
  const [shareError, setShareError] = useState("");

  function closeShare() {
    setSharing(false);
    setShareError("");
    setCaption("");
    setNotice("");
  }

  const reload = useCallback(async () => {
    const response = await groupsFetch(
      `/api/groups/sharing/interactions?share=${encodeURIComponent(shareId)}&kind=${kind}`
    );
    const result = await response.json() as Stats;
    if (!Array.isArray(result.comments) ||
        typeof result.like_count !== "number" ||
        typeof result.comment_count !== "number") {
      throw new Error("Invalid reactions");
    }
    setStats(result);
  }, [shareId, kind]);

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
    const ids = [...new Set([viewerId, ...(stats?.comments.map(c => c.author_id) ?? [])].filter(Boolean))];
    if (!ids.length) return;
    let active = true;
    void supabase.from("profiles")
      .select("id,full_name,username,avatar_url")
      .in("id", ids)
      .then(({ data, error }) => {
        if (active && !error) {
          setProfiles(Object.fromEntries(
            (data ?? []).map(p => [p.id, p])
          ));
        }
      });
    return () => { active = false; };
  }, [stats, viewerId]);

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
          kind,
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
    if (busy || !canShare || !postId || caption.length > 1000) return;
    setBusy(true);
    setShareError("");
    setNotice("");
    try {
      const result = await groupAction("share_post", groupId, {
        post_id: postId,
        caption: caption.trim() || null
      });
      if (typeof result?.id !== "string") throw new Error("Share was not confirmed");
      setSharing(false);
      setCaption("");
      setNotice("Shared to Dashboard and your Profile.");
      window.dispatchEvent(new Event("parapost-group-shared"));
    } catch (error) {
      setShareError(shareErrorMessage(error));
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
    <section className={styles.sharedEngagement} aria-label="Shared Group post interactions">
      <div style={{
        display: "flex", justifyContent: "space-between",
        padding: "12px 4px 0", fontSize: 13, opacity: 0.8
      }}>
        <span>{stats.like_count} {stats.like_count === 1 ? "Like" : "Likes"}</span>
        <button type="button" onClick={() => setCommentsOpen(v => !v)}
          style={{ background: "none", border: 0, color: "inherit" }}>
          {stats.comment_count} {stats.comment_count === 1 ? "Comment" : "Comments"}
        </button>
      </div>

      <SharedGroupPostActions
        liked={stats.liked}
        commentsOpen={commentsOpen}
        busy={busy}
        canShare={canShare}
        onLike={() => {
          void interact(stats.liked ? "unlike" : "like");
        }}
        onComment={() => setCommentsOpen(v => !v)}
        onShare={() => { if (sharing) closeShare(); else { setShareError(""); setNotice(""); setCaption(""); setSharing(true); } }}
      />

      {notice && <p role="status">{notice}</p>}
      {error && <p role="alert">{error}</p>}

      {sharing && kind === "promotion" && createPortal(
        <ShareDialog groupId={groupId} shareId={shareId} read={groupsFetch}
          onClose={closeShare} onShared={() => {
            closeShare();
            setNotice("Shared to Dashboard and your Profile.");
            window.dispatchEvent(new Event("parapost-group-shared"));
          }} />, document.body
      )}
      {sharing && kind === "post" && (
        <form aria-label="Share Group post" onSubmit={submitShare} style={{ padding: 12 }}>
          {shareError && <p role="alert">{shareError}</p>}
          <label>
            Add a caption (optional)
            <textarea value={caption} maxLength={1000}
              onChange={e => setCaption(e.target.value)}
              rows={2} style={dashboardCommentTextareaStyle} />
          </label>
          <button type="submit" disabled={busy}>Share post</button>
          <button type="button" disabled={busy} onClick={closeShare}>
            Cancel
          </button>
        </form>
      )}

      {commentsOpen && (
        <div className={styles.engagementThread}>
          {stats.comments.filter(comment => !comment.parent_id).flatMap(parent => [parent, ...stats.comments.filter(reply => reply.parent_id === parent.id)]).map(comment => {
            const own = comment.author_id === viewerId;
            const author = profiles[comment.author_id];
            return (
              <div key={comment.id} className={styles.engagementComment} data-reply={Boolean(comment.parent_id)}>
                <PostAvatar id={comment.author_id} profile={author} size={32}/>
                <div className={styles.commentBody}>
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
                      style={dashboardCommentTextareaStyle} />
                    <button type="submit" disabled={busy || !editDraft.trim()}>
                      Save
                    </button>
                    <button type="button"
                      onClick={() => setEditingId(null)}>Cancel</button>
                  </form>
                ) : <p className={styles.engagementText}>{comment.content}</p>}

                <div className={styles.commentActions}>
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
              </div>
            );
          })}

          {stats.comments_limited && (
            <p>Showing the first 150 comments.</p>
          )}

          <form onSubmit={submitComment} className={styles.engagementComposer}>
            {replyTo && (
              <p className={styles.engagementReplyLabel}>
                Writing a reply
                <button type="button"
                  onClick={() => { setReplyTo(null); setDraft(""); }}>Cancel reply</button>
              </p>
            )}
            {viewerId && <PostAvatar id={viewerId} profile={profiles[viewerId]} size={32}/>}
            <textarea
              aria-label={replyTo ? "Write a reply" : "Write a comment"}
              placeholder={replyTo ? "Write a reply..." : "Write a comment..."}
              value={draft}
              maxLength={1200}
              rows={2}
              onChange={e => setDraft(e.target.value)}
              style={dashboardCommentTextareaStyle}
            />
            <button type="submit" style={dashboardCommentSubmitButtonStyle} disabled={busy || !draft.trim()}>
              {replyTo ? "Post reply" : "Post comment"}
            </button>
          </form>
        </div>
      )}
    </section>
  );
}
