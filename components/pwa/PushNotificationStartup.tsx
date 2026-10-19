"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { supabase } from "@/lib/supabase";
import PushNotificationPrompt from "@/components/pwa/PushNotificationPrompt";
import { dismissPush, invalidatePush, stopDevicePush, syncDevicePush, pushCompatibilityMessage } from "./push-device";

export default function PushNotificationStartup() {
  const pathname = usePathname();
  const recovery = pathname === "/reset-password";
  const excluded = pathname === "/" || recovery;
  const [userId, setUserId] = useState("");
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const activeUser = useRef("");
  const generation = useRef(0);
  const enabling = useRef(false);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const next = session?.user.id || "";
      if (next !== activeUser.current) {
        generation.current += 1;
        invalidatePush();
        activeUser.current = next;
        setVisible(false);
        setErrorMessage("");
      }
      setUserId(next);
      if (!next) {
        // Do not await Supabase work inside its auth callback.
        void stopDevicePush().catch(() => setErrorMessage(
          "Could not disconnect phone notifications. Block notifications for this site in browser settings before sharing this device."
        ));
      }
    });
    const onStorage = (event: StorageEvent) => {
      if (event.key === `parapost-push-device-disabled:${activeUser.current}` && event.newValue === "1") {
        generation.current += 1;
        void stopDevicePush().catch(() => setErrorMessage("Could not disconnect notifications. Block this site in browser notification settings."));
      }
    };
    window.addEventListener("storage", onStorage);
    return () => {
      generation.current += 1;
      subscription.unsubscribe();
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const started = generation.current;
    const current = () => !cancelled && generation.current === started && activeUser.current === userId;
    async function check() {
      setVisible(false);
      setErrorMessage("");
      try {
        // Recovery can replace the session before the password form completes.
        // Disconnect the previous account even though setup is excluded here.
        if (recovery) {
          await stopDevicePush();
          return;
        }
        if (excluded || !userId) return;
        const result = await syncDevicePush(userId, { isCurrent: current });
        if (current()) {
          setVisible(result === "prompt");
          if (result === "unsupported") setErrorMessage(pushCompatibilityMessage);
        }
      } catch (error) {
        if (current()) setErrorMessage(error instanceof Error ? error.message : "Phone notification setup failed. Use Notification Settings to try again.");
      }
    }
    void check();
    return () => { cancelled = true; };
  }, [userId, excluded, recovery]);

  const dismiss = () => {
    dismissPush(userId);
    setVisible(false);
  };

  const enable = async () => {
    if (!userId || enabling.current) return;
    enabling.current = true;
    const started = generation.current;
    const current = () => generation.current === started && activeUser.current === userId;
    setBusy(true);
    setErrorMessage("");
    try {
      const permission = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
      if (!current()) return;
      if (permission !== "granted") { dismiss(); return; }
      const result = await syncDevicePush(userId, { manual: true, isCurrent: current });
      if (current()) {
        setVisible(false);
        if (result !== "enabled" && result !== "disabled") setErrorMessage(result === "unsupported" ? pushCompatibilityMessage : "Could not enable notifications. Use Notification Settings to try again.");
      }
    } catch (error) {
      if (current()) setErrorMessage(error instanceof Error ? error.message : "Could not enable notifications. Use Notification Settings to try again.");
    } finally {
      enabling.current = false;
      setBusy(false);
    }
  };

  if (errorMessage && !visible) return (
    <div role="alert" className="fixed bottom-4 left-4 right-4 z-[10000] rounded-xl bg-slate-950 p-4 text-sm text-amber-200">
      {errorMessage}
    </div>
  );
  if (!visible || !userId || excluded) return null;
  return <PushNotificationPrompt onEnable={() => void enable()} onDismiss={dismiss} busy={busy} errorMessage={errorMessage} />;
}
