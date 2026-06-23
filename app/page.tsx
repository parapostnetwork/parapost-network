"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type AuthMode = "signin" | "signup";

const LIVE_SITE_ORIGIN = "https://parapost.net";

function getSafeAuthOrigin() {
  if (typeof window === "undefined") return LIVE_SITE_ORIGIN;

  const origin = window.location.origin;

  if (
    origin.includes("localhost") ||
    origin.includes("127.0.0.1") ||
    origin.includes("192.168.") ||
    origin.includes("10.") ||
    origin.includes("172.")
  ) {
    return LIVE_SITE_ORIGIN;
  }

  return LIVE_SITE_ORIGIN;
}

async function clearLocalAuthSessionSilently() {
  try {
    await supabase.auth.signOut({ scope: "local" });
  } catch {
    try {
      await supabase.auth.signOut();
    } catch {
      // Ignore cleanup errors. The next auth call will show the real issue.
    }
  }
}

function getFriendlySigninError(message: string, passwordHasEdgeSpaces: boolean) {
  const lowerMessage = message.toLowerCase();

  if (lowerMessage.includes("email not confirmed")) {
    return "Your email still needs to be verified. Please check your inbox for the newest Parapost Network verification email.";
  }

  if (lowerMessage.includes("invalid login credentials")) {
    return passwordHasEdgeSpaces
      ? "We could not sign you in. Your password has a space at the beginning or end. Remove the extra space unless your password intentionally starts or ends with one, or use Forgot Password."
      : "We could not sign you in. Type your password manually instead of using autofill. If it still fails, use Forgot Password and sign in with the newest reset password.";
  }

  if (
    lowerMessage.includes("refresh token") ||
    lowerMessage.includes("invalid token") ||
    lowerMessage.includes("session") ||
    lowerMessage.includes("jwt")
  ) {
    return "Your saved sign-in session expired. Refresh the page, then sign in again. If it still happens, use Forgot Password.";
  }

  if (lowerMessage.includes("rate limit") || lowerMessage.includes("too many")) {
    return "Too many attempts. Please wait a few minutes and try again.";
  }

  if (lowerMessage.includes("network") || lowerMessage.includes("fetch")) {
    return "Network problem while signing in. Check your connection and try again.";
  }

  return message || "We could not sign you in. Please try again.";
}

function getFriendlySignupError(message: string) {
  const lowerMessage = message.toLowerCase();

  if (
    lowerMessage.includes("already registered") ||
    lowerMessage.includes("already")
  ) {
    return "This email may already have an account. Choose Sign In instead, or use Forgot Password if you need a new password.";
  }

  if (lowerMessage.includes("rate limit") || lowerMessage.includes("too many")) {
    return "Too many attempts. Please wait a few minutes and try again.";
  }

  return message || "We could not create the account. Please try again.";
}

