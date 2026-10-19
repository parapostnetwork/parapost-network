import { supabase } from "@/lib/supabase";

const lockName = "parapost-push-device";
const gateCache = "parapost-push-safety-v1";
const gatePath = "/__parapost_push_safety__";
export const pushCompatibilityMessage = "Phone notifications are paused because this browser cannot safely coordinate delivery. Update your browser, reopen Parapost, then use Notification Settings to verify this device. Web Locks support is required in both the page and service worker.";
const cleanupMessage = "Could not safely disconnect phone notifications. Block notifications for this site in your browser settings before using another account.";
let epoch = 0;
let authUser: string | undefined;
let suspended = false;
let watching = false;
let queue: Promise<unknown> = Promise.resolve();
let confirmed: { userId: string; endpoint: string; epoch: number } | null = null;
const attempted = new Set<string>();

export function pushSupported() {
  return typeof window !== "undefined" && "Notification" in window &&
    "serviceWorker" in navigator && "PushManager" in window;
}

function watchAuth() {
  if (watching) return;
  watching = true;
  supabase.auth.onAuthStateChange((_event, session) => {
    const next = session?.user.id || "";
    if (!next) {
      try { window.localStorage.removeItem("parapost-push-logout-pending"); } catch { /* Cleanup remains fail closed. */ }
    }
    if (next !== authUser) {
      const wasKnown = authUser !== undefined;
      authUser = next;
      epoch += 1;
      if (wasKnown) suspended = false;
      confirmed = null;
      attempted.clear();
    }
  });
}

export function invalidatePush() {
  epoch += 1;
  confirmed = null;
}

// Serialize startup, settings, logout and other tabs against one browser endpoint.
export function withPushLock<T>(action: () => Promise<T>): Promise<T> {
  const run = async (): Promise<T> => navigator.locks
    ? await navigator.locks.request(lockName, action)
    : await action();
  const next = queue.then(run, run);
  queue = next.catch(() => undefined);
  return next;
}

// A URL or waiting-worker message is not evidence that the active worker is safe.
// Probe the actual active instance; an older worker cannot acknowledge this protocol.
async function secureWorker(registration: ServiceWorkerRegistration) {
  const worker = registration.active;
  if (!worker || worker.state !== "activated") return null;
  return new Promise<{ locks: boolean } | null>((resolve) => {
    const channel = new MessageChannel();
    const finish = (value: { locks: boolean } | null) => {
      clearTimeout(timer);
      channel.port1.close();
      channel.port2.close();
      resolve(value);
    };
    const timer = setTimeout(() => finish(null), 2000);
    channel.port1.onmessage = (event) => {
      const value = event.data;
      finish(registration.active === worker && worker.state === "activated" &&
        value?.protocol === "parapost-push-security-v2" && typeof value.locks === "boolean"
        ? { locks: value.locks } : null);
    };
    try {
      worker.postMessage({ type: "PARAPOST_PUSH_SECURITY_STATUS", pause: !navigator.locks }, [channel.port2]);
    } catch { finish(null); }
  });
}

function flag(name: string, userId: string) {
  try {
    return window.localStorage.getItem(`parapost-push-${name}:${userId}`) === "1";
  } catch {
    return true; // Unknown device consent requires a deliberate setup action.
  }
}

export function devicePushDisabled(userId: string) {
  return flag("device-disabled", userId) || flag("intro-dismissed", userId);
}

export function dismissPush(userId: string) {
  try { window.localStorage.setItem(`parapost-push-intro-dismissed:${userId}`, "1"); } catch { /* Session UI still closes. */ }
}

async function gate(endpoint: string | null, userId = "") {
  const cache = await caches.open(gateCache);
  await cache.put(gatePath, new Response(JSON.stringify({ endpoint, userId }), {
    headers: { "Content-Type": "application/json" },
  }));
}

export async function disconnectBrowserPush(registration: ServiceWorkerRegistration, subscription: PushSubscription | null) {
  confirmed = null;
  // The worker fails closed on a missing/invalid gate, even if unsubscribe fails.
  let gateError = false;
  try { await gate(null); } catch { gateError = true; }
  let cleanupFailed = gateError;
  try {
    const notifications = await registration.getNotifications();
    notifications.forEach((notification) => notification.close());
  } catch { cleanupFailed = true; }
  try {
    if (subscription) {
      const removed = await subscription.unsubscribe();
      const remaining = await registration.pushManager.getSubscription();
      if (!removed || remaining) cleanupFailed = true;
    }
  } catch { cleanupFailed = true; }
  if (cleanupFailed) throw new Error(cleanupMessage);
}

