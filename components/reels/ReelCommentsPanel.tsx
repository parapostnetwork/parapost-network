"use client";

import React, { CSSProperties, RefObject } from "react";
import ReelsCommentsBottomSheet from "@/components/reels/ReelsCommentsBottomSheet";

type ReelComment = {
  id: string;
  reelId: string;
  authorUserId: string;
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
  editingCommentId?: string | null;
  editingCommentText?: string;
  savingCommentId?: string | null;
  setEditingCommentText?: React.Dispatch<React.SetStateAction<string>>;
  onStartEditComment?: (comment: ReelComment) => void;
  onSaveEditComment?: (comment: ReelComment) => void;
  onCancelEditComment?: () => void;
  containedInParent?: boolean;
};

const primaryButtonStyle: CSSProperties = {
  background: "white",
  color: "#000",
  border: "none",
  borderRadius: "999px",
  padding: "10px 16px",
  fontWeight: 850,
  fontSize: "14px",
  cursor: "pointer",
  WebkitTapHighlightColor: "transparent",
};

const secondaryButtonStyle: CSSProperties = {
  background: "rgba(255,255,255,0.07)",
  color: "white",
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: "999px",
  padding: "9px 13px",
  fontWeight: 750,
  fontSize: "13px",
  cursor: "pointer",
  WebkitTapHighlightColor: "transparent",
};

const textAreaStyle: CSSProperties = {
  width: "100%",
  background: "rgba(255,255,255,0.055)",
  color: "white",
  border: "1px solid rgba(255,255,255,0.11)",
  borderRadius: "18px",
  padding: "13px 14px",
  fontSize: "14px",
  outline: "none",
  minHeight: "74px",
  resize: "vertical",
  fontFamily: "inherit",
  lineHeight: 1.45,
};

const commentEditWrapStyle: CSSProperties = {
  marginTop: "10px",
  display: "grid",
  gap: "9px",
};

