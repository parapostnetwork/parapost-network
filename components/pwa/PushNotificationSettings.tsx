"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type PushNotificationSettingsProps = {
  currentUserId: string;
};

type SupportState = "checking" | "supported" | "unsupported";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);

  return Uint8Array.from(rawData, (character) => character.charCodeAt(0));
}

async function saveSubscription(subscription: PushSubscription) {
  const json = subscription.toJSON();
  const p256dh = json.keys?.p256dh;
  const authKey = json.keys?.auth;

  if (!p256dh || !authKey) {
    throw new Error("The push subscription is missing its security keys.");
  }

  const { error } = await supabase.rpc("save_push_subscription", {
    p_endpoint: subscription.endpoint,
    p_p256dh: p256dh,
    p_auth_key: authKey,
    p_user_agent: navigator.userAgent || null,
  });

  if (error) {
    throw new Error(error.message || "Could not save the push subscription.");
  }
}

export default function PushNotificationSettings({
  currentUserId,
}: PushNotificationSettingsProps) {
  const [supportState, setSupportState] = useState<SupportState>("checking");
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadPushState() {
      if (
        typeof window === "undefined" ||
        !("Notification" in window) ||
        !("serviceWorker" in navigator) ||
        !("PushManager" in window)
      ) {
        if (!cancelled) {
          setSupportState("unsupported");
          setEnabled(false);
        }
        return;
      }

      if (!cancelled) {
        setSupportState("supported");
        setPermission(Notification.permission);
      }

      try {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();

        if (cancelled) return;

        setEnabled(Boolean(subscription));

        // Keep an existing browser subscription connected to the signed-in
        // Parapost account. This does not ask for permission or create a new
        // subscription; it only refreshes the database record.
        if (
          subscription &&
          currentUserId &&
          Notification.permission === "granted"
        ) {
          try {
            await saveSubscription(subscription);
          } catch (error) {
            console.warn("Push subscription sync warning:", error);
          }
        }
      } catch (error) {
        console.warn("Push notification state check failed:", error);

        if (!cancelled) {
          setEnabled(false);
        }
      }
    }

    void loadPushState();

    return () => {
      cancelled = true;
    };
  }, [currentUserId]);

  const handleEnable = async () => {
    setStatusMessage("");
    setErrorMessage("");

    if (!currentUserId) {
      setErrorMessage("Please sign in before enabling phone notifications.");
      return;
    }

    if (
      !("Notification" in window) ||
      !("serviceWorker" in navigator) ||
      !("PushManager" in window)
    ) {
      setSupportState("unsupported");
      setErrorMessage("Phone notifications are not supported on this device or browser.");
      return;
    }

    const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

    if (!vapidPublicKey) {
      setErrorMessage("Phone notifications are not configured for this environment.");
      return;
    }

    setBusy(true);

    try {
      const nextPermission = await Notification.requestPermission();
      setPermission(nextPermission);

      if (nextPermission !== "granted") {
        setEnabled(false);

        if (nextPermission === "denied") {
          setErrorMessage(
            "Notifications are blocked for Parapost on this device. Allow notifications in your browser or app settings, then try again."
          );
        } else {
          setErrorMessage("Notification permission was not granted.");
        }

        return;
      }

      const registration = await navigator.serviceWorker.ready;

      let subscription = await registration.pushManager.getSubscription();

      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
        });
      }

      await saveSubscription(subscription);

      setEnabled(true);
      setStatusMessage("Phone notifications are now enabled on this device.");
    } catch (error) {
      console.error("Enable phone notifications error:", error);

      const message =
        error instanceof Error
          ? error.message
          : "Could not enable phone notifications. Please try again.";

      setErrorMessage(message);
      setEnabled(false);
    } finally {
      setBusy(false);
    }
  };

  const handleDisable = async () => {
    setStatusMessage("");
    setErrorMessage("");

    if (!currentUserId) {
      setErrorMessage("Please sign in before changing phone notifications.");
      return;
    }

    if (
      !("serviceWorker" in navigator) ||
      !("PushManager" in window)
    ) {
      setSupportState("unsupported");
      setEnabled(false);
      return;
    }

    setBusy(true);

    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();

      if (!subscription) {
        setEnabled(false);
        setStatusMessage("Phone notifications are already disabled on this device.");
        return;
      }

      const { error } = await supabase.rpc("delete_push_subscription", {
        p_endpoint: subscription.endpoint,
      });

      if (error) {
        throw new Error(error.message || "Could not remove the push subscription.");
      }

      await subscription.unsubscribe();

      setEnabled(false);
      setStatusMessage("Phone notifications are disabled on this device.");
    } catch (error) {
      console.error("Disable phone notifications error:", error);

      const message =
        error instanceof Error
          ? error.message
          : "Could not disable phone notifications. Please try again.";

      setErrorMessage(message);
    } finally {
      setBusy(false);
    }
  };

  const blocked = supportState === "supported" && permission === "denied";

  const buttonLabel =
    supportState === "checking"
      ? "Checking..."
      : supportState === "unsupported"
        ? "Not Supported"
        : busy
          ? enabled
            ? "Disabling..."
            : "Enabling..."
          : blocked
            ? "Notifications Blocked"
            : enabled
              ? "Disable Phone Notifications"
              : "Enable Phone Notifications";

  return (
    <section
      id="phone-notifications"
      className="rounded-[24px] border border-purple-200/15 bg-gradient-to-br from-purple-500/10 via-white/[0.055] to-slate-950/55 p-4 shadow-2xl shadow-purple-950/15 ring-1 ring-white/[0.035] sm:rounded-[28px] sm:p-6"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="m-0 text-[1.35rem] font-black tracking-[-0.03em] sm:text-2xl">
              Phone Notifications
            </h2>

            <span
              className={`rounded-full border px-2.5 py-1 text-[11px] font-black ${
                enabled
                  ? "border-emerald-300/25 bg-emerald-400/10 text-emerald-100"
                  : blocked
                    ? "border-amber-300/25 bg-amber-400/10 text-amber-100"
                    : "border-white/10 bg-white/5 text-slate-300"
              }`}
            >
              {enabled ? "On" : blocked ? "Blocked" : "Off"}
            </span>
          </div>

          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
            Receive Parapost alerts on this device even when you are not
            actively viewing the site. You stay in control and can disable
            them here at any time.
          </p>

          <div className="mt-3 flex flex-wrap gap-2">
            <span className="rounded-full border border-purple-200/15 bg-black/30 px-3 py-1.5 text-xs font-bold text-slate-300">
              Friend activity
            </span>
            <span className="rounded-full border border-purple-200/15 bg-black/30 px-3 py-1.5 text-xs font-bold text-slate-300">
              Parachat
            </span>
            <span className="rounded-full border border-purple-200/15 bg-black/30 px-3 py-1.5 text-xs font-bold text-slate-300">
              Post & Reel activity
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={enabled ? handleDisable : handleEnable}
          disabled={
            busy ||
            supportState !== "supported" ||
            !currentUserId ||
            blocked
          }
          className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-full border px-4 py-2.5 text-sm font-black transition disabled:cursor-not-allowed disabled:opacity-50"
          style={{
            borderColor: enabled
              ? "rgba(110,231,183,0.28)"
              : "var(--parapost-accent-border)",
            background: enabled
              ? "rgba(16,185,129,0.12)"
              : "linear-gradient(135deg, var(--parapost-accent-1), var(--parapost-accent-2), var(--parapost-accent-3))",
            color: enabled ? "rgb(209 250 229)" : "var(--parapost-accent-button-text)",
            boxShadow: enabled ? "none" : "0 10px 24px var(--parapost-accent-glow)",
          }}
        >
          {buttonLabel}
        </button>
      </div>

      {!currentUserId && supportState !== "checking" ? (
        <div className="mt-4 rounded-2xl border border-amber-300/20 bg-amber-300/10 p-3 text-sm leading-6 text-amber-100">
          Sign in is required to enable phone notifications.
        </div>
      ) : null}

      {supportState === "unsupported" ? (
        <div className="mt-4 rounded-2xl border border-amber-300/20 bg-amber-300/10 p-3 text-sm leading-6 text-amber-100">
          This browser or device does not support Parapost phone notifications.
        </div>
      ) : null}

      {statusMessage ? (
        <div className="mt-4 rounded-2xl border border-emerald-300/20 bg-emerald-400/10 p-3 text-sm leading-6 text-emerald-100">
          {statusMessage}
        </div>
      ) : null}

      {errorMessage ? (
        <div className="mt-4 rounded-2xl border border-rose-300/20 bg-rose-400/10 p-3 text-sm leading-6 text-rose-100">
          {errorMessage}
        </div>
      ) : null}
    </section>
  );
}
