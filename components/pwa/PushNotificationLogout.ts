import { supabase } from "@/lib/supabase";
import { disconnectBrowserPush, suspendPushForLogout, withPushLock } from "./push-device";

export async function cleanupPushBeforeLogout(
  userId: string,
  options: { allowServerCleanupFailure?: boolean } = {}
): Promise<void> {
  if (
    typeof window === "undefined" ||
    !("serviceWorker" in navigator) ||
    !("PushManager" in window)
  ) {
    return;
  }

  // Invalidate in-flight registration before waiting for its browser lock.
  suspendPushForLogout(userId);
  await withPushLock(async () => {
    const registration = await navigator.serviceWorker.getRegistration("/");
    if (!registration) return;
    const subscription = await registration.pushManager.getSubscription();

    // Close the display gate and browser endpoint even with an expired session.
    // A failure still blocks the caller's sign-in/logout continuation.
    await disconnectBrowserPush(registration, subscription);
    if (!subscription) return;

    try {
      const { data, error: sessionError } = await supabase.auth.getSession();
      const session = data.session;
      if (sessionError || !session || session.user.id !== userId) throw new Error("No matching session for server push cleanup.");
      const { error } = await supabase.rpc("delete_push_subscription", {
        p_endpoint: subscription.endpoint,
      }).setHeader("Authorization", `Bearer ${session.access_token}`);
      if (error) throw new Error("Could not remove this device's notification registration.");
    } catch (error) {
      if (!options.allowServerCleanupFailure) throw error;
      // Recovery may have no valid session. The browser is already disconnected.
      console.warn("Server push cleanup failed; browser push disconnected.");
    }
    try {
      window.sessionStorage.removeItem(`parapost-push-session-sync:${userId}`);
    } catch { /* Browser storage cleanup is optional. */ }
  });
}

export async function clearLocalAuthSessionWithPushCleanup(): Promise<void> {
  let userId = "";

  try {
    const { data } = await supabase.auth.getSession();
    userId = data.session?.user.id || "";
  } catch {
    // An invalid session must not prevent browser push cleanup.
  }

  let pushCleanupFailed = false;

  try {
    await cleanupPushBeforeLogout(userId, {
      allowServerCleanupFailure: true,
    });
  } catch {
    pushCleanupFailed = true;
  }

  // Always attempt local sign-out, including when browser cleanup fails.
  const { error } = await supabase.auth.signOut({ scope: "local" });

  if (error) {
    throw new Error(
      "Could not clear your saved sign-in session. Please try again."
    );
  }

  if (pushCleanupFailed) {
    throw new Error(
      "Signed out, but could not disconnect this device's push notifications. Please block notifications for this site in your browser settings."
    );
  }
}