const commentEditActionsStyle: CSSProperties = {
  display: "flex",
  justifyContent: "flex-end",
  gap: "8px",
  flexWrap: "wrap",
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

function getCommentInitial(author: string) {
  return author.replace(/^@+/, "").trim().charAt(0).toUpperCase() || "P";
}

function getCommentCountLabel(count: number) {
  return `${count} comment${count === 1 ? "" : "s"}`;
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
  editingCommentId = null,
  editingCommentText = "",
  savingCommentId = null,
  setEditingCommentText,
  onStartEditComment,
  onSaveEditComment,
  onCancelEditComment,
  containedInParent = false,
}: ReelCommentsPanelProps) {
  if (!isOpen) return null;

  const isMobile = viewportType === "mobile";
  const canModerateComments = !!activeReelOwnerId && activeReelOwnerId === currentUserId;
  const footerIsCompact = isMobile;
  const selectedMenuComment = commentMenu
    ? allComments.find((comment) => comment.id === commentMenu.commentId)
    : null;
  const canDeleteSelectedMenuComment = Boolean(
    selectedMenuComment &&
      (selectedMenuComment.authorUserId === currentUserId || canModerateComments)
  );
  const canEditSelectedMenuComment = Boolean(
    selectedMenuComment &&
      selectedMenuComment.authorUserId === currentUserId &&
      !!onStartEditComment
  );

  const handleCloseCommentMenu = () => setCommentMenu(null);

  return (
    <>
      <ReelsCommentsBottomSheet
        isOpen={isOpen}
        onClose={onClose}
        title="Comments"
        subtitle={`${getCommentCountLabel(activeComments.length)} · ${reelTitle}`}
        containedInParent={containedInParent}
        footer={
          <div
            style={{
              display: "grid",
              gap: footerIsCompact ? 9 : 10,
              paddingBottom: footerIsCompact ? "env(safe-area-inset-bottom)" : 0,
            }}
          >
            <textarea
              ref={commentInputRef}
              value={commentDraft}
              onChange={(event) => setCommentDraft(event.target.value)}
              onKeyDown={onCommentInputKeyDown}
              placeholder="Write a comment..."
              rows={2}
              style={{
                ...textAreaStyle,
                minHeight: footerIsCompact ? "62px" : "72px",
                maxHeight: footerIsCompact ? "96px" : "118px",
                fontSize: footerIsCompact ? "16px" : textAreaStyle.fontSize,
              }}
            />

            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                alignItems: "center",
                gap: "10px",
              }}
            >
              <button
                type="button"
                onClick={onAddComment}
                disabled={!commentDraft.trim()}
                style={{
                  ...primaryButtonStyle,
                  opacity: commentDraft.trim() ? 1 : 0.45,
                  cursor: commentDraft.trim() ? "pointer" : "not-allowed",
                  padding: footerIsCompact ? "10px 16px" : primaryButtonStyle.padding,
                  flexShrink: 0,
                  minHeight: footerIsCompact ? 42 : undefined,
                }}
              >
                Post
              </button>
            </div>
          </div>
        }
      >
        <div
          style={{
            display: "grid",
            gap: isMobile ? "10px" : "12px",
            paddingBottom: isMobile ? "4px" : 0,
          }}
        >
          {activeComments.length === 0 ? (
            <div style={emptyStateStyle}>
              <div style={{ fontSize: "28px", lineHeight: 1, marginBottom: 10 }}>💬</div>
              <div style={{ color: "#f9fafb", fontWeight: 850, marginBottom: 5 }}>
                No comments yet
              </div>
              <div style={{ color: "#9ca3af", fontSize: 14, lineHeight: 1.5 }}>
                Be the first to start the conversation on this reel.
              </div>
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
              const canDeleteComment =
                comment.authorUserId === currentUserId || canModerateComments;
              const canEditComment =
                comment.authorUserId === currentUserId &&
                !!onStartEditComment &&
                !!onSaveEditComment &&
                !!onCancelEditComment &&
                !!setEditingCommentText;
              const isEditingComment = editingCommentId === comment.id;
              const isSavingComment = savingCommentId === comment.id;

              return (
                <div
                  key={comment.id}
                  onContextMenu={(event) => onOpenCommentMenu(event, comment.id, false)}
                  onDoubleClick={() => onCommentLikeToggle(comment.id, true)}
                  onTouchStart={() => onCommentTouchStart(comment.id, false)}
                  onTouchEnd={() => onCommentTouchEnd(comment.id)}
                  style={{
                    ...commentCardStyle,
                    padding: isMobile ? "12px" : commentCardStyle.padding,
                    borderRadius: isMobile ? "19px" : commentCardStyle.borderRadius,
                  }}
                >
                  <div style={commentHeaderStyle}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                      <div style={avatarStyle}>{getCommentInitial(comment.author)}</div>
                      <div style={{ minWidth: 0 }}>
                        <div style={commentAuthorStyle}>{comment.author}</div>
                        <div style={commentTimeMobileStyle}>{comment.time}</div>
                      </div>
                    </div>

                    {!isMobile ? <div style={commentTimeDesktopStyle}>{comment.time}</div> : null}
                  </div>

                  {isEditingComment && canEditComment ? (
                    <div style={commentEditWrapStyle}>
                      <textarea
                        value={editingCommentText}
                        onChange={(event) => setEditingCommentText?.(event.target.value)}
                        rows={3}
                        autoFocus
                        style={{
                          ...textAreaStyle,
                          minHeight: "72px",
                          maxHeight: "140px",
                          fontSize: isMobile ? "16px" : "14px",
                        }}
                        onKeyDown={(event) => {
                          if (event.key === "Escape") {
                            event.preventDefault();
                            onCancelEditComment?.();
                          }

                          if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                            event.preventDefault();
                            onSaveEditComment?.(comment);
                          }
                        }}
                      />

                      <div style={commentEditActionsStyle}>
                        <button
                          type="button"
                          onClick={() => onCancelEditComment?.()}
                          disabled={isSavingComment}
                          style={secondaryButtonStyle}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => onSaveEditComment?.(comment)}
                          disabled={!editingCommentText.trim() || isSavingComment}
                          style={{
                            ...primaryButtonStyle,
                            opacity: editingCommentText.trim() && !isSavingComment ? 1 : 0.45,
                            cursor: editingCommentText.trim() && !isSavingComment ? "pointer" : "not-allowed",
                          }}
                        >
                          {isSavingComment ? "Saving..." : "Save"}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div style={commentTextStyle}>{comment.text}</div>
                  )}

                  {commentLikeBurstId === comment.id ? <HeartBurst size={34} /> : null}

                  {!isEditingComment ? (
                    <CommentActions
                      commentId={comment.id}
                      liked={commentLiked}
                      likeCount={commentLikeCount}
                      canDelete={canDeleteComment}
                      canModerate={canModerateComments}
                      canEdit={canEditComment}
                      onLike={onCommentLikeToggle}
                      onReply={() => onStartCommentReply(comment)}
                      onEdit={() => onStartEditComment?.(comment)}
                      onDelete={onDeleteLocalComment}
                      onHide={onHideComment}
                    />
                  ) : null}

                  {replyingToCommentId === comment.id ? (
                    <div style={replyComposerWrapStyle}>
                      <textarea
                        value={replyDraft}
                        onChange={(event) => setReplyDraft(event.target.value)}
                        placeholder="Write a reply..."
                        rows={2}
                        style={{
                          ...textAreaStyle,
                          minHeight: "64px",
                          maxHeight: "100px",
                          borderRadius: "16px",
                          padding: "11px 12px",
                          fontSize: isMobile ? "16px" : "13px",
                        }}
                      />

                      <div style={replyComposerActionsStyle}>
                        <button
                          type="button"
                          onClick={onCancelCommentReply}
                          style={secondaryButtonStyle}
                        >
                          Cancel
                        </button>

                        <button
                          type="button"
                          onClick={() => onSubmitCommentReply(comment)}
                          disabled={!replyDraft.trim()}
                          style={{
                            ...primaryButtonStyle,
                            padding: "9px 13px",
                            fontSize: "13px",
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
                        ...repliesWrapStyle,
                        marginLeft: isMobile ? "8px" : "20px",
                        paddingLeft: isMobile ? "10px" : "14px",
                      }}
                    >
                      {replies.map((reply) => {
                        const replyLiked = !!commentLikedMap[reply.id];
                        const replyLikeCount = commentLikeMap[reply.id] || 0;
                        const canDeleteReply =
                          reply.authorUserId === currentUserId || canModerateComments;
                        const canEditReply =
                          reply.authorUserId === currentUserId &&
                          !!onStartEditComment &&
                          !!onSaveEditComment &&
                          !!onCancelEditComment &&
                          !!setEditingCommentText;
                        const isEditingReply = editingCommentId === reply.id;
                        const isSavingReply = savingCommentId === reply.id;

                        return (
                          <div
                            key={reply.id}
                            onContextMenu={(event) => onOpenCommentMenu(event, reply.id, true)}
                            onDoubleClick={() => onCommentLikeToggle(reply.id, true)}
                            onTouchStart={() => onCommentTouchStart(reply.id, true)}
                            onTouchEnd={() => onCommentTouchEnd(reply.id)}
                            style={replyCardStyle}
                          >
                            <div style={commentHeaderStyle}>
                              <div
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 9,
                                  minWidth: 0,
                                }}
                              >
                                <div style={replyAvatarStyle}>{getCommentInitial(reply.author)}</div>
                                <div style={{ minWidth: 0 }}>
                                  <div style={{ ...commentAuthorStyle, fontSize: 13 }}>
                                    {reply.author}
                                  </div>
                                  <div style={commentTimeMobileStyle}>{reply.time}</div>
                                </div>
                              </div>

                              {!isMobile ? <div style={commentTimeDesktopStyle}>{reply.time}</div> : null}
                            </div>

                            <div style={replyingToStyle}>
                              replying to {reply.replyToAuthor}
                            </div>

                            {isEditingReply && canEditReply ? (
                              <div style={commentEditWrapStyle}>
                                <textarea
                                  value={editingCommentText}
                                  onChange={(event) => setEditingCommentText?.(event.target.value)}
                                  rows={2}
                                  autoFocus
                                  style={{
                                    ...textAreaStyle,
                                    minHeight: "64px",
                                    maxHeight: "120px",
                                    fontSize: isMobile ? "16px" : "13px",
                                  }}
                                  onKeyDown={(event) => {
                                    if (event.key === "Escape") {
                                      event.preventDefault();
                                      onCancelEditComment?.();
                                    }

                                    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                                      event.preventDefault();
                                      onSaveEditComment?.(reply);
                                    }
                                  }}
                                />

                                <div style={commentEditActionsStyle}>
                                  <button
                                    type="button"
                                    onClick={() => onCancelEditComment?.()}
                                    disabled={isSavingReply}
                                    style={secondaryButtonStyle}
                                  >
                                    Cancel
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => onSaveEditComment?.(reply)}
                                    disabled={!editingCommentText.trim() || isSavingReply}
                                    style={{
                                      ...primaryButtonStyle,
                                      padding: "9px 13px",
                                      fontSize: "13px",
                                      opacity: editingCommentText.trim() && !isSavingReply ? 1 : 0.45,
                                      cursor: editingCommentText.trim() && !isSavingReply ? "pointer" : "not-allowed",
                                    }}
                                  >
                                    {isSavingReply ? "Saving..." : "Save"}
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div style={{ ...commentTextStyle, fontSize: 13 }}>
                                {reply.text.replace(/^@\S+\s*/, "")}
                              </div>
                            )}

                            {commentLikeBurstId === reply.id ? <HeartBurst size={28} /> : null}

                            {!isEditingReply ? (
                              <CommentActions
                                commentId={reply.id}
                                liked={replyLiked}
                                likeCount={replyLikeCount}
                                canDelete={canDeleteReply}
                                canModerate={canModerateComments}
                                canEdit={canEditReply}
                                onLike={onCommentLikeToggle}
                                onReply={() => onStartCommentReply(comment)}
                                onEdit={() => onStartEditComment?.(reply)}
                                onDelete={onDeleteLocalComment}
                                onHide={onHideComment}
                              />
                            ) : null}
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

      {commentMenu ? (
        <>
          {isMobile ? (
            <button
              type="button"
              aria-label="Close comment options"
              onClick={handleCloseCommentMenu}
              style={mobileMenuBackdropStyle}
            />
          ) : null}

          <div
            style={
              isMobile
                ? mobileCommentMenuStyle
                : {
                    ...desktopCommentMenuStyle,
                    top: commentMenu.y,
                    left: commentMenu.x,
                  }
            }
            onClick={(event) => event.stopPropagation()}
            role="menu"
            aria-label="Comment options"
          >
            {isMobile ? (
              <div style={mobileMenuHandleWrapStyle}>
                <span style={mobileMenuHandleStyle} />
                <div style={mobileMenuTitleStyle}>Comment options</div>
              </div>
            ) : null}

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

            {canEditSelectedMenuComment ? (
              <button
                style={menuItemStyle}
                onClick={() => {
                  if (selectedMenuComment) {
                    onStartEditComment?.(selectedMenuComment);
                  }
                  setCommentMenu(null);
                }}
              >
                Edit Comment
              </button>
            ) : null}

            {canModerateComments && selectedMenuComment?.authorUserId !== currentUserId ? (
              <button style={menuItemStyle} onClick={() => onHideComment(commentMenu.commentId)}>
                Hide Comment
              </button>
            ) : null}

            <button style={menuItemStyle} onClick={() => onReportComment(commentMenu.commentId)}>
              Report Comment
            </button>

            {canDeleteSelectedMenuComment ? (
              <button
                style={{ ...menuItemStyle, color: "#fecaca" }}
                onClick={() => onDeleteLocalComment(commentMenu.commentId)}
              >
                Delete Comment
              </button>
            ) : null}

            <button
              style={{
                ...menuItemStyle,
                borderBottom: "none",
                color: isMobile ? "#f9fafb" : "#d1d5db",
                textAlign: isMobile ? "center" : "left",
                fontWeight: isMobile ? 900 : 500,
              }}
              onClick={handleCloseCommentMenu}
            >
              Cancel
            </button>
          </div>
        </>
      ) : null}
    </>
  );
}

function HeartBurst({ size }: { size: number }) {
  return (
    <div
      style={{
        position: "absolute",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        fontSize: size,
        color: "#ffffff",
        pointerEvents: "none",
        textShadow: "0 8px 24px rgba(0,0,0,0.45)",
        opacity: 0.95,
      }}
    >
      ♥
    </div>
  );
}

function CommentActions({
  commentId,
  liked,
  likeCount,
  canDelete,
  canModerate,
  canEdit,
  onLike,
  onReply,
  onEdit,
  onDelete,
  onHide,
}: {
  commentId: string;
  liked: boolean;
  likeCount: number;
  canDelete: boolean;
  canModerate: boolean;
  canEdit: boolean;
  onLike: (commentId: string, forceLike?: boolean) => void;
  onReply: () => void;
  onEdit: () => void;
  onDelete: (commentId: string) => void;
  onHide: (commentId: string) => void;
}) {
  return (
    <div style={actionRowStyle}>
      <button
        type="button"
        onClick={() => onLike(commentId)}
        aria-pressed={liked}
        aria-label={liked ? "Unlike this comment" : "Like this comment"}
        title={liked ? "Unlike comment" : "Like comment"}
        style={{
          ...commentLikeButtonStyle,
          color: liked ? "#ffffff" : "#aeb3bd",
        }}
      >
        {liked ? "Liked" : "Like"}
        {likeCount > 0 ? <span style={commentLikeCountStyle}>{` · ${likeCount}`}</span> : null}
      </button>

      <button type="button" onClick={onReply} style={textButtonStyle}>
        Reply
      </button>

      {canEdit ? (
        <button type="button" onClick={onEdit} style={textButtonStyle}>
          Edit
        </button>
      ) : null}

      {canDelete ? (
        <button
          type="button"
          onClick={() => onDelete(commentId)}
          style={{ ...textButtonStyle, color: "#fca5a5" }}
        >
          Delete
        </button>
      ) : canModerate ? (
        <button
          type="button"
          onClick={() => onHide(commentId)}
          style={{ ...textButtonStyle, color: "#fca5a5" }}
        >
          Hide
        </button>
      ) : null}
    </div>
  );
}

const emptyStateStyle: CSSProperties = {
  border: "1px dashed rgba(255,255,255,0.13)",
  borderRadius: "22px",
  padding: "22px 16px",
  color: "#9ca3af",
  background:
    "linear-gradient(180deg, rgba(255,255,255,0.045), rgba(255,255,255,0.025))",
  textAlign: "center",
};

const commentCardStyle: CSSProperties = {
  background:
    "linear-gradient(180deg, rgba(255,255,255,0.055), rgba(255,255,255,0.035))",
  border: "1px solid rgba(255,255,255,0.09)",
  borderRadius: "21px",
  padding: "13px",
  position: "relative",
  boxShadow: "0 12px 24px rgba(0,0,0,0.18)",
  WebkitTapHighlightColor: "transparent",
};

const replyCardStyle: CSSProperties = {
  background: "rgba(255,255,255,0.028)",
  border: "1px solid rgba(255,255,255,0.06)",
  borderRadius: "18px",
  padding: "11px",
  position: "relative",
  WebkitTapHighlightColor: "transparent",
};

const commentHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: "10px",
  marginBottom: "8px",
};