export default function Home() {
  const [authMode, setAuthMode] = useState<AuthMode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [authMessage, setAuthMessage] = useState("");
  const [authError, setAuthError] = useState("");

  const isLogin = authMode === "signin";
  const authOrigin = useMemo(() => getSafeAuthOrigin(), []);

  useEffect(() => {
    let isActive = true;

    const verifySavedSession = async () => {
      try {
        const currentUrl = new URL(window.location.href);
        const hashParams = new URLSearchParams(
          currentUrl.hash.startsWith("#") ? currentUrl.hash.slice(1) : currentUrl.hash
        );

        const verifiedFromEmail =
          currentUrl.searchParams.get("verified") === "1" ||
          hashParams.get("verified") === "1";

        const authErrorDescription =
          currentUrl.searchParams.get("error_description") ||
          hashParams.get("error_description") ||
          currentUrl.searchParams.get("error") ||
          hashParams.get("error");

        if (authErrorDescription) {
          await clearLocalAuthSessionSilently();

          if (!isActive) return;

          setAuthMode("signin");
          setAuthError(
            "That verification link could not be completed. Please use the newest Parapost email, or sign in and use Forgot Password if needed."
          );
          window.history.replaceState(null, "", "/");
          return;
        }

        if (verifiedFromEmail) {
          await clearLocalAuthSessionSilently();

          if (!isActive) return;

          setAuthMode("signin");
          setPassword("");
          setConfirmPassword("");
          setAuthMessage("Email verified. Please sign in with your email and password.");
          window.history.replaceState(null, "", "/");
          return;
        }

        const { data, error } = await supabase.auth.getSession();

        if (!isActive) return;

        if (error) {
          await clearLocalAuthSessionSilently();
          return;
        }

        if (data.session?.user) {
          window.location.replace("/dashboard");
          return;
        }
      } catch {
        await clearLocalAuthSessionSilently();
      } finally {
        if (isActive) {
          setCheckingSession(false);
        }
      }
    };

    void verifySavedSession();

    return () => {
      isActive = false;
    };
  }, []);

  const switchMode = (mode: AuthMode) => {
    setAuthMode(mode);
    setAuthMessage("");
    setAuthError("");
    setPassword("");
    setConfirmPassword("");
    setShowPassword(false);
    setShowConfirmPassword(false);
  };

  const handleAuth = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();

    const cleanEmail = email.trim().toLowerCase();
    const passwordHasEdgeSpaces = password !== password.trim();

    setAuthMessage("");
    setAuthError("");

    if (!cleanEmail || !password) {
      setAuthError("Please enter your email and password.");
      return;
    }

    if (!isLogin && password.length < 6) {
      setAuthError("Please use a password with at least 6 characters.");
      return;
    }

    if (!isLogin && password !== confirmPassword) {
      setAuthError("Your passwords do not match. Please check them and try again.");
      return;
    }

    try {
      setLoading(true);

      if (isLogin) {
        await clearLocalAuthSessionSilently();

        const { error } = await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password,
        });

        if (error) {
          await clearLocalAuthSessionSilently();
          setAuthError(getFriendlySigninError(error.message, passwordHasEdgeSpaces));
          return;
        }

        window.location.replace("/dashboard");
        return;
      }

      await clearLocalAuthSessionSilently();

      const { data, error } = await supabase.auth.signUp({
        email: cleanEmail,
        password,
        options: {
          emailRedirectTo: `${authOrigin}/?verified=1`,
        },
      });

      if (error) {
        setAuthError(getFriendlySignupError(error.message));
        return;
      }

      if (!data.session) {
        setAuthMode("signin");
        setPassword("");
        setConfirmPassword("");
        setAuthMessage(
          "Account created. Check your email and verify your account. After verifying, Parapost will bring you back to Sign In."
        );
        return;
      }

      window.location.href = "/dashboard";
    } catch (err) {
      if (err instanceof Error) {
        setAuthError(getFriendlySigninError(err.message, false));
      } else {
        setAuthError("Unexpected error during authentication. Refresh the page and try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    const cleanEmail = email.trim().toLowerCase();

    setAuthMessage("");
    setAuthError("");

    if (!cleanEmail) {
      setAuthError("Please enter your email first, then tap Forgot Password again.");
      return;
    }

    try {
      setLoading(true);
      await clearLocalAuthSessionSilently();

      const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
        redirectTo: `${authOrigin}/reset-password`,
      });

      if (error) {
        const message = error.message.toLowerCase();

        if (message.includes("rate limit")) {
          setAuthError(
            "Too many reset emails were sent. Please wait a few minutes and try again."
          );
          return;
        }

        setAuthError(error.message || "Could not send the reset email. Please try again.");
        return;
      }

      setAuthMessage(
        "Password reset email sent. Use the newest reset email only. If an older link says expired, ignore it and use the latest one."
      );
    } catch (err) {
      if (err instanceof Error) {
        setAuthError(err.message);
      } else {
        setAuthError("Unexpected error sending reset email.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-[100dvh] bg-black text-white">
      <div
        className="min-h-[100dvh] px-3 py-3 sm:px-5 sm:py-5 lg:px-6 lg:py-6"
        style={{
          background:
            "radial-gradient(circle at 50% 0%, rgba(168,85,247,0.24) 0%, rgba(7,9,13,0.88) 38%, #05070b 78%), linear-gradient(180deg, #090b11 0%, #05070b 100%)",
        }}
      >
        <div className="mx-auto flex min-h-[calc(100dvh-24px)] max-w-6xl items-start justify-center lg:items-center">
          <div className="grid w-full max-w-6xl grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_430px] xl:grid-cols-[minmax(0,1fr)_470px] lg:gap-5 xl:gap-6">
            <section
              className="hidden lg:flex lg:min-h-[520px] lg:flex-col lg:justify-between rounded-[28px] xl:rounded-[32px] border border-white/10 p-6 xl:p-8 shadow-2xl"
              style={{
                background:
                  "linear-gradient(145deg, rgba(168,85,247,0.16), rgba(12,14,20,0.92) 42%, rgba(0,0,0,0.76))",
                boxShadow: "0 30px 90px rgba(0,0,0,0.48)",
              }}
            >
              <div>
                <div className="inline-flex items-center gap-2 rounded-full border border-purple-400/25 bg-purple-500/10 px-4 py-2 text-sm font-black text-purple-200">
                  Parapost Network
                </div>

                <h1 className="mt-7 text-4xl xl:text-5xl font-black leading-[0.95] tracking-[-0.06em] text-white">
                  Share your world.
                  <br />
                  Connect your community.
                </h1>

                <p className="mt-5 max-w-xl text-sm xl:text-base leading-7 text-zinc-300">
                  A dark, premium social network for posts, friends, reels, creators,
                  and communities. Paranormal-friendly, but open for everyone.
                </p>
              </div>

              <div className="grid grid-cols-3 gap-3">
                {[
                  ["Posts", "Share updates"],
                  ["Reels", "Short videos"],
                  ["Friends", "Build your circle"],
                ].map(([title, text]) => (
                  <div
                    key={title}
                    className="rounded-2xl border border-white/10 bg-white/[0.045] p-4"
                  >
                    <strong className="block text-sm font-black text-white">
                      {title}
                    </strong>
                    <span className="mt-1 block text-xs font-semibold leading-5 text-zinc-400">
                      {text}
                    </span>
                  </div>
                ))}
              </div>
            </section>

            <section
              className="mx-auto w-full max-w-[520px] lg:max-w-none rounded-[24px] border border-white/10 p-4 shadow-2xl sm:rounded-[28px] sm:p-6 lg:p-6 xl:p-7"
              style={{
                background:
                  "linear-gradient(180deg, rgba(24,27,34,0.96), rgba(12,14,19,0.98))",
                boxShadow: "0 30px 90px rgba(0,0,0,0.58)",
              }}
            >
              <div className="text-center">
                <div
                  className="mx-auto mb-3 flex h-20 w-20 items-center justify-center overflow-hidden rounded-[24px] border border-purple-300/25 sm:mb-4 sm:h-24 sm:w-24 sm:rounded-[30px] lg:h-20 lg:w-20 lg:rounded-[24px] xl:h-24 xl:w-24 xl:rounded-[30px]"
                  style={{
                    background:
                      "radial-gradient(circle at 50% 0%, rgba(168,85,247,0.55), rgba(124,58,237,0.20) 46%, rgba(255,255,255,0.04) 100%)",
                    boxShadow: "0 0 38px rgba(168,85,247,0.36)",
                  }}
                >
                  <img
                    src="/parapost-icon-white.png"
                    alt="Parapost Network logo"
                    className="h-12 w-12 object-contain sm:h-14 sm:w-14 lg:h-12 lg:w-12 xl:h-14 xl:w-14"
                    draggable={false}
                  />
                </div>

                <h2 className="text-[2rem] font-black tracking-[-0.05em] text-white sm:text-4xl lg:text-3xl xl:text-4xl">
                  Parapost Network
                </h2>

                <p className="mt-2 text-sm leading-5 text-zinc-400 sm:leading-6">
                  {isLogin
                    ? "Welcome back. Sign in with your verified account."
                    : "Create your account, then verify your email before signing in."}
                </p>
              </div>

              <div className="mt-4 grid grid-cols-2 rounded-2xl border border-white/10 bg-black/30 p-1 sm:mt-5">
                <button
                  type="button"
                  onClick={() => switchMode("signin")}
                  className={`min-h-[48px] rounded-xl px-3 text-sm font-black transition sm:min-h-[52px] sm:text-base lg:min-h-[46px] xl:min-h-[52px] ${
                    isLogin
                      ? "bg-purple-500 text-white shadow-lg shadow-purple-950/30"
                      : "text-zinc-400 hover:text-white"
                  }`}
                >
                  Sign In
                </button>

                <button
                  type="button"
                  onClick={() => switchMode("signup")}
                  className={`min-h-[48px] rounded-xl px-3 text-sm font-black transition sm:min-h-[52px] sm:text-base lg:min-h-[46px] xl:min-h-[52px] ${
                    !isLogin
                      ? "bg-purple-500 text-white shadow-lg shadow-purple-950/30"
                      : "text-zinc-400 hover:text-white"
                  }`}
                >
                  Create Account
                </button>
              </div>

              {authMessage ? (
                <div className="mt-4 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-3 text-sm font-semibold leading-6 text-emerald-100 sm:mt-5 sm:p-4">
                  {authMessage}
                </div>
              ) : null}

              {authError ? (
                <div className="mt-4 rounded-2xl border border-red-400/20 bg-red-500/10 p-3 text-sm font-semibold leading-6 text-red-100 sm:mt-5 sm:p-4">
                  {authError}
                </div>
              ) : null}

              <form onSubmit={handleAuth} className="mt-4 flex flex-col gap-3 sm:mt-5 sm:gap-4 lg:gap-3 xl:gap-4">
                <label className="grid gap-2">
                  <span className="text-[11px] font-black uppercase tracking-[0.18em] text-zinc-500 sm:text-xs">
                    Email
                  </span>
                  <input
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    className="min-h-[54px] rounded-2xl border border-white/10 bg-zinc-950/70 px-4 text-base text-white outline-none transition placeholder:text-zinc-600 focus:border-purple-400/60 focus:ring-4 focus:ring-purple-500/10 lg:min-h-[50px] xl:min-h-[54px]"
                    autoComplete="email"
                  />
                </label>

                <label className="grid gap-2">
                  <span className="text-[11px] font-black uppercase tracking-[0.18em] text-zinc-500 sm:text-xs">
                    Password
                  </span>

                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      placeholder={isLogin ? "Enter your password" : "Create a password"}
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      className="min-h-[54px] w-full rounded-2xl border border-white/10 bg-zinc-950/70 px-4 pr-20 text-base text-white outline-none transition placeholder:text-zinc-600 focus:border-purple-400/60 focus:ring-4 focus:ring-purple-500/10 lg:min-h-[50px] xl:min-h-[54px]"
                      autoComplete={isLogin ? "current-password" : "new-password"}
                    />

                    <button
                      type="button"
                      onClick={() => setShowPassword((value) => !value)}
                      className="absolute right-2 top-1/2 min-h-9 -translate-y-1/2 rounded-xl px-3 text-xs font-black text-purple-300 hover:bg-white/5"
                    >
                      {showPassword ? "Hide" : "Show"}
                    </button>
                  </div>
                </label>

                {!isLogin ? (
                  <label className="grid gap-2">
                    <span className="text-[11px] font-black uppercase tracking-[0.18em] text-zinc-500 sm:text-xs">
                      Confirm Password
                    </span>

                    <div className="relative">
                      <input
                        type={showConfirmPassword ? "text" : "password"}
                        placeholder="Re-enter your password"
                        value={confirmPassword}
                        onChange={(event) => setConfirmPassword(event.target.value)}
                        className="min-h-[54px] w-full rounded-2xl border border-white/10 bg-zinc-950/70 px-4 pr-20 text-base text-white outline-none transition placeholder:text-zinc-600 focus:border-purple-400/60 focus:ring-4 focus:ring-purple-500/10 lg:min-h-[50px] xl:min-h-[54px]"
                        autoComplete="new-password"
                      />

                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword((value) => !value)}
                        className="absolute right-2 top-1/2 min-h-9 -translate-y-1/2 rounded-xl px-3 text-xs font-black text-purple-300 hover:bg-white/5"
                      >
                        {showConfirmPassword ? "Hide" : "Show"}
                      </button>
                    </div>
                  </label>
                ) : null}

                {!isLogin ? (
                  <div className="rounded-2xl border border-purple-400/15 bg-purple-500/10 p-3 text-sm leading-6 text-purple-100 sm:p-4">
                    After creating your account, check your email to verify it. Once
                    verified, return to <strong>parapost.net</strong> and choose{" "}
                    <strong>Sign In</strong>.
                  </div>
                ) : null}

                {isLogin ? (
                  <div className="flex flex-col gap-2">
                    <button
                      type="button"
                      onClick={handleForgotPassword}
                      disabled={loading || checkingSession}
                      className="self-end text-sm font-bold text-purple-300 hover:text-purple-200 disabled:opacity-60"
                    >
                      Forgot Password?
                    </button>

                    <p className="rounded-2xl border border-white/10 bg-white/[0.035] px-3 py-2 text-xs font-semibold leading-5 text-zinc-400">
                      Trouble signing in? Type your password manually. Saved passwords can be old after a reset.
                    </p>
                  </div>
                ) : null}

                <button
                  type="submit"
                  disabled={loading || checkingSession}
                  className="min-h-[54px] rounded-2xl bg-purple-500 px-4 text-base font-black text-white shadow-lg shadow-purple-950/35 transition hover:bg-purple-400 disabled:cursor-not-allowed disabled:opacity-60 lg:min-h-[50px] xl:min-h-[54px]"
                >
                  {checkingSession ? "Checking session..." : loading ? "Please wait..." : isLogin ? "Sign In" : "Create Account"}
                </button>
              </form>

              <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.035] p-4 text-center text-sm leading-6 text-zinc-400 sm:mt-5">
                {isLogin ? (
                  <>
                    New to Parapost?{" "}
                    <button
                      type="button"
                      onClick={() => switchMode("signup")}
                      className="font-black text-purple-300 hover:text-purple-200"
                    >
                      Create an account
                    </button>
                  </>
                ) : (
                  <>
                    Already verified your email?{" "}
                    <button
                      type="button"
                      onClick={() => switchMode("signin")}
                      className="font-black text-purple-300 hover:text-purple-200"
                    >
                      Go to Sign In
                    </button>
                  </>
                )}
              </div>

              <p className="mt-4 px-2 text-center text-[11px] leading-5 text-zinc-600 sm:mt-5 sm:text-xs">
                Parapost Network - the next generation social experience.
              </p>
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}
