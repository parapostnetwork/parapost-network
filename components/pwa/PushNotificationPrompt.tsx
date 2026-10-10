"use client";

type PushNotificationPromptProps = {
  onEnable: () => void;
  onDismiss: () => void;
  busy: boolean;
  errorMessage?: string;
};

export default function PushNotificationPrompt({
  onEnable,
  onDismiss,
  busy,
  errorMessage,
}: PushNotificationPromptProps) {
  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center overflow-y-auto bg-black/75 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="push-prompt-title"
        className="w-full max-w-sm rounded-3xl border border-purple-400/30 bg-slate-950 p-6 text-center text-white shadow-2xl"
      >
        <div className="mb-4 text-4xl" aria-hidden="true">
          🔔
        </div>

        <h2
          id="push-prompt-title"
          className="text-xl font-black"
        >
          Stay Connected with Parapost!
        </h2>

        <p className="mt-3 text-sm leading-6 text-slate-300">
          Get phone alerts for Parachat messages, friend requests,
          and activity on your posts and Reels.
        </p>

        <p className="mt-4 text-xs leading-5 text-slate-400">
          <strong className="text-purple-300">
            Safe &amp; Private:
          </strong>{" "}
          Notification permission does not grant access to your
          camera, microphone, photos, or contacts.
          You can turn notifications off anytime.
        </p>

        <p className="mt-2 text-xs text-slate-400">
          Alerts may appear on your phone's lock screen.
        </p>

        {errorMessage ? (
          <p
            role="alert"
            className="mt-4 text-sm text-rose-300"
          >
            {errorMessage}
          </p>
        ) : null}

        <button
          type="button"
          onClick={onEnable}
          disabled={busy}
          className="mt-6 min-h-12 w-full rounded-full bg-purple-600 px-5 py-3 text-sm font-black text-white transition hover:bg-purple-500 disabled:opacity-50"
        >
          {busy ? "Setting Up..." : "Enable Notifications"}
        </button>

        <button
          type="button"
          onClick={onDismiss}
          disabled={busy}
          className="mt-3 min-h-11 w-full rounded-full px-5 py-2 text-sm font-semibold text-slate-300 transition hover:text-white disabled:opacity-50"
        >
          Not Now
        </button>
      </div>
    </div>
  );
}