const avatarStyle: CSSProperties = {
  width: 34,
  height: 34,
  borderRadius: "50%",
  display: "grid",
  placeItems: "center",
  background: "linear-gradient(135deg, rgba(168,85,247,0.92), rgba(59,130,246,0.65))",
  border: "1px solid rgba(255,255,255,0.13)",
  color: "#fff",
  fontSize: 13,
  fontWeight: 900,
  flexShrink: 0,
};

const replyAvatarStyle: CSSProperties = {
  ...avatarStyle,
  width: 29,
  height: 29,
  fontSize: 12,
};

const commentAuthorStyle: CSSProperties = {
  color: "#fff",
  fontWeight: 850,
  fontSize: 14,
  lineHeight: 1.15,
  maxWidth: "min(260px, 56vw)",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const commentTimeDesktopStyle: CSSProperties = {
  color: "#8f96a3",
  fontSize: 12,
  flexShrink: 0,
};

const commentTimeMobileStyle: CSSProperties = {
  color: "#8f96a3",
  fontSize: 11,
  marginTop: 3,
};

const commentTextStyle: CSSProperties = {
  color: "#e5e7eb",
  lineHeight: 1.55,
  fontSize: 14,
  marginBottom: "10px",
  whiteSpace: "pre-wrap",
  overflowWrap: "anywhere",
};

const commentLikeButtonStyle: CSSProperties = {
  background: "transparent",
  border: "none",
  color: "#aeb3bd",
  fontSize: "12px",
  fontWeight: 850,
  cursor: "pointer",
  padding: 0,
  WebkitTapHighlightColor: "transparent",
};

const commentLikeCountStyle: CSSProperties = {
  color: "inherit",
  fontSize: "12px",
  fontWeight: 850,
};

const actionRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "13px",
  flexWrap: "wrap",
};