export function stopDevicePush(userId?: string) {
  invalidatePush();
  if (userId) {
    try { window.localStorage.setItem(`parapost-push-device-disabled:${userId}`, "1"); } catch { /* Remains invalidated in memory. */ }
  }
  return withPushLock(async () => {
    if (!pushSupported()) return;
    const registration = await navigator.serviceWorker.getRegistration("/");
    if (registration) await disconnectBrowserPush(registration, await registration.pushManager.getSubscription());
  });
}

export function suspendPushForLogout(userId: string) {
  watchAuth();
  suspended = true;
  try { window.localStorage.setItem("parapost-push-logout-pending", userId); } catch { /* Local generation still blocks this tab. */ }
  invalidatePush();
}

function decodeKey(value: string): Uint8Array<ArrayBuffer> {
  const padded = value + "=".repeat((4 - value.length % 4) % 4);
  return Uint8Array.from(window.atob(padded.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0));
}

function matchesKey(subscription: PushSubscription, key: string) {
  const actual = subscription.options.applicationServerKey;
  const expected = decodeKey(key);
  return actual && actual.byteLength === expected.length && new Uint8Array(actual).every((b, i) => b === expected[i]);
}

function ownershipConflict(error: { code?: string; message?: string }) {
  return error.code === "23505" || /(?:another|different|other).*(?:user|member|account)|(?:endpoint|subscription).*already (?:registered|owned)/i.test(error.message || "");
}

function temporaryPushFailure(error: unknown) {
  if (!error || typeof error !== "object") return false;

  const value = error as {
    code?: string;
    status?: number;
    message?: string;
  };

  const status = Number(value.status ?? value.code);

  return (
    [408, 429, 500, 502, 503, 504].includes(status) ||
    /failed to fetch|fetch failed|network|connection|timeout|timed out|internal error|service unavailable/i
      .test(value.message || "")
  );
}

function failedAutomatically(userId: string) {
  try { return window.sessionStorage.getItem(`parapost-push-sync-failed:${userId}`) === "1"; } catch { return false; }
}

function markFailed(userId: string) {
  try { window.sessionStorage.setItem(`parapost-push-sync-failed:${userId}`, "1"); } catch { /* In-memory attempt guard remains. */ }
}

export type PushResult = "enabled" | "disabled" | "prompt" | "unavailable" | "unsupported";

