import type { CSSProperties } from "react";

const pageStyle: CSSProperties = {
  minHeight: "100dvh",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "24px",
  background:
    "radial-gradient(circle at 20% 0%, rgba(168,85,247,0.24), transparent 34%), radial-gradient(circle at 80% 18%, rgba(124,58,237,0.18), transparent 30%), linear-gradient(180deg, #05050b 0%, #07090d 52%, #05050b 100%)",
  color: "#ffffff",
};

const cardStyle: CSSProperties = {
  width: "min(420px, 100%)",
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: "28px",
  padding: "26px",
  background:
    "linear-gradient(135deg, rgba(255,255,255,0.08), rgba(15,23,42,0.72))",
  boxShadow: "0 24px 70px rgba(0,0,0,0.42)",
  textAlign: "center",
};

const logoStyle: CSSProperties = {
  width: "58px",
  height: "58px",
  margin: "0 auto 16px",
  borderRadius: "18px",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "linear-gradient(135deg, #a855f7, #7c3aed, #d946ef)",
  boxShadow: "0 16px 34px rgba(168,85,247,0.32)",
  fontSize: "24px",
  fontWeight: 900,
  letterSpacing: "-0.08em",
};

const titleStyle: CSSProperties = {
  margin: 0,
  fontSize: "24px",
  fontWeight: 900,
  letterSpacing: "-0.04em",
};

const textStyle: CSSProperties = {
  margin: "8px 0 0",
  color: "#c4b5fd",
  fontSize: "14px",
  fontWeight: 700,
};

const barWrapStyle: CSSProperties = {
  width: "100%",
  height: "8px",
  marginTop: "22px",
  overflow: "hidden",
  borderRadius: "999px",
  background: "rgba(255,255,255,0.08)",
};

const barStyle: CSSProperties = {
  width: "45%",
  height: "100%",
  borderRadius: "999px",
  background: "linear-gradient(90deg, #8b5cf6, #d946ef)",
  animation: "parapostLoadingSlide 1.1s ease-in-out infinite",
};

export default function Loading() {
  return (
    <main style={pageStyle} aria-busy="true" aria-live="polite">
      <style>
        {`
          @keyframes parapostLoadingSlide {
            0% {
              transform: translateX(-120%);
              opacity: 0.45;
            }

            50% {
              opacity: 1;
            }

            100% {
              transform: translateX(240%);
              opacity: 0.45;
            }
          }
        `}
      </style>

      <div style={cardStyle}>
        <div style={logoStyle}>P</div>
        <h1 style={titleStyle}>Loading Parapost</h1>
        <p style={textStyle}>Opening your next page...</p>

        <div style={barWrapStyle}>
          <div style={barStyle} />
        </div>
      </div>
    </main>
  );
}