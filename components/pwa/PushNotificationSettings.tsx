"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type PushNotificationSettingsProps = {
  currentUserId: string;
  accountPushEnabled: boolean;
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
  accountPushEnabled,
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

  const blocked = supportState === "supported" && permission === "denied";

  // Device setup appears only when the account allows push
  // and this device does not already have a subscription.
  if (
    !currentUserId ||
    !accountPushEnabled ||
    enabled ||
    supportState === "checking"
  ) {
    return null;
  }

  return (
    <div
      id="phone-notifications"
      className="w-full border-t border-purple-200/15 pt-3"
    >
      <p className="text-sm leading-6 text-slate-300">
        To receive push alerts here, allow Parapost notifications on this device.
      </p>

      {supportState === "supported" && !blocked ? (
        <button
          type="button"
          onClick={handleEnable}
          disabled={busy}
          className="mt-4 min-h-11 rounded-full bg-purple-500 px-5 py-2.5 text-sm font-black text-white transition hover:bg-purple-600 disabled:opacity-50"
        >
          {busy
            ? "Setting Up..."
            : "Enable Notifications on This Device"}
        </button>
      ) : null}

      {blocked ? (
        <p className="mt-3 text-sm text-amber-200">
          Notifications are blocked on this device.
          Allow Parapost notifications in your browser or device settings.
        </p>
      ) : null}

      {supportState === "unsupported" ? (
        <p className="mt-3 text-sm text-slate-400">
          This device or browser does not support push notifications.
        </p>
      ) : null}

      {statusMessage ? (
        <p className="mt-3 text-sm text-emerald-200">
          {statusMessage}
        </p>
      ) : null}

      {errorMessage ? (
        <p className="mt-3 text-sm text-red-200">
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}
