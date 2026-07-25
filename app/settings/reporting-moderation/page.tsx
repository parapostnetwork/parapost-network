"use client";

import BackToPrevious from "@/components/BackToPrevious";

export default function ReportingModerationPage() {
  return (
    <main className="min-h-[100dvh] px-4 py-5 pb-32 text-white sm:px-6">
      <div className="mx-auto w-full max-w-4xl">
        <div className="mb-6">
          <BackToPrevious
            label="Back to Privacy & Safety"
            fallbackHref="/dashboard?menu=settings-privacy"
            alwaysUseFallback
          />
        </div>

        <section className="rounded-[28px] border border-white/10 bg-white/[0.05] p-5 shadow-2xl sm:p-8">
          <p className="mb-3 text-xs font-black uppercase tracking-[0.18em] text-purple-200">
            Safety Tools
          </p>

          <h1 className="text-4xl font-black tracking-[-0.04em] sm:text-5xl">
            Reporting & Moderation
          </h1>

          <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-300 sm:text-base">
            Report content, manage safety concerns, and learn how moderation
            decisions are handled across Parapost Network.
          </p>

          <div className="mt-8 space-y-4">
            <ModerationCard
              title="Report a user"
              description="Submit reports for harassment, impersonation, spam, or other account issues."
            />

            <ModerationCard
              title="Report content"
              description="Flag posts, comments, Reels, or media that may violate community rules."
            />

            <ModerationCard
              title="Moderation status"
              description="Review the status of reports you've submitted."
            />

            <ModerationCard
              title="Safety resources"
              description="Access reporting guidance, moderation information, and community safety tools."
            />
          </div>
        </section>
      </div>
    </main>
  );
}

function ModerationCard({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <section className="rounded-2xl border border-white/10 bg-black/25 p-4 sm:p-5">
      <h2 className="text-lg font-black">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-slate-400">{description}</p>

      <div className="mt-4">
        <span className="inline-flex rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-black text-slate-300">
          Coming soon
        </span>
      </div>
    </section>
  );
}