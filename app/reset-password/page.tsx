"use client";

import { CSSProperties, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";

export default function ResetPasswordPage() {
  const supabase = createClient();
  const router = useRouter();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [status, setStatus] = useState("Preparing reset session...");
  const [loading, setLoading] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);

  useEffect(() => {
    const prepareRecoverySession = async () => {
      try {
        const currentUrl = new URL(window.location.href);

        const hashParams = new URLSearchParams(
          currentUrl.hash.startsWith("#") ? currentUrl.hash.slice(1) : currentUrl.hash
        );

        const queryAccessToken = currentUrl.searchParams.get("access_token");
        const queryRefreshToken = currentUrl.searchParams.get("refresh_token");
        const hashAccessToken = hashParams.get("access_token");
        const hashRefreshToken = hashParams.get("refresh_token");

        const access_token = queryAccessToken || hashAccessToken;
        const refresh_token = queryRefreshToken || hashRefreshToken;

        if (access_token && refresh_token) {
          const { error } = await supabase.auth.setSession({
            access_token,
            refresh_token,
          });

          if (error) {
            setStatus("Session error: " + error.message);
            return;
          }

          setSessionReady(true);
          setStatus("Session ready. Enter your new password.");
          return;
        }

        const code = currentUrl.searchParams.get("code");

        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);

          if (error) {
            setStatus("Session error: " + error.message);
            return;
          }

          setSessionReady(true);
          setStatus("Session ready. Enter your new password.");
          return;
        }

        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (session) {
          setSessionReady(true);
          setStatus("Session ready. Enter your new password.");
          return;
        }

        setStatus("Reset link is missing session details. Please request a new password reset email.");
      } catch (err) {
        if (err instanceof Error) {
          setStatus("Session error: " + err.message);
        } else {
          setStatus("Unable to prepare password reset session.");
        }
      }
    };

    prepareRecoverySession();
  }, [supabase]);

  const handleResetPassword = async () => {
    if (!password || !confirmPassword) {
      setStatus("Please fill in both fields.");
      return;
    }

    if (password !== confirmPassword) {
      setStatus("Passwords do not match.");
      return;
    }

    if (!sessionReady) {
      setStatus("Reset session is not ready yet. Please use a fresh reset email link.");
      return;
    }

    setLoading(true);
    setStatus("Updating password...");

    const { error } = await supabase.auth.updateUser({
      password,
    });

    if (error) {
      setStatus("Error: " + error.message);
      setLoading(false);
      return;
    }

    setStatus("Password updated! Redirecting...");
    setLoading(false);

    setTimeout(() => {
      router.push("/");
    }, 2000);
  };

  const statusIsError =
    status.toLowerCase().includes("error") ||
    status.toLowerCase().includes("missing") ||
    status.toLowerCase().includes("please request") ||
    status.toLowerCase().includes("do not match") ||
    status.toLowerCase().includes("not ready");

  const statusIsSuccess =
    status.toLowerCase().includes("session ready") ||
    status.toLowerCase().includes("password updated");

  return (
    <div style={pageStyle}>
      <div style={backgroundGlowTop} />
      <div style={backgroundGlowBottom} />

      <div style={contentWrapStyle}>
        <div style={brandBlockStyle}>
          <div style={badgeStyle}>Parapost Network</div>
          <h1 style={titleStyle}>Reset your password</h1>
          <p style={subtitleStyle}>
            Secure your account and get back into the platform. Enter your new password below to
            finish the reset process.
          </p>
        </div>

        <div style={cardStyle}>
          <div style={cardHeaderStyle}>
            <h2 style={cardTitleStyle}>Choose a new password</h2>
            <p style={cardSubtitleStyle}>
              Use something strong and easy for you to remember.
            </p>
          </div>

          <div style={formStackStyle}>
            <div style={fieldGroupStyle}>
              <label style={labelStyle}>New password</label>
              <input
                type="password"
                placeholder="Enter your new password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={inputStyle}
              />
            </div>

            <div style={fieldGroupStyle}>
              <label style={labelStyle}>Confirm password</label>
              <input
                type="password"
                placeholder="Confirm your new password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                style={inputStyle}
              />
            </div>

            <button
              onClick={handleResetPassword}
              disabled={loading || !sessionReady}
              style={{
                ...buttonStyle,
                opacity: loading || !sessionReady ? 0.7 : 1,
                cursor: loading || !sessionReady ? "not-allowed" : "pointer",
              }}
            >
              {loading ? "Updating..." : "Update Password"}
            </button>

            <div
              style={{
                ...statusBoxStyle,
                ...(statusIsError
                  ? errorStatusStyle
                  : statusIsSuccess
                    ? successStatusStyle
                    : neutralStatusStyle),
              }}
            >
              {status}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const pageStyle: CSSProperties = {
  minHeight: "100vh",
  background:
    "radial-gradient(circle at top, rgba(67, 56, 202, 0.18), transparent 30%), linear-gradient(180deg, #07090d 0%, #0a0f1c 100%)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "24px",
  position: "relative",
  overflow: "hidden",
};

const contentWrapStyle: CSSProperties = {
  width: "100%",
  maxWidth: "520px",
  position: "relative",
  zIndex: 2,
};

const brandBlockStyle: CSSProperties = {
  textAlign: "center",
  marginBottom: "20px",
};

const badgeStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "8px 14px",
  borderRadius: "999px",
  background: "rgba(255,255,255,0.06)",
  border: "1px solid rgba(255,255,255,0.10)",
  color: "#d1d5db",
  fontSize: "12px",
  fontWeight: 700,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
  marginBottom: "14px",
};

