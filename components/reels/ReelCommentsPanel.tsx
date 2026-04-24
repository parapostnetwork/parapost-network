"use client";

import React, { CSSProperties, RefObject } from "react";
import ReelsCommentsBottomSheet from "@/components/reels/ReelsCommentsBottomSheet";

type ReelComment = {
  id: string;
  reelId: string;
  author: string;
  text: string;
  time: string;
  parentCommentId?: string | null;
  replyToAuthor?: string | null;
};

type CommentMenuState = {
  commentId: string;
  x: number;
  y: number;
  isReply?: boolean;
} | null;

type ViewportType = "mobile" | "tablet" | "desktop";

type ReelCommentsPanelProps = {
  isOpen: boolean;
  onClose: () => void;
  reelTitle: string;
  activeComments: ReelComment[];
  allComments: ReelComment[];
  activeReelId: string;
  currentUserId: string;
  activeReelOwnerId: string;
  commentDraft: string;
  setCommentDraft: React.Dispatch<React.SetStateAction<string>>;
  commentInputRef: RefObject<HTMLTextAreaElement | null>;
  onCommentInputKeyDown: (event: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  onAddComment: () => void;
  viewportType: ViewportType;
  commentLikedMap: Record<string, boolean>;
  commentLikeMap: Record<string, number>;
  commentLikeBurstId: string | null;
  replyingToCommentId: string | null;
  replyDraft: string;
  setReplyDraft: React.Dispatch<React.SetStateAction<string>>;
  onCommentLikeToggle: (commentId: string, forceLike?: boolean) => void;
  onStartCommentReply: (comment: ReelComment) => void;
  onCancelCommentReply: () => void;
  onSubmitCommentReply: (comment: ReelComment) => void;
  onHideComment: (commentId: string) => void;
  onOpenCommentMenu: (
    event: React.MouseEvent<HTMLElement>,
    commentId: string,
    isReply?: boolean
  ) => void;
  onCommentTouchStart: (commentId: string, isReply?: boolean) => void;
  onCommentTouchEnd: (commentId: string) => void;
  commentMenu: CommentMenuState;
  setCommentMenu: React.Dispatch<React.SetStateAction<CommentMenuState>>;
  onCopyCommentText: (commentId: string) => void;
  onReportComment: (commentId: string) => void;
  onDeleteLocalComment: (commentId: string) => void;
};

const buttonStyle: CSSProperties = {
  background: "rgba(255,255,255,0.08)",
  color: "white",
  border: "1px solid rgba(255,255,255,0.14)",
  borderRadius: "999px",
  padding: "10px 16px",
  fontWeight: 700,
  fontSize: "14px",
  cursor: "pointer",
  backdropFilter: "blur(10px)",
};

const primaryButtonStyle: CSSProperties = {
  background: "white",
  color: "#000",
  border: "none",
  borderRadius: "999px",
  padding: "10px 16px",
  fontWeight: 800,
  fontSize: "14px",
  cursor: "pointer",
};

const textAreaStyle: CSSProperties = {
  width: "100%",
  background: "rgba(255,255,255,0.04)",
  color: "white",
  border: "1px solid rgba(255,255,255,0.10)",
  borderRadius: "18px",
  padding: "14px 16px",
  fontSize: "14px",
  outline: "none",
  minHeight: "120px",
  resize: "vertical",
  fontFamily: "inherit",
};

const menuItemStyle: CSSProperties = {
  width: "100%",
  background: "transparent",
  color: "white",
  border: "none",
  padding: "13px 14px",
  textAlign: "left",
  cursor: "pointer",
  fontSize: "14px",
  borderBottom: "1px solid rgba(255,255,255,0.06)",
};

function getVisibleRepliesForComment(
  allComments: ReelComment[],
  activeReelId: string,
  commentId: string
) {
  return allComments.filter(
    (comment) =>
      comment.reelId === activeReelId && comment.parentCommentId === commentId
  );
}

export default function ReelCommentsPanel({
  isOpen,
  onClose,
  reelTitle,
  activeComments,
  allComments,
  activeReelId,
  currentUserId,
  activeReelOwnerId,
  commentDraft,
  setCommentDraft,
  commentInputRef,
  onCommentInputKeyDown,
  onAddComment,
  viewportType,
  commentLikedMap,
  commentLikeMap,
  commentLikeBurstId,
  replyingToCommentId,
  replyDraft,
  setReplyDraft,
  onCommentLikeToggle,
  onStartCommentReply,
  onCancelCommentReply,
  onSubmitCommentReply,
  onHideComment,
  onOpenCommentMenu,
  onCommentTouchStart,
  onCommentTouchEnd,
  commentMenu,
  setCommentMenu,
  onCopyCommentText,
  onReportComment,
  onDeleteLocalComment,
}: ReelCommentsPanelProps) {
  const canModerateComments = !!activeReelOwnerId && activeReelOwnerId === currentUserId;

  return (
    <>
      <ReelsCommentsBottomSheet
        isOpen={isOpen}
        onClose={onClose}
        title="Comments"
        subtitle={`${activeComments.length} comment${activeComments.length === 1 ? "" : "s"} · ${reelTitle}`}
        footer={
          <div style={{ display: "grid", gap: "8px" }}>
            <textarea
              ref={commentInputRef}
              value={commentDraft}
              onChange={(event) => setCommentDraft(event.target.value)}
              onKeyDown={onCommentInputKeyDown}
              placeholder="Write a comment..."
              rows={2}
              style={{
                ...textAreaStyle,
                minHeight: "78px",
                maxHeight: "110px",
                borderRadius: "16px",
                padding: "12px 14px",
              }}
            />

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: "10px",
                flexWrap: "wrap",
              }}
            >
              <div style={{ fontSize: "12px", color: "#9ca3af" }}>
                {viewportType === "mobile"
                  ? "Tap outside or × to close"
                  : "Use mouse wheel or trackpad to scroll comments"}
              </div>

              <button
                onClick={onAddComment}
                disabled={!commentDraft.trim()}
                style={{
                  ...primaryButtonStyle,
                  opacity: commentDraft.trim() ? 1 : 0.45,
                  cursor: commentDraft.trim() ? "pointer" : "not-allowed",
                }}
              >
                Post Comment
              </button>
            </div>
          </div>
        }
      >
        <div style={{ display: "grid", gap: "10px" }}>
          {activeComments.length === 0 ? (
            <div
              style={{
                border: "1px dashed rgba(255,255,255,0.12)",
                borderRadius: "18px",
                padding: "16px",
                color: "#9ca3af",
                background: "rgba(255,255,255,0.03)",
              }}
            >
              No comments yet. Start the conversation.
            </div>
          ) : (
            activeComments.map((comment) => {
              const commentLiked = !!commentLikedMap[comment.id];
              const commentLikeCount = commentLikeMap[comment.id] || 0;
              const replies = getVisibleRepliesForComment(
                allComments,
                activeReelId,
                comment.id
              );

              return (
                <div
                  key={comment.id}
                  onContextMenu={(event) => onOpenCommentMenu(event, comment.id, false)}
                  onDoubleClick={() => onCommentLikeToggle(comment.id, true)}
                  onTouchStart={() => onCommentTouchStart(comment.id, false)}
                  onTouchEnd={() => onCommentTouchEnd(comment.id)}
                  onMouseEnter={(event) => {
                    if (viewportType === "desktop") {
                      event.currentTarget.style.transform = "translateY(-1px)";
                    }
                  }}
                  onMouseLeave={(event) => {
                    event.currentTarget.style.transform = "translateY(0px)";
                  }}
                  style={{
                    background: "rgba(255,255,255,0.045)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    borderRadius: "18px",
                    padding: "12px 13px",
                    transition:
                      "transform 180ms ease, border-color 180ms ease, background 180ms ease",
                    transform: "translateY(0px)",
                    position: "relative",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "10px",
                      marginBottom: "7px",
                      flexWrap: "wrap",
                    }}
                  >
                    <div style={{ fontWeight: 800, fontSize: "14px" }}>
                      {comment.author}
                    </div>
                    <div style={{ fontSize: "12px", color: "#9ca3af" }}>
                      {comment.time}
                    </div>
                  </div>

                  <div
                    style={{
                      color: "#e5e7eb",
                      lineHeight: 1.55,
                      fontSize: "14px",
                      marginBottom: "10px",
                    }}
                  >
                    {comment.text}
                  </div>

                  {commentLikeBurstId === comment.id ? (
                    <div
                      style={{
                        position: "absolute",
                        top: "50%",
                        left: "50%",
                        transform: "translate(-50%, -50%)",
                        fontSize: "34px",
                        color: "#ffffff",
                        pointerEvents: "none",
                        textShadow: "0 8px 24px rgba(0,0,0,0.45)",
                        opacity: 0.95,
                      }}
                    >
                      ♥
                    </div>
                  ) : null}

                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "12px",
                      flexWrap: "wrap",
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => onCommentLikeToggle(comment.id)}
                      style={{
                        background: "transparent",
                        border: "none",
                        color: commentLiked ? "#ffffff" : "#aeb3bd",
                        fontSize: "12px",
                        fontWeight: 800,
                        cursor: "pointer",
                        padding: 0,
                      }}
                    >
                      {commentLiked ? "Liked" : "Like"}
                      {commentLikeCount > 0 ? ` · ${commentLikeCount}` : ""}
                    </button>

                    <button
                      type="button"
                      onClick={() => onStartCommentReply(comment)}
                      style={{
                        background: "transparent",
                        border: "none",
                        color: "#aeb3bd",
                        fontSize: "12px",
                        fontWeight: 800,
                        cursor: "pointer",
                        padding: 0,
                      }}
                    >
                      Reply
                    </button>

                    {canModerateComments ? (
                      <button
                        type="button"
                        onClick={() => onHideComment(comment.id)}
                        style={{
                          background: "transparent",
                          border: "none",
                          color: "#fca5a5",
                          fontSize: "12px",
                          fontWeight: 800,
                          cursor: "pointer",
                          padding: 0,
                        }}
                      >
                        Hide
                      </button>
                    ) : null}
                  </div>

                  {replyingToCommentId === comment.id ? (
                    <div style={{ marginTop: "12px", display: "grid", gap: "8px" }}>
                      <textarea
                        value={replyDraft}
                        onChange={(event) => setReplyDraft(event.target.value)}
                        placeholder="Write a reply..."
                        rows={2}
                        style={{
                          ...textAreaStyle,
                          minHeight: "68px",
                          borderRadius: "15px",
                          padding: "11px 12px",
                        }}
                      />

                      <div
                        style={{
                          display: "flex",
                          justifyContent: "flex-end",
                          gap: "8px",
                          flexWrap: "wrap",
                        }}
                      >
                        <button
                          type="button"
                          onClick={onCancelCommentReply}
                          style={{ ...buttonStyle, padding: "8px 12px", fontSize: "12px" }}
                        >
                          Cancel
                        </button>

                        <button
                          type="button"
                          onClick={() => onSubmitCommentReply(comment)}
                          disabled={!replyDraft.trim()}
                          style={{
                            ...primaryButtonStyle,
                            padding: "8px 12px",
                            fontSize: "12px",
                            opacity: replyDraft.trim() ? 1 : 0.45,
                            cursor: replyDraft.trim() ? "pointer" : "not-allowed",
                          }}
                        >
                          Reply
                        </button>
                      </div>
                    </div>
                  ) : null}

                  {replies.length > 0 ? (
                    <div
                      style={{
                        marginTop: "10px",
                        marginBottom: "6px",
                        marginLeft: viewportType === "mobile" ? "10px" : "18px",
                        paddingLeft: viewportType === "mobile" ? "10px" : "12px",
                        borderLeft: "2px solid rgba(255,255,255,0.06)",
                        display: "grid",
                        gap: "8px",
                      }}
                    >
                      {replies.map((reply) => {
                        const replyLiked = !!commentLikedMap[reply.id];
                        const replyLikeCount = commentLikeMap[reply.id] || 0;

                        return (
                          <div
                            key={reply.id}
                            onContextMenu={(event) => onOpenCommentMenu(event, reply.id, true)}
                            onDoubleClick={() => onCommentLikeToggle(reply.id, true)}
                            onTouchStart={() => onCommentTouchStart(reply.id, true)}
                            onTouchEnd={() => onCommentTouchEnd(reply.id)}
                            onMouseEnter={(event) => {
                              if (viewportType === "desktop") {
                                event.currentTarget.style.transform = "translateY(-1px)";
                              }
                            }}
                            onMouseLeave={(event) => {
                              event.currentTarget.style.transform = "translateY(0px)";
                            }}
                            style={{
                              background: "rgba(255,255,255,0.02)",
                              border: "1px solid rgba(255,255,255,0.05)",
                              borderRadius: "16px",
                              padding: "10px 11px",
                              transition:
                                "transform 180ms ease, border-color 180ms ease, background 180ms ease",
                              transform: "translateY(0px)",
                              position: "relative",
                            }}
                          >
                            <div
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                gap: "8px",
                                marginBottom: "6px",
                                flexWrap: "wrap",
                              }}
                            >
                              <div style={{ fontWeight: 800, fontSize: "13px" }}>
                                {reply.author}
                              </div>
                              <div style={{ fontSize: "11px", color: "#9ca3af" }}>
                                {reply.time}
                              </div>
                            </div>

                            <div
                              style={{
                                color: "#d1d5db",
                                fontSize: "13px",
                                lineHeight: 1.5,
                                marginBottom: "8px",
                              }}
                            >
                              <div
                                style={{
                                  fontSize: "11px",
                                  color: "#9ca3af",
                                  fontWeight: 800,
                                  marginBottom: "4px",
                                }}
                              >
                                replying to {reply.replyToAuthor}
                              </div>
                              <div>{reply.text.replace(/^@\S+\s*/, "")}</div>
                            </div>

                            {commentLikeBurstId === reply.id ? (
                              <div
                                style={{
                                  position: "absolute",
                                  top: "50%",
                                  left: "50%",
                                  transform: "translate(-50%, -50%)",
                                  fontSize: "28px",
                                  color: "#ffffff",
                                  pointerEvents: "none",
                                  textShadow: "0 8px 24px rgba(0,0,0,0.45)",
                                  opacity: 0.95,
                                }}
                              >
                                ♥
                              </div>
                            ) : null}

                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "12px",
                                flexWrap: "wrap",
                              }}
                            >
                              <button
                                type="button"
                                onClick={() => onCommentLikeToggle(reply.id)}
                                style={{
                                  background: "transparent",
                                  border: "none",
                                  color: replyLiked ? "#ffffff" : "#aeb3bd",
                                  fontSize: "12px",
                                  fontWeight: 800,
                                  cursor: "pointer",
                                  padding: 0,
                                }}
                              >
                                {replyLiked ? "Liked" : "Like"}
                                {replyLikeCount > 0 ? ` · ${replyLikeCount}` : ""}
                              </button>

                              <button
                                type="button"
                                onClick={() => onStartCommentReply(comment)}
                                style={{
                                  background: "transparent",
                                  border: "none",
                                  color: "#aeb3bd",
                                  fontSize: "12px",
                                  fontWeight: 800,
                                  cursor: "pointer",
                                  padding: 0,
                                }}
                              >
                                Reply
                              </button>

                              {canModerateComments ? (
                                <button
                                  type="button"
                                  onClick={() => onHideComment(reply.id)}
                                  style={{
                                    background: "transparent",
                                    border: "none",
                                    color: "#fca5a5",
                                    fontSize: "12px",
                                    fontWeight: 800,
                                    cursor: "pointer",
                                    padding: 0,
                                  }}
                                >
                                  Hide
                                </button>
                              ) : null}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              );
            })
          )}
        </div>
      </ReelsCommentsBottomSheet>

      {commentMenu && (
        <div
          style={{
            position: "fixed",
            top: commentMenu.y,
            left: commentMenu.x,
            zIndex: 120,
            minWidth: "210px",
            background: "#0b1020",
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: "18px",
            overflow: "hidden",
            boxShadow: "0 18px 34px rgba(0,0,0,0.34)",
          }}
          onClick={(event) => event.stopPropagation()}
        >
          <button style={menuItemStyle} onClick={() => onCopyCommentText(commentMenu.commentId)}>
            Copy Comment
          </button>

          <button
            style={menuItemStyle}
            onClick={() => onCommentLikeToggle(commentMenu.commentId, true)}
          >
            Like Comment
          </button>

          <button
            style={menuItemStyle}
            onClick={() => {
              const selectedComment = allComments.find(
                (comment) => comment.id === commentMenu.commentId
              );
              if (selectedComment) {
                const parentComment = selectedComment.parentCommentId
                  ? allComments.find((comment) => comment.id === selectedComment.parentCommentId)
                  : selectedComment;

                if (parentComment) {
                  onStartCommentReply(parentComment);
                }
              }
              setCommentMenu(null);
            }}
          >
            Reply
          </button>

          {canModerateComments ? (
            <button style={menuItemStyle} onClick={() => onHideComment(commentMenu.commentId)}>
              Hide Comment
            </button>
          ) : null}

          <button style={menuItemStyle} onClick={() => onReportComment(commentMenu.commentId)}>
            Report Comment
          </button>

          {canModerateComments ? (
            <button
              style={{ ...menuItemStyle, color: "#fecaca", borderBottom: "none" }}
              onClick={() => onDeleteLocalComment(commentMenu.commentId)}
            >
              Delete From View
            </button>
          ) : (
            <button
              style={{ ...menuItemStyle, borderBottom: "none" }}
              onClick={() => setCommentMenu(null)}
            >
              Cancel
            </button>
          )}
        </div>
      )}
    </>
  );
}
