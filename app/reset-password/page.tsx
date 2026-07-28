"use client";

import { CSSProperties, FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

function getFriendlyResetError(message: string) {
  const lowerMessage = message.toLowerCase();

  if (
    lowerMessage.includes("expired") ||
    lowerMessage.includes("invalid") ||
    lowerMessage.includes("otp") ||
    lowerMessage.includes("token") ||
    lowerMessage.includes("code")
  ) {
    return "This reset link is expired or no longer valid. Please go back to Sign In and request a new Forgot Password email. Use the newest email only.";
  }

  if (lowerMessage.includes("rate limit") || lowerMessage.includes("too many")) {
    return "Too many attempts. Please wait a few minutes and try again.";
  }

  if (lowerMessage.includes("session") || lowerMessage.includes("not authenticated")) {
    return "Your reset session is not ready. Please request a fresh password reset email and use the newest link.";
  }

  return message || "Unable to complete password reset. Please request a fresh reset email.";
}

function getHashParamsFromUrl(currentUrl: URL) {
  return new URLSearchParams(
    currentUrl.hash.startsWith("#") ? currentUrl.hash.slice(1) : currentUrl.hash
  );
}

export default function ResetPasswordPage() {
  const router = useRouter();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [status, setStatus] = useState("Checking your reset link...");
  const [loading, setLoading] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);

  useEffect(() => {
    let isActive = true;

    const markReady = () => {
      if (!isActive) return;

      setSessionReady(true);
      setStatus("Reset link verified. Enter your new password.");
    };

    const markError = async (message: string) => {
      if (!isActive) return;

      setSessionReady(false);
      setStatus(getFriendlyResetError(message));

      try {
        await supabase.auth.signOut({ scope: "local" });
      } catch {
        // Ignore cleanup errors. The reset message above is what matters.
      }
    };

    const cleanRecoveryUrl = () => {
      if (typeof window === "undefined") return;

      window.history.replaceState(null, "", "/reset-password");
    };

    const prepareRecoverySession = async () => {
      try {
        const currentUrl = new URL(window.location.href);
        const hashParams = getHashParamsFromUrl(currentUrl);

        const accessToken =
          currentUrl.searchParams.get("access_token") ||
          hashParams.get("access_token");
        const refreshToken =
          currentUrl.searchParams.get("refresh_token") ||
          hashParams.get("refresh_token");
        const code = currentUrl.searchParams.get("code");
        const recoveryType =
          currentUrl.searchParams.get("type") || hashParams.get("type") || "";

        if (accessToken && refreshToken) {
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });

          if (error) {
            await markError(error.message);
            return;
          }

          cleanRecoveryUrl();
          markReady();
          return;
        }

        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);

          if (error) {
            await markError(error.message);
            return;
          }

          cleanRecoveryUrl();
          markReady();
          return;
        }

        const {
          data: { session },
          error,
        } = await supabase.auth.getSession();

        if (error) {
          await markError(error.message);
          return;
        }

        if (session?.user && recoveryType !== "signup") {
          markReady();
          return;
        }

        setSessionReady(false);
        setStatus(
          "Reset link is missing session details. Please request a new Forgot Password email and use the newest link."
        );
      } catch (err) {
        await markError(
          err instanceof Error
            ? err.message
            : "Unable to prepare password reset session."
        );
      }
    };

    void prepareRecoverySession();

    return () => {
      isActive = false;
    };
  }, [supabase]);

  const handleResetPassword = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();

    const passwordHasEdgeSpaces = password !== password.trim();

    if (!password || !confirmPassword) {
      setStatus("Please fill in both password fields.");
      return;
    }

    if (password.length < 6) {
      setStatus("Please use a password with at least 6 characters.");
      return;
    }

    if (passwordHasEdgeSpaces) {
      setStatus(
        "Your password has a space at the beginning or end. Remove the extra space unless you intentionally want it included."
      );
      return;
    }

    if (password !== confirmPassword) {
      setStatus("Passwords do not match. Please check both fields and try again.");
      return;
    }

    if (!sessionReady) {
      setStatus("Reset session is not ready. Please request a fresh Forgot Password email and use the newest link.");
      return;
    }

    setLoading(true);
    setStatus("Updating password...");

    try {
      const { error } = await supabase.auth.updateUser({
        password,
      });

      if (error) {
        setStatus(getFriendlyResetError(error.message));
        setLoading(false);
        return;
      }

      try {
        await supabase.auth.signOut({ scope: "local" });
      } catch {
        // Keep going. The password was updated successfully.
      }

      setPassword("");
      setConfirmPassword("");
      setStatus("Password updated. Redirecting to Sign In...");
      setLoading(false);

      window.setTimeout(() => {
        router.replace("/");
      }, 1600);
    } catch (err) {
      setStatus(
        getFriendlyResetError(
          err instanceof Error ? err.message : "Unexpected error updating password."
        )
      );
      setLoading(false);
    }
  };

  const statusText = status.toLowerCase();

  const statusIsError =
    statusText.includes("error") ||
    statusText.includes("expired") ||
    statusText.includes("invalid") ||
    statusText.includes("missing") ||
    statusText.includes("please request") ||
    statusText.includes("do not match") ||
    statusText.includes("not ready") ||
    statusText.includes("space at the beginning") ||
    statusText.includes("at least 6");

  const statusIsSuccess =
    statusText.includes("verified") ||
    statusText.includes("password updated");

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
              Use the newest reset email only. Older reset links may expire.
            </p>
          </div>

          <form onSubmit={handleResetPassword} style={formStackStyle}>
            <div style={fieldGroupStyle}>
              <label style={labelStyle}>New password</label>

              <div style={passwordFieldWrapStyle}>
                <input
                  type={showPassword ? "text" : "password"}
                  placeholder="Enter your new password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  style={{ ...inputStyle, paddingRight: "82px" }}
                  autoComplete="new-password"
                />

                <button
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  style={showButtonStyle}
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
            </div>

            <div style={fieldGroupStyle}>
              <label style={labelStyle}>Confirm password</label>

              <div style={passwordFieldWrapStyle}>
                <input
                  type={showConfirmPassword ? "text" : "password"}
                  placeholder="Confirm your new password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  style={{ ...inputStyle, paddingRight: "82px" }}
                  autoComplete="new-password"
                />

                <button
                  type="button"
                  onClick={() => setShowConfirmPassword((value) => !value)}
                  style={showButtonStyle}
                >
                  {showConfirmPassword ? "Hide" : "Show"}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || !sessionReady}
              style={{
                ...buttonStyle,
                opacity: loading || !sessionReady ? 0.7 : 1,
                cursor: loading || !sessionReady ? "not-allowed" : "pointer",
              }}
            >
              {loading ? "Updating..." : sessionReady ? "Update Password" : "Waiting for reset link"}
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

            <button
              type="button"
              onClick={() => router.replace("/")}
              style={backButtonStyle}
            >
              Back to Sign In
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

const pageStyle: CSSProperties = {
  minHeight: "100dvh",
  background:
    "radial-gradient(circle at top, rgba(67, 56, 202, 0.18), transparent 30%), linear-gradient(180deg, #07090d 0%, #0a0f1c 100%)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "24px",
  position: "relative",
  overflowX: "hidden",
  overflowY: "auto",
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

const passwordFieldWrapStyle: CSSProperties = {
  position: "relative",
  width: "100%",
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

const showButtonStyle: CSSProperties = {
  position: "absolute",
  right: "8px",
  top: "50%",
  transform: "translateY(-50%)",
  minHeight: "34px",
  border: 0,
  borderRadius: "12px",
  background: "rgba(255,255,255,0.06)",
  color: "#c4b5fd",
  padding: "0 12px",
  fontSize: "12px",
  fontWeight: 800,
  cursor: "pointer",
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

const backButtonStyle: CSSProperties = {
  minHeight: "44px",
  borderRadius: "14px",
  border: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(255,255,255,0.04)",
  color: "#d8b4fe",
  fontSize: "14px",
  fontWeight: 800,
  cursor: "pointer",
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