const titleStyle: CSSProperties = {
  margin: "0 0 10px 0",
  color: "#f9fafb",
  fontSize: "36px",
  lineHeight: 1.05,
  fontWeight: 800,
};

const subtitleStyle: CSSProperties = {
  margin: 0,
  color: "#9ca3af",
  fontSize: "15px",
  lineHeight: 1.7,
};

const cardStyle: CSSProperties = {
  background: "linear-gradient(180deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.04) 100%)",
  border: "1px solid rgba(255,255,255,0.10)",
  borderRadius: "30px",
  padding: "24px",
  backdropFilter: "blur(12px)",
  boxShadow: "0 18px 50px rgba(0,0,0,0.35)",
};

const cardHeaderStyle: CSSProperties = {
  marginBottom: "18px",
};

const cardTitleStyle: CSSProperties = {
  margin: "0 0 6px 0",
  color: "#f9fafb",
  fontSize: "24px",
  fontWeight: 700,
};

const cardSubtitleStyle: CSSProperties = {
  margin: 0,
  color: "#9ca3af",
  fontSize: "14px",
  lineHeight: 1.6,
};

const formStackStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "14px",
};

const fieldGroupStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "8px",
};

const labelStyle: CSSProperties = {
  color: "#e5e7eb",
  fontSize: "14px",
  fontWeight: 600,
};

const inputStyle: CSSProperties = {
  width: "100%",
  height: "50px",
  borderRadius: "16px",
  border: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(255,255,255,0.04)",
  color: "#f9fafb",
  padding: "0 16px",
  outline: "none",
  fontSize: "14px",
  boxSizing: "border-box",
  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.03)",
};

const buttonStyle: CSSProperties = {
  height: "50px",
  borderRadius: "16px",
  border: "none",
  background: "linear-gradient(135deg, #ffffff 0%, #dbe4ff 100%)",
  color: "#07090d",
  fontSize: "15px",
  fontWeight: 700,
  padding: "0 18px",
  transition: "all 180ms ease",
};

const statusBoxStyle: CSSProperties = {
  borderRadius: "16px",
  padding: "14px 16px",
  fontSize: "14px",
  lineHeight: 1.6,
  border: "1px solid rgba(255,255,255,0.08)",
};

const neutralStatusStyle: CSSProperties = {
  background: "rgba(255,255,255,0.04)",
  color: "#d1d5db",
};

const successStatusStyle: CSSProperties = {
  background: "rgba(34,197,94,0.10)",
  color: "#bbf7d0",
  border: "1px solid rgba(34,197,94,0.25)",
};

const errorStatusStyle: CSSProperties = {
  background: "rgba(239,68,68,0.10)",
  color: "#fecaca",
  border: "1px solid rgba(239,68,68,0.24)",
};

const backgroundGlowTop: CSSProperties = {
  position: "absolute",
  top: "-120px",
  left: "-120px",
  width: "280px",
  height: "280px",
  borderRadius: "50%",
  background: "rgba(99,102,241,0.18)",
  filter: "blur(80px)",
  zIndex: 1,
};

const backgroundGlowBottom: CSSProperties = {
  position: "absolute",
  bottom: "-140px",
  right: "-140px",
  width: "320px",
  height: "320px",
  borderRadius: "50%",
  background: "rgba(59,130,246,0.14)",
  filter: "blur(90px)",
  zIndex: 1,
};