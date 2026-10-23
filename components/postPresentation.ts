import type { CSSProperties } from "react";

// Shared presentation extracted unchanged from the Dashboard.
export const composerCardStyle: CSSProperties = {
  borderRadius: 22,
  border: "1px solid rgba(255,255,255,0.105)",
  background:
    "linear-gradient(180deg, rgba(255,255,255,0.060), rgba(255,255,255,0.032))",
  padding: 16,
  marginBottom: 16,
  boxShadow: "0 16px 34px rgba(0,0,0,0.24), inset 0 1px 0 rgba(255,255,255,0.035)",
  overflow: "hidden",
  scrollMarginTop: 96,
};

export const composerTopRowStyle: CSSProperties = { display: "grid", gridTemplateColumns: "auto minmax(0,1fr) auto", gap: 12, alignItems: "center" };

export const composerInputStyle: CSSProperties = {
  width: "100%",
  minHeight: 60,
  maxHeight: 190,
  resize: "none",
  overflowY: "auto",
  border: "1px solid rgba(255,255,255,0.10)",
  borderRadius: 18,
  background: "linear-gradient(180deg, rgba(255,255,255,0.055), rgba(255,255,255,0.032))",
  color: "#fff",
  outline: 0,
  padding: "15px 17px",
  fontSize: 15,
  lineHeight: 1.45,
  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.030)",
};

export const composerImageButtonStyle: CSSProperties = {
  width: 44,
  height: 44,
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(255,255,255,0.040)",
  color: "#fff",
  display: "grid",
  placeItems: "center",
  cursor: "pointer",
  flexShrink: 0,
};

export const composerActionPillStyle: CSSProperties = {
  minHeight: 38,
  borderRadius: 13,
  border: "1px solid rgba(255,255,255,0.085)",
  background: "rgba(255,255,255,0.035)",
  color: "#fff",
  padding: "0 12px",
  fontWeight: 850,
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  textDecoration: "none",
  whiteSpace: "nowrap",
  fontSize: 12.5,
  transition: "border-color 160ms ease, background 160ms ease, transform 160ms ease",
};

export const composerFooterStyle: CSSProperties = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginTop: 13, flexWrap: "wrap" };

export const publishButtonStyle: CSSProperties = { marginLeft: "auto", minHeight: 35, borderRadius: 14, border: 0, background: "linear-gradient(135deg, #ffffff, var(--parapost-accent-readable-text))", color: "#111827", fontWeight: 900, padding: "0 15px", cursor: "pointer", boxShadow: "0 10px 20px color-mix(in srgb, var(--parapost-accent-2) 18%, transparent)", whiteSpace: "nowrap", fontSize: 12.5 };

export const imagePreviewWrapStyle: CSSProperties = {
  width: "min(100%, 560px)",
  margin: "12px auto 0",
  borderRadius: 20,
  border: "1px solid rgba(255,255,255,0.10)",
  overflow: "hidden",
  background: "rgba(0,0,0,0.22)",
  position: "relative",
};

export const composerPreviewGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 6,
  padding: 8,
  maxHeight: 292,
  overflow: "hidden",
};

export const composerPreviewSingleGridStyle: CSSProperties = {
  gridTemplateColumns: "1fr",
  maxHeight: 260,
};

export const composerPreviewTileStyle: CSSProperties = {
  position: "relative",
  minHeight: 132,
  height: 132,
  border: "1px solid rgba(255,255,255,0.10)",
  borderRadius: 16,
  overflow: "hidden",
  padding: 0,
  background: "rgba(255,255,255,0.04)",
  cursor: "pointer",
};

export const composerPreviewSingleTileStyle: CSSProperties = {
  minHeight: 246,
  height: 246,
};

export const composerPreviewImageStyle: CSSProperties = { width: "100%", height: "100%", minHeight: "100%", objectFit: "cover", display: "block" };

export const composerPreviewCounterStyle: CSSProperties = { position: "absolute", right: 10, top: 10, borderRadius: 999, padding: "5px 9px", background: "rgba(0,0,0,0.72)", color: "#fff", fontSize: 12, fontWeight: 950, lineHeight: 1, border: "1px solid rgba(255,255,255,0.16)", boxShadow: "0 8px 18px rgba(0,0,0,0.28)" };

export const postCardStyle: CSSProperties = {
  borderRadius: 22,
  border: "1px solid rgba(255,255,255,0.105)",
  background:
    "linear-gradient(180deg, rgba(255,255,255,0.058), rgba(255,255,255,0.030))",
  padding: 18,
  position: "relative",
  zIndex: 0,
  boxShadow: "0 15px 34px rgba(0,0,0,0.23), inset 0 1px 0 rgba(255,255,255,0.030)",
};

export const postHeaderStyle: CSSProperties = { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 14, marginBottom: 13 };

export const postAuthorStyle: CSSProperties = { display: "flex", alignItems: "center", gap: 12, minWidth: 0 };

