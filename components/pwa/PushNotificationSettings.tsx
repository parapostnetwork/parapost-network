"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { pushSupported, stopDevicePush, syncDevicePush, pushCompatibilityMessage } from "./push-device";

type PushNotificationSettingsProps = {
  currentUserId: string;
  accountPushEnabled: boolean;
};
type SupportState = "checking" | "supported" | "unsupported" | "incompatible";

export default function PushNotificationSettings({ currentUserId, accountPushEnabled }: PushNotificationSettingsProps) {
  const [supportState, setSupportState] = useState<SupportState>("checking");
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [enabledFor, setEnabledFor] = useState("");
  const enabled = enabledFor === currentUserId && accountPushEnabled;
  const [busy, setBusy] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const active = useRef({ userId: "", allowed: false, generation: 0 });
  const enabling = useRef(false);
  const previous = useRef({ userId: "", allowed: false });

  useEffect(() => {
    const generation = active.current.generation + 1;
    active.current = { userId: currentUserId, allowed: accountPushEnabled, generation };
    const current = () => active.current.generation === generation && active.current.userId === currentUserId && active.current.allowed;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user.id !== currentUserId) {
        active.current.generation += 1;
        active.current.allowed = false;
        setEnabledFor("");
      }
    });
    const explicitlyDisabled = previous.current.userId === currentUserId && previous.current.allowed && !accountPushEnabled;
    previous.current = { userId: currentUserId, allowed: accountPushEnabled };
    async function load() {
      setEnabledFor("");
      setErrorMessage("");
      setStatusMessage("");
      if (!pushSupported()) { setSupportState("unsupported"); return; }
      setSupportState("supported");
      setPermission(Notification.permission);
      try {
        if (explicitlyDisabled) await stopDevicePush(currentUserId);
        if (!currentUserId || !accountPushEnabled) return;
        const result = await syncDevicePush(currentUserId, { isCurrent: current });
        if (current()) {
          setEnabledFor(result === "enabled" ? currentUserId : "");
          if (result === "unsupported") { setSupportState("incompatible"); setErrorMessage(pushCompatibilityMessage); }
          if (result === "unavailable") setErrorMessage("This device is not verified for your account. Select Set Up This Device to try again.");
        }
      } catch (error) {
        if (active.current.generation === generation) setErrorMessage(error instanceof Error ? error.message : "Could not verify phone notifications.");
      }
    }
    void load();
    return () => { active.current.generation += 1; subscription.unsubscribe(); };
  }, [currentUserId, accountPushEnabled]);

  const handleEnable = async () => {
    if (enabling.current || !currentUserId || !accountPushEnabled || !pushSupported()) return;
    enabling.current = true;
    const generation = active.current.generation;
    const current = () => active.current.generation === generation && active.current.userId === currentUserId && active.current.allowed;
    setStatusMessage("");
    setErrorMessage("");
    setBusy(true);
    try {
      const nextPermission = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
      if (!current()) return;
      setPermission(nextPermission);
      if (nextPermission !== "granted") throw new Error("Notification permission was not granted. Check your browser and device notification settings.");
      const result = await syncDevicePush(currentUserId, { manual: true, isCurrent: current });
      if (current()) {
        setEnabledFor(result === "enabled" ? currentUserId : "");
        if (result === "enabled") setStatusMessage("Phone notifications are now enabled on this device.");
        else if (result === "unsupported") { setSupportState("incompatible"); setErrorMessage(pushCompatibilityMessage); }
        else setErrorMessage("Notifications are disabled or the account changed. Check your saved account preferences.");
      }
    } catch (error) {
      if (current()) {
        setEnabledFor("");
        setErrorMessage(error instanceof Error ? error.message : "Could not enable phone notifications. Please try again.");
      }
    } finally {
      enabling.current = false;
      setBusy(false);
    }
  };

  const blocked = supportState === "supported" && permission === "denied";

  // Device setup appears only when the account allows push
  // and this device does not already have a subscription.
  if (
    !currentUserId ||
    (!accountPushEnabled && !errorMessage) ||
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
        {supportState === "incompatible"
          ? "Phone notifications are paused on this browser."
          : "Device setup required: This device needs permission to receive push alerts."}
      </p>

      {supportState === "supported" && !blocked && accountPushEnabled ? (
        <button
          type="button"
          onClick={handleEnable}
          disabled={busy}
          className="mt-4 min-h-11 rounded-full bg-purple-500 px-5 py-2.5 text-sm font-black text-white transition hover:bg-purple-600 disabled:opacity-50"
        >
          {busy
            ? "Setting Up..."
            : "Set Up This Device"}
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
