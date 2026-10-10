import { supabase } from "@/lib/supabase";

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

  const registration =
    await navigator.serviceWorker.getRegistration("/");

  if (!registration) return;

  const subscription =
    await registration.pushManager.getSubscription();

  if (!subscription) return;

  // Attempt server cleanup before ending authentication.
  try {
    const { error } = await supabase.rpc(
      "delete_push_subscription",
      { p_endpoint: subscription.endpoint }
    );

    if (error) {
      throw new Error(
        "Could not remove this device's notification registration."
      );
    }
  } catch (error) {
    if (!options.allowServerCleanupFailure) throw error;

    // Recovery may have no valid session. Still disconnect browser push.
    console.warn("Server push cleanup failed; attempting browser cleanup.");
  }

  // Stop this browser from receiving further push messages.
  const removed = await subscription.unsubscribe();

  if (!removed) {
    throw new Error(
      "Could not disable this device's push subscription."
    );
  }

  try {
    window.sessionStorage.removeItem(
      `parapost-push-session-sync:${userId}`
    );
  } catch {
    // Browser storage cleanup is optional.
  }
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