const textButtonStyle: CSSProperties = {
  background: "transparent",
  border: "none",
  color: "#aeb3bd",
  fontSize: "12px",
  fontWeight: 850,
  cursor: "pointer",
  padding: 0,
  WebkitTapHighlightColor: "transparent",
};

const replyComposerWrapStyle: CSSProperties = {
  marginTop: "12px",
  display: "grid",
  gap: "8px",
};

const replyComposerActionsStyle: CSSProperties = {
  display: "flex",
  justifyContent: "flex-end",
  gap: "8px",
  flexWrap: "wrap",
};

const repliesWrapStyle: CSSProperties = {
  marginTop: "11px",
  marginBottom: "4px",
  borderLeft: "2px solid rgba(168,85,247,0.20)",
  display: "grid",
  gap: "8px",
};

const replyingToStyle: CSSProperties = {
  fontSize: "11px",
  color: "#9ca3af",
  fontWeight: 850,
  marginBottom: "5px",
};

const desktopCommentMenuStyle: CSSProperties = {
  position: "fixed",
  zIndex: 170,
  minWidth: "210px",
  background: "#0b1020",
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: "18px",
  overflow: "hidden",
  boxShadow: "0 18px 34px rgba(0,0,0,0.34)",
};

const mobileMenuBackdropStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 168,
  border: "none",
  background: "rgba(0,0,0,0.30)",
  padding: 0,
  cursor: "pointer",
};

const mobileCommentMenuStyle: CSSProperties = {
  position: "fixed",
  left: "12px",
  right: "12px",
  bottom: "calc(12px + env(safe-area-inset-bottom))",
  zIndex: 170,
  background:
    "linear-gradient(180deg, rgba(15,23,42,0.98), rgba(7,10,16,0.98))",
  border: "1px solid rgba(255,255,255,0.14)",
  borderRadius: "24px",
  overflow: "hidden",
  boxShadow: "0 -18px 44px rgba(0,0,0,0.48)",
  backdropFilter: "blur(18px)",
};

const mobileMenuHandleWrapStyle: CSSProperties = {
  display: "grid",
  placeItems: "center",
  gap: "8px",
  padding: "12px 14px 8px",
  borderBottom: "1px solid rgba(255,255,255,0.08)",
};

const mobileMenuHandleStyle: CSSProperties = {
  width: "42px",
  height: "4px",
  borderRadius: "999px",
  background: "rgba(255,255,255,0.24)",
};

const mobileMenuTitleStyle: CSSProperties = {
  color: "#f9fafb",
  fontSize: "13px",
  fontWeight: 950,
  letterSpacing: "-0.01em",
};