export const postAuthorNameStyle: CSSProperties = { display: "block", color: "#fff", textDecoration: "none", fontWeight: 950, fontSize: 16, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" };

export const postMetaStyle: CSSProperties = { color: "#a1a1aa", fontSize: 13, marginTop: 3 };

export const postContentStyle: CSSProperties = { color: "#f9fafb", lineHeight: 1.56, fontSize: 15.8, whiteSpace: "pre-wrap", margin: "10px 0 0", overflowWrap: "anywhere" };

export const postImageStyle: CSSProperties = { width: "100%", maxHeight: 680, objectFit: "cover", display: "block", borderRadius: 20, border: "1px solid rgba(255,255,255,0.10)", marginTop: 14, background: "#05070d", boxShadow: "0 18px 38px rgba(0,0,0,0.32)" };

export const postImageGridStyle: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8, marginTop: 14, borderRadius: 22, overflow: "hidden", border: "1px solid rgba(255,255,255,0.10)", background: "rgba(0,0,0,0.26)", boxShadow: "0 18px 38px rgba(0,0,0,0.32)" };

export const postImageGridTileStyle: CSSProperties = { position: "relative", minHeight: 230, overflow: "hidden", background: "rgba(255,255,255,0.04)" };

export const postImageGridLargeTileStyle: CSSProperties = { gridRow: "span 2", minHeight: 468 };

export const postImageGridImageStyle: CSSProperties = { width: "100%", height: "100%", minHeight: "inherit", objectFit: "cover", display: "block", background: "#000" };

export const dotsButtonStyle: CSSProperties = { width: 38, height: 38, borderRadius: 999, border: "1px solid rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.05)", color: "#fff", display: "grid", placeItems: "center", cursor: "pointer" };

export const postMenuStyle: CSSProperties = { position: "absolute", right: 0, top: 45, minWidth: 170, borderRadius: 14, overflow: "hidden", border: "1px solid rgba(255,255,255,0.12)", background: "rgba(8,10,18,0.96)", zIndex: 30, boxShadow: "0 20px 50px rgba(0,0,0,0.5)" };

export const menuItemStyle: CSSProperties = { width: "100%", textAlign: "left", border: 0, background: "transparent", color: "#fff", padding: "12px 14px", cursor: "pointer", fontWeight: 850 };

export const postStatsSummaryStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  flexWrap: "wrap",
  gap: 12,
  alignItems: "center",
  color: "#d1d5db",
  fontSize: 13,
  borderBottom: "1px solid rgba(255,255,255,0.10)",
  paddingBottom: 11,
  marginTop: 13,
};

export const postActionsStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
  gap: 8,
  marginTop: 12,
  paddingTop: 10,
  borderTop: "1px solid rgba(255,255,255,0.08)",
  background: "transparent",
};

export const dashboardCommentTextareaStyle: CSSProperties = {
  width: "100%",
  minHeight: "46px",
  maxHeight: "120px",
  resize: "vertical",
  borderRadius: "17px",
  border: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(6,8,15,0.78)",
  color: "#fff",
  outline: "none",
  padding: "11px 13px",
  fontFamily: "inherit",
  fontSize: "16px",
  lineHeight: 1.45,
};

export const dashboardCommentSubmitButtonStyle: CSSProperties = {
  minHeight: "42px",
  borderRadius: "999px",
  border: "1px solid color-mix(in srgb, var(--parapost-accent-1) 38%, rgba(255,255,255,0.12))",
  background:
    "linear-gradient(135deg, var(--parapost-accent-1), var(--parapost-accent-2))",
  color: "#fff",
  fontWeight: 900,
  padding: "0 16px",
  boxShadow: "0 10px 22px color-mix(in srgb, var(--parapost-accent-2) 20%, transparent)",
};

export const dashboardCommentRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: "9px",
};

export const dashboardCommentBubbleStyle: CSSProperties = {
  flex: 1,
  minWidth: 0,
  borderRadius: "14px",
  background: "rgba(255,255,255,0.035)",
  border: "none",
  padding: "9px 11px",
};

export const dashboardCommentTopLineStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "10px",
  marginBottom: "4px",
};

export const dashboardCommentAuthorStyle: CSSProperties = {
  color: "#fff",
  fontWeight: 900,
  fontSize: "13px",
  textDecoration: "none",
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

export const dashboardCommentTimeStyle: CSSProperties = {
  color: "#9ca3af",
  fontSize: "11px",
  flexShrink: 0,
};

export const dashboardCommentTextStyle: CSSProperties = {
  color: "#e5e7eb",
  fontSize: "13px",
  lineHeight: 1.45,
  whiteSpace: "pre-wrap",
  overflowWrap: "anywhere",
};

export const dashboardCommentActionRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "12px",
  marginTop: "7px",
  flexWrap: "wrap",
};

export const sharedPostFrameStyle: CSSProperties = {
  marginTop: "14px",
  border: "1px solid var(--parapost-accent-border)",
  borderRadius: "24px",
  padding: "14px",
  background:
    "linear-gradient(135deg, var(--parapost-accent-muted-bg), rgba(255,255,255,0.045), rgba(15,23,42,0.50))",
};
