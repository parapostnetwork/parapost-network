// Replace the unrestricted worker immediately; activation never grants ownership.
async function activateSecureWorker() {
  // The previous worker displayed notifications without
  // verifying the intended recipient.
  //
  // Never leave that worker active while legacy account
  // verification is pending.
  //
  // Activation does not grant notification-display permission.
  // The push handler still requires a verified account,
  // matching subscription endpoint, matching recipient,
  // and safe cross-context coordination.
  //
  // Without Web Locks, notification display remains
  // disabled until a secure compatibility path exists.
  await self.skipWaiting();
}

self.addEventListener("install", (event) => {
  event.waitUntil(activateSecureWorker());
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "PARAPOST_PUSH_SECURITY_STATUS") {
    const reply = async () => {
      if (event.data.pause) {
        const cache = await caches.open("parapost-push-safety-v1");
        await cache.put("/__parapost_push_safety__", new Response(JSON.stringify({ endpoint: null, userId: "" })));
        const notifications = await self.registration.getNotifications();
        notifications.forEach(notification => notification.close());
      }
      event.ports?.[0]?.postMessage({
        protocol: "parapost-push-security-v2",
        locks: Boolean(self.navigator.locks),
      });
    };
    // A page lacking locks asks the worker to drain any in-flight display first.
    // Never acquire this lock for ordinary probes: the supported page holds it.
    event.waitUntil(event.data.pause && self.navigator.locks
      ? self.navigator.locks.request("parapost-push-device", reply)
      : reply());
    return;
  }

  if (
    event.data?.type !==
    "PARAPOST_PUSH_ACTIVATE_VERIFIED"
  ) return;

  event.waitUntil(activateSecureWorker());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    // Remove notifications that the unrestricted predecessor may have displayed.
    const notifications = await self.registration.getNotifications();
    notifications.forEach(notification => notification.close());
    await self.clients.claim();
  })());
});

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let data = {};

  try {
    data = event.data.json();
  } catch {
    data = {
      body: event.data.text(),
    };
  }

  const title = data.title || "Parapost Network";

  const options = {
    body: data.body || "You have a new Parapost update.",
    icon: data.icon || "/icons/parapost-192.png",
    badge: data.badge || "/icons/parapost-notification-badge.png",
    data: {
      url: data.url || "/notifications",
    },
  };

  // Registration opens this gate only after the current account's RPC succeeds.
  // Missing storage, cleanup failures, sign-outs and opt-outs fail closed.
  const showIfVerified = async () => {
    try {
      const cache = await caches.open("parapost-push-safety-v1");
      const response = await cache.match("/__parapost_push_safety__");
      const verified = response ? await response.json() : null;
      if (!verified?.endpoint || !verified.userId || data.recipientUserId !== verified.userId) return;
      const subscription = await self.registration.pushManager.getSubscription();
      if (!subscription || subscription.endpoint !== verified.endpoint) return;
      await self.registration.showNotification(title, options);
    } catch {
      // Never show an unverified payload when browser state is unavailable.
    }
  };
  event.waitUntil(
    self.navigator.locks
      ? self.navigator.locks.request("parapost-push-device", showIfVerified)
      : Promise.resolve()
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const targetUrl = event.notification.data?.url || "/notifications";

  event.waitUntil(
    self.clients
      .matchAll({
        type: "window",
        includeUncontrolled: true,
      })
      .then((clientList) => {
        for (const client of clientList) {
          if ("navigate" in client) {
            client.navigate(targetUrl);
          }

          if ("focus" in client) {
            return client.focus();
          }
        }

        if (self.clients.openWindow) {
          return self.clients.openWindow(targetUrl);
        }
      })
  );
});