export async function syncDevicePush(
  userId: string,
  options: { manual?: boolean; isCurrent?: () => boolean } = {}
): Promise<PushResult> {
  watchAuth();
  return withPushLock(async () => {
    if (!pushSupported() || !userId) return "unavailable";
    try {
      if (window.localStorage.getItem("parapost-push-logout-pending") === userId) return "unavailable";
    } catch { /* Device consent below fails closed for automatic setup. */ }
    const { data, error: authError } = await supabase.auth.getSession();
    const session = data.session;
    if (authError || !session || session.user.id !== userId || suspended || options.isCurrent?.() === false) return "unavailable";
    const started = epoch;
    const current = () => {
      try {
        return epoch === started && !suspended && authUser === userId &&
          options.isCurrent?.() !== false &&
          window.localStorage.getItem("parapost-push-logout-pending") !== userId;
      } catch { return !options.manual && epoch === started && !suspended && authUser === userId && options.isCurrent?.() !== false; }
    };
    const assertCurrent = () => { if (!current()) throw new Error("The signed-in account or notification preference changed. Please try again."); };
    assertCurrent();
    const registration = await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();
    if (!current()) {
      await disconnectBrowserPush(registration, subscription);
      assertCurrent();
    }
    let worker = await secureWorker(registration);
    if (!worker) {
      // Give an already downloading security update a bounded opportunity to take over.
      const pending = registration.installing || registration.waiting;
      if (pending) {
        await new Promise<void>((resolve) => {
          const done = () => {
            clearTimeout(timer);
            pending.removeEventListener("statechange", changed);
            resolve();
          };
          const changed = () => {
            if (pending.state === "activated" || pending.state === "redundant") done();
          };
          const timer = setTimeout(done, 5000);
          pending.addEventListener("statechange", changed);
          pending.postMessage({ type: "PARAPOST_PUSH_ACTIVATE_VERIFIED" });
          changed();
        });
        worker = await secureWorker(registration);
      }
    }
    if (!current()) {
      await disconnectBrowserPush(registration, subscription);
      assertCurrent();
    }
    if (!worker) {
      // The old worker ignores the gate. Disconnect before preserving anything.
      await disconnectBrowserPush(registration, subscription);
      try { registration.waiting?.postMessage({ type: "PARAPOST_PUSH_ACTIVATE_VERIFIED" }); } catch { /* Retry on reopen. */ }
      throw new Error("The notification security update is not active yet. Reopen Parapost and use Notification Settings to verify this device.");
    }
    const autoBlocked = !options.manual && devicePushDisabled(userId);
    if (Notification.permission === "denied" || autoBlocked) {
      await disconnectBrowserPush(registration, subscription);
      return "disabled";
    }
    if (navigator.locks && worker.locks && Notification.permission === "granted" && confirmed?.userId === userId && confirmed.epoch === epoch && confirmed.endpoint === subscription?.endpoint) {
      const cache = await caches.open(gateCache);
      const response = await cache.match(gatePath);
      const saved = response ? await response.json() : null;
      if (saved?.userId === userId && saved.endpoint === subscription?.endpoint) {
        assertCurrent();

        // A cached verification may be valid even when a newer
        // security worker is still waiting to activate.
        if (
          navigator.locks &&
          Notification.permission === "granted" &&
          !devicePushDisabled(userId)
        ) {
          try {
            registration.waiting?.postMessage({
              type: "PARAPOST_PUSH_ACTIVATE_VERIFIED",
            });
          } catch {
            // Worker activation can retry without disconnecting
            // this already verified subscription.
          }
        }

        return "enabled";
      }
      confirmed = null;
    }
    // Retain eligible endpoints without granting authority to unverified legacy owners.
    let previouslyVerifiedEndpoint: string | null = null;
    let legacyEndpoint: string | null = null;

    if (subscription && Notification.permission === "granted") {
      try {
        const cache = await caches.open(gateCache);
        const response = await cache.match(gatePath);
        const saved = response ? await response.json() : null;
        const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

        if (
          current() &&
          saved?.userId === userId &&
          saved.endpoint === subscription.endpoint &&
          key &&
          matchesKey(subscription, key)
        ) {
          previouslyVerifiedEndpoint = subscription.endpoint;
        } else if (
          current() &&
          !saved?.userId &&
          !saved?.endpoint &&
          key &&
          matchesKey(subscription, key)
        ) {
          // Preserve the browser endpoint, not its delivery
          // permission. Only the authenticated RPC can verify it.
          legacyEndpoint = subscription.endpoint;
        }
      } catch {
        // Unverifiable ownership is never trusted.
      }
    }

    if (!navigator.locks || !worker.locks) {
      // No opening writes or registration are permitted without browser-wide locking.
      // Closing writes can only suppress delivery, even if another tab is cleaning up.
      await gate(null);
      const { data: preferences, error: preferenceError } = await supabase.from("user_preferences")
        .select("push_notifications_enabled").eq("user_id", userId)
        .setHeader("Authorization", `Bearer ${session.access_token}`).maybeSingle();
      if (!current() || Notification.permission !== "granted" ||
          devicePushDisabled(userId) || preferences?.push_notifications_enabled === false ||
          (!previouslyVerifiedEndpoint && !legacyEndpoint)) {
        await disconnectBrowserPush(registration, subscription);
      }
      if (!current()) throw new Error("The signed-in account changed during setup.");
      if (!preferenceError && preferences?.push_notifications_enabled === false) return "disabled";
      return "unsupported";
    }

    const attemptKey = `${epoch}:${userId}`;
    if (!options.manual && (attempted.has(attemptKey) || failedAutomatically(userId))) {
      if (!previouslyVerifiedEndpoint && !legacyEndpoint) {
        await disconnectBrowserPush(registration, subscription);
      }
      return "unavailable";
    }
    attempted.add(attemptKey);
    let transientVerificationError = false;
    try {
      // No legacy session-storage endpoint is accepted as proof of ownership.
      await gate(null);
      assertCurrent();
      const { data: preferences, error: preferenceError } = await supabase.from("user_preferences")
        .select("push_notifications_enabled").eq("user_id", userId)
        .setHeader("Authorization", `Bearer ${session.access_token}`).maybeSingle();
      assertCurrent();
      if (preferenceError) {
        transientVerificationError = temporaryPushFailure(preferenceError);
        throw new Error("Could not verify notification preferences. Use Notification Settings to try again.");
      }
      if (preferences?.push_notifications_enabled === false) {
        await disconnectBrowserPush(registration, subscription);
        return "disabled";
      }
      if (!options.manual && devicePushDisabled(userId)) {
        await disconnectBrowserPush(registration, subscription);
        return "disabled";
      }
      if (Notification.permission !== "granted") {
        await disconnectBrowserPush(registration, subscription);
        return "prompt";
      }
      const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!key) throw new Error("Phone notifications are not configured for this environment.");
      let retiredEndpoint: string | null = null;
      if (subscription && !matchesKey(subscription, key)) {
        retiredEndpoint = subscription.endpoint;
        await disconnectBrowserPush(registration, subscription);
        subscription = null;
      }
      const save = async (candidate: PushSubscription) => {
        assertCurrent();
        const json = candidate.toJSON();
        if (!json.keys?.p256dh || !json.keys?.auth) throw new Error("Subscription security keys are missing.");
        // Pin the request to this session: a late request must never use the next account's token.
        try {
          const response = await supabase.rpc("save_push_subscription", {
            p_endpoint: candidate.endpoint, p_p256dh: json.keys.p256dh,
            p_auth_key: json.keys.auth, p_user_agent: navigator.userAgent || null,
          }).setHeader("Authorization", `Bearer ${session.access_token}`);

          if (response.error && temporaryPushFailure(response.error)) {
            transientVerificationError = true;
          }

          return response;
        } catch (error) {
          if (temporaryPushFailure(error)) {
            transientVerificationError = true;
          }
          throw error;
        }
      };
      const create = async () => {
        assertCurrent();
        const candidate = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: decodeKey(key) });
        subscription = candidate; // Retain for cleanup even if auth changed during subscribe.
        assertCurrent();
        if (candidate.endpoint === retiredEndpoint) throw new Error("The previous account's subscription could not be replaced. Use browser notification settings to reset this device.");
        return candidate;
      };
      const hadExisting = Boolean(subscription);
      if (!subscription) subscription = await create();
      let result = await save(subscription);
      assertCurrent();
      if (result.error && hadExisting) {
        const conflict = ownershipConflict(result.error);

        if (!conflict) {
          throw new Error(
            "Could not verify this device's notification registration. Use Notification Settings to try again."
          );
        }

        retiredEndpoint = subscription.endpoint;
        await disconnectBrowserPush(registration, subscription);
        subscription = null;
        assertCurrent();
        // Exactly one fresh endpoint; never reassign or delete the previous owner's row.
        subscription = await create();
        result = await save(subscription);
        assertCurrent();
      }
      if (result.error) throw new Error("This device could not be registered for your account. Its notifications have been disconnected. Try explicit setup in Notification Settings.");
      if (Notification.permission !== "granted" || (!options.manual && devicePushDisabled(userId))) throw new Error("Notification permission changed during setup.");
      assertCurrent();
      const { data: latest, error: latestError } = await supabase.auth.getSession();
      assertCurrent();
      if (latestError || latest.session?.user.id !== userId) throw new Error("The signed-in account changed during setup.");
      await gate(subscription.endpoint, userId);
      assertCurrent();
      confirmed = { userId, endpoint: subscription.endpoint, epoch };

      // Activate a waiting worker only after verification.
      registration.waiting?.postMessage({
        type: "PARAPOST_PUSH_ACTIVATE_VERIFIED",
      });
      if (options.manual) {
        try {
          window.localStorage.removeItem(`parapost-push-device-disabled:${userId}`);
          window.localStorage.removeItem(`parapost-push-intro-dismissed:${userId}`);
          window.sessionStorage.removeItem(`parapost-push-sync-failed:${userId}`);
        } catch { /* Current successful setup remains valid in memory. */ }
      }
      return "enabled";
    } catch (error) {
      if (current()) markFailed(userId);
      else attempted.delete(attemptKey);

      let preserve = Boolean(
        transientVerificationError &&
        previouslyVerifiedEndpoint &&
        current() &&
        Notification.permission === "granted" &&
        !devicePushDisabled(userId) &&
        subscription?.endpoint === previouslyVerifiedEndpoint
      );

      if (preserve) {
        try {
          const active =
            await registration.pushManager.getSubscription();

          const {
            data: latest,
            error: latestError
          } = await supabase.auth.getSession();

          preserve = Boolean(
            active?.endpoint === previouslyVerifiedEndpoint &&
            !latestError &&
            latest.session?.user.id === userId &&
            current()
          );

          // Keep the endpoint, but never restore display authority after failed verification.
          if (preserve) await gate(null);
        } catch {
          preserve = false;
        }
      }

      let preserveLegacy = Boolean(
        transientVerificationError &&
        legacyEndpoint &&
        current() &&
        subscription?.endpoint === legacyEndpoint &&
        Notification.permission === "granted" &&
        !devicePushDisabled(userId)
      );

      if (preserveLegacy) {
        try {
          const active = await registration.pushManager.getSubscription();
          const { data: latest, error: latestError } =
            await supabase.auth.getSession();

          preserveLegacy = Boolean(
            active?.endpoint === legacyEndpoint &&
            !latestError &&
            latest.session?.user.id === userId &&
            current()
          );
        } catch {
          preserveLegacy = false;
        }
      }

      // Never reopen the verification gate for a legacy
      // endpoint whose authenticated registration failed.
      if (!preserve && !preserveLegacy) {
        await disconnectBrowserPush(registration, subscription);
      }

      throw error;
    }
  });
}
