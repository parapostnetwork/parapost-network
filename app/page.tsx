"use client";

import { FormEvent, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type AuthMode = "signin" | "signup";

export default function Home() {
  const [authMode, setAuthMode] = useState<AuthMode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [authMessage, setAuthMessage] = useState("");
  const [authError, setAuthError] = useState("");

  const isLogin = authMode === "signin";

  const siteOrigin = useMemo(() => {
    if (typeof window === "undefined") return "https://parapost.net";
    return window.location.origin;
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
        const { error } = await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password,
        });

        if (error) {
          const lowerMessage = error.message.toLowerCase();

          if (
            lowerMessage.includes("invalid login credentials") ||
            lowerMessage.includes("email not confirmed") ||
            lowerMessage.includes("email")
          ) {
            setAuthError(
              "We could not sign you in. Make sure your email is verified, then use the Sign In tab with the same email and password."
            );
            return;
          }

          setAuthError(error.message);
          return;
        }

        window.location.href = "/dashboard";
        return;
      }

      const { data, error } = await supabase.auth.signUp({
        email: cleanEmail,
        password,
        options: {
          emailRedirectTo: siteOrigin,
        },
      });

      if (error) {
        const lowerMessage = error.message.toLowerCase();

        if (
          lowerMessage.includes("already registered") ||
          lowerMessage.includes("already")
        ) {
          setAuthError(
            "This email may already have an account. Choose Sign In instead, especially if you already verified your email."
          );
          return;
        }

        setAuthError(error.message);
        return;
      }

      if (!data.session) {
        setAuthMode("signin");
        setPassword("");
        setConfirmPassword("");
        setAuthMessage(
          "Account created. Check your email and verify your account. After verifying, come back here and use Sign In."
        );
        return;
      }

      window.location.href = "/dashboard";
    } catch (err) {
      if (err instanceof Error) {
        setAuthError(err.message);
      } else {
        setAuthError("Unexpected error during authentication.");
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

      const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
        redirectTo: `${siteOrigin}/reset-password`,
      });

      if (error) {
        const message = error.message.toLowerCase();

        if (message.includes("rate limit")) {
          setAuthError(
            "Too many reset emails were sent. Please wait a few minutes and try again."
          );
          return;
        }

        setAuthError(error.message);
        return;
      }

      setAuthMessage("Password reset email sent. Check your email for the reset link.");
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
          <div className="grid w-full max-w-6xl grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_470px] xl:gap-6">
            <section
              className="hidden xl:flex xl:flex-col xl:justify-between rounded-[32px] border border-white/10 p-8 shadow-2xl"
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

                <h1 className="mt-8 text-5xl font-black leading-[0.95] tracking-[-0.06em] text-white">
                  Share your world.
                  <br />
                  Connect your community.
                </h1>

                <p className="mt-5 max-w-xl text-base leading-7 text-zinc-300">
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
              className="w-full rounded-[24px] border border-white/10 p-4 shadow-2xl sm:rounded-[28px] sm:p-6 lg:p-7"
              style={{
                background:
                  "linear-gradient(180deg, rgba(24,27,34,0.96), rgba(12,14,19,0.98))",
                boxShadow: "0 30px 90px rgba(0,0,0,0.58)",
              }}
            >
              <div className="text-center">
                <div
                  className="mx-auto mb-3 flex h-20 w-20 items-center justify-center overflow-hidden rounded-[24px] border border-purple-300/25 sm:mb-4 sm:h-24 sm:w-24 sm:rounded-[30px]"
                  style={{
                    background:
                      "radial-gradient(circle at 50% 0%, rgba(168,85,247,0.55), rgba(124,58,237,0.20) 46%, rgba(255,255,255,0.04) 100%)",
                    boxShadow: "0 0 38px rgba(168,85,247,0.36)",
                  }}
                >
                  <img
                    src="/parapost-icon-white.png"
                    alt="Parapost Network logo"
                    className="h-12 w-12 object-contain sm:h-14 sm:w-14"
                    draggable={false}
                  />
                </div>

                <h2 className="text-[2rem] font-black tracking-[-0.05em] text-white sm:text-4xl">
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
                  className={`min-h-[48px] rounded-xl px-3 text-sm font-black transition sm:min-h-[52px] sm:text-base ${
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
                  className={`min-h-[48px] rounded-xl px-3 text-sm font-black transition sm:min-h-[52px] sm:text-base ${
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

              <form onSubmit={handleAuth} className="mt-4 flex flex-col gap-3 sm:mt-5 sm:gap-4">
                <label className="grid gap-2">
                  <span className="text-[11px] font-black uppercase tracking-[0.18em] text-zinc-500 sm:text-xs">
                    Email
                  </span>
                  <input
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    className="min-h-[54px] rounded-2xl border border-white/10 bg-zinc-950/70 px-4 text-base text-white outline-none transition placeholder:text-zinc-600 focus:border-purple-400/60 focus:ring-4 focus:ring-purple-500/10"
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
                      className="min-h-[54px] w-full rounded-2xl border border-white/10 bg-zinc-950/70 px-4 pr-20 text-base text-white outline-none transition placeholder:text-zinc-600 focus:border-purple-400/60 focus:ring-4 focus:ring-purple-500/10"
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
                        className="min-h-[54px] w-full rounded-2xl border border-white/10 bg-zinc-950/70 px-4 pr-20 text-base text-white outline-none transition placeholder:text-zinc-600 focus:border-purple-400/60 focus:ring-4 focus:ring-purple-500/10"
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
                    verified, return here and choose <strong>Sign In</strong>.
                  </div>
                ) : null}

                {isLogin ? (
                  <button
                    type="button"
                    onClick={handleForgotPassword}
                    disabled={loading}
                    className="self-end text-sm font-bold text-purple-300 hover:text-purple-200 disabled:opacity-60"
                  >
                    Forgot Password?
                  </button>
                ) : null}

                <button
                  type="submit"
                  disabled={loading}
                  className="min-h-[54px] rounded-2xl bg-purple-500 px-4 text-base font-black text-white shadow-lg shadow-purple-950/35 transition hover:bg-purple-400 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loading ? "Please wait..." : isLogin ? "Sign In" : "Create Account"}
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
                Parapost Network keeps the default purple and black identity while we
                continue building the next generation social experience.
              </p>
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}