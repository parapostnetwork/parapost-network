"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";

export default function Home() {
  const [isLogin, setIsLogin] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleAuth = async () => {
    const cleanEmail = email.trim();

    if (!cleanEmail || !password) {
      alert("Please enter your email and password.");
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
          alert(error.message);
          return;
        }
      } else {
        const { data, error } = await supabase.auth.signUp({
          email: cleanEmail,
          password,
          options: {
            emailRedirectTo: "https://parapost.net",
          },
        });

        if (error) {
          alert(error.message);
          return;
        }

        if (!data.session) {
          alert("Signup successful. Check your email to confirm your account.");
          return;
        }
      }

      window.location.href = "/dashboard";
    } catch (err) {
      if (err instanceof Error) {
        alert(err.message);
      } else {
        alert("Unexpected error during authentication.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    const cleanEmail = email.trim();

    if (!cleanEmail) {
      alert("Please enter your email first.");
      return;
    }

    try {
      setLoading(true);

      const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
        redirectTo: "http://localhost:3000/reset-password",
      });

      if (error) {
        const message = error.message.toLowerCase();

        if (message.includes("rate limit")) {
          alert("Too many reset emails were sent. Please wait a few minutes and try again.");
          return;
        }

        alert(error.message);
        return;
      }

      alert("Password reset email sent. Check your email.");
    } catch (err) {
      if (err instanceof Error) {
        alert(err.message);
      } else {
        alert("Unexpected error sending reset email.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-black text-white">
      <div className="w-full max-w-md bg-zinc-900 p-8 rounded-2xl shadow-lg">
        <h1 className="text-3xl font-bold text-purple-400 text-center">
          Parapost Network
        </h1>

        <p className="text-center text-zinc-400 mt-2">
          {isLogin ? "Login to your account" : "Join the paranormal community"}
        </p>

        <div className="mt-6 flex flex-col gap-4">
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="p-3 rounded-lg bg-zinc-800 outline-none"
            autoComplete="email"
          />

          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="p-3 rounded-lg bg-zinc-800 outline-none"
            autoComplete={isLogin ? "current-password" : "new-password"}
          />

          {isLogin && (
            <button
              type="button"
              onClick={handleForgotPassword}
              disabled={loading}
              className="self-end text-sm text-purple-400 hover:text-purple-300 disabled:opacity-60"
            >
              Forgot Password?
            </button>
          )}

          <button
            onClick={handleAuth}
            disabled={loading}
            className="bg-purple-500 hover:bg-purple-400 p-3 rounded-lg font-semibold disabled:opacity-60"
          >
            {loading ? "Please wait..." : isLogin ? "Login" : "Sign Up"}
          </button>
        </div>

        <div className="text-center mt-4 text-sm text-zinc-400">
          {isLogin ? "Don’t have an account?" : "Already have an account?"}
          <button
            onClick={() => setIsLogin(!isLogin)}
            className="ml-2 text-purple-400"
            type="button"
          >
            {isLogin ? "Sign Up" : "Login"}
          </button>
        </div>
      </div>
    </main>
  );
}
