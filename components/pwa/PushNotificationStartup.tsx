"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { supabase } from "@/lib/supabase";
import PushNotificationPrompt from "@/components/pwa/PushNotificationPrompt";

const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

function decodeVapidKey(value: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");

  return Uint8Array.from(
    window.atob(base64),
    (character) => character.charCodeAt(0)
  );
}

function matchesCurrentKey(subscription: PushSubscription): boolean {
  if (!vapidPublicKey) return false;

  const existing = subscription.options.applicationServerKey;
  if (!existing) return false;

  const actual = new Uint8Array(existing);
  const expected = decodeVapidKey(vapidPublicKey);

  return (
    actual.length === expected.length &&
    actual.every((byte, index) => byte === expected[index])
  );
}

async function saveSubscription(subscription: PushSubscription) {
  const json = subscription.toJSON();

  if (!json.keys?.p256dh || !json.keys?.auth) {
    throw new Error("Subscription security keys are missing.");
  }

  const { error } = await supabase.rpc("save_push_subscription", {
    p_endpoint: subscription.endpoint,
    p_p256dh: json.keys.p256dh,
    p_auth_key: json.keys.auth,
    p_user_agent: navigator.userAgent || null,
  });

  if (error) throw new Error(error.message);
}

async function registerDevice(
  registration: ServiceWorkerRegistration,
  existing: PushSubscription | null,
  isCurrentUser: () => boolean
): Promise<PushSubscription> {
  if (!isCurrentUser()) {
    throw new Error("Signed-in account changed during setup.");
  }

  if (!vapidPublicKey) {
    throw new Error("Notifications are not configured.");
  }

  let subscription = existing;
  let oldEndpoint: string | null = null;

  if (subscription && !matchesCurrentKey(subscription)) {
    oldEndpoint = subscription.endpoint;

    if (!(await subscription.unsubscribe())) {
      throw new Error("Could not renew the previous subscription.");
    }

    subscription = null;
  }

  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: decodeVapidKey(vapidPublicKey),
    });
  }

  if (!isCurrentUser()) {
    throw new Error("Signed-in account changed during setup.");
  }

  await saveSubscription(subscription);

  if (
    isCurrentUser() &&
    oldEndpoint &&
    oldEndpoint !== subscription.endpoint
  ) {
    const { error } = await supabase.rpc(
      "delete_push_subscription",
      { p_endpoint: oldEndpoint }
    );

    if (error) {
      console.warn("Old subscription cleanup warning:", error.message);
    }
  }

  return subscription;
}

function readLocalFlag(key: string): boolean {
  try {
    return window.localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

export default function PushNotificationStartup() {
  const pathname = usePathname();
  const [userId, setUserId] = useState("");
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const activeUserRef = useRef("");

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const nextUserId = session?.user?.id || "";

      activeUserRef.current = nextUserId;
      setUserId(nextUserId);

      if (!nextUserId) setVisible(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    let cancelled = false;
    setVisible(false);
    setErrorMessage("");

    async function checkDevice() {
      if (
        pathname === "/" ||
        pathname === "/reset-password" ||
        !userId ||
        !vapidPublicKey ||
        !("Notification" in window) ||
        !("serviceWorker" in navigator) ||
        !("PushManager" in window)
      ) {
        return;
      }

      const { data, error } = await supabase
        .from("user_preferences")
        .select("push_notifications_enabled")
        .eq("user_id", userId)
        .maybeSingle();

      if (
        cancelled ||
        activeUserRef.current !== userId ||
        error ||
        data?.push_notifications_enabled === false
      ) {
        return;
      }

      let registration: ServiceWorkerRegistration;

      try {
        registration = await navigator.serviceWorker.ready;
      } catch {
        return;
      }

      const subscription = await registration.pushManager.getSubscription();

      if (cancelled || activeUserRef.current !== userId) return;

      // Respect an earlier Not Now or device opt-out before any sync.
      const dismissedKey = `parapost-push-intro-dismissed:${userId}`;
      const disabledKey = `parapost-push-device-disabled:${userId}`;

      if (
        Notification.permission === "denied" ||
        readLocalFlag(dismissedKey) ||
        readLocalFlag(disabledKey)
      ) {
        return;
      }

      if (
        subscription &&
        matchesCurrentKey(subscription) &&
        Notification.permission === "granted"
      ) {
        const syncKey = `parapost-push-session-sync:${userId}`;

        try {
          if (
            window.sessionStorage.getItem(syncKey) !== subscription.endpoint
          ) {
            await saveSubscription(subscription);
            window.sessionStorage.setItem(syncKey, subscription.endpoint);
          }
        } catch (syncError) {
          console.warn("Automatic push sync warning:", syncError);
        }

        return;
      }

      if (subscription && Notification.permission === "granted") {
        try {
          await registerDevice(
            registration,
            subscription,
            () => !cancelled && activeUserRef.current === userId
          );
          return;
        } catch (renewError) {
          console.warn("Automatic push renewal warning:", renewError);
        }
      }

      if (!cancelled && activeUserRef.current === userId) {
        setVisible(true);
      }
    }

    void checkDevice().catch((error) => {
      console.warn("Push startup check warning:", error);
    });

    return () => {
      cancelled = true;
    };
  }, [userId, pathname]);

  const dismiss = () => {
    try {
      window.localStorage.setItem(
        `parapost-push-intro-dismissed:${userId}`,
        "1"
      );
    } catch {
      // The invitation can still be dismissed for this session.
    }

    setVisible(false);
  };

  const enable = async () => {
    if (!userId || busy) return;

    setBusy(true);
    setErrorMessage("");

    try {
      const permission =
        Notification.permission === "granted"
          ? "granted"
          : await Notification.requestPermission();

      if (permission !== "granted") {
        dismiss();
        return;
      }

      // Recheck the saved account preference before registering this device.
      const { data: preferences, error: preferenceError } = await supabase
        .from("user_preferences")
        .select("push_notifications_enabled")
        .eq("user_id", userId)
        .maybeSingle();

      if (preferenceError) {
        throw new Error("Could not verify notification preferences.");
      }

      if (
        activeUserRef.current !== userId ||
        preferences?.push_notifications_enabled === false
      ) {
        setVisible(false);
        return;
      }

      const registration = await navigator.serviceWorker.ready;
      const existing = await registration.pushManager.getSubscription();

      if (activeUserRef.current !== userId) return;

      const subscription = await registerDevice(
        registration,
        existing,
        () => activeUserRef.current === userId
      );

      try {
        window.localStorage.removeItem(
          `parapost-push-intro-dismissed:${userId}`
        );
        window.localStorage.removeItem(
          `parapost-push-device-disabled:${userId}`
        );
        window.sessionStorage.setItem(
          `parapost-push-session-sync:${userId}`,
          subscription.endpoint
        );
      } catch {
        // Successful registration does not depend on local storage.
      }

      setVisible(false);
    } catch (error) {
      console.warn("Push device setup warning:", error);
      setErrorMessage(
        "We couldn't enable notifications. Please try again or use Notification Settings."
      );
    } finally {
      setBusy(false);
    }
  };

  if (
    !visible ||
    !userId ||
    pathname === "/" ||
    pathname === "/reset-password"
  ) return null;

  return (
    <PushNotificationPrompt
      onEnable={() => void enable()}
      onDismiss={dismiss}
      busy={busy}
      errorMessage={errorMessage}
    />
  );
}
