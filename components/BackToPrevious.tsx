"use client";

import { useRouter } from "next/navigation";

export default function BackToPrevious({
  label = "Back",
  fallbackHref = "/settings",
  alwaysUseFallback = false,
}: {
  label?: string;
  fallbackHref?: string;
  alwaysUseFallback?: boolean;
}) {
  const router = useRouter();

  const cleanLabel = label.replace(/^[←‹<]\s*/, "").trim() || "Back";

  const handleBack = () => {
    if (alwaysUseFallback) {
      router.push(fallbackHref);
      return;
    }

    if (window.history.length > 1) {
      router.back();
      return;
    }

    router.push(fallbackHref);
  };

  return (
    <button
      type="button"
      onClick={handleBack}
      className="inline-flex items-center gap-1.5 text-sm font-bold leading-none no-underline transition hover:text-white"
      style={{ color: "var(--parapost-accent-text)" }}
      aria-label={cleanLabel}
    >
      <span
        aria-hidden="true"
        className="inline-flex shrink-0 items-center text-[1.15em] leading-none"
      >
        ←
      </span>

      <span className="inline-flex items-center leading-none">
        {cleanLabel}
      </span>
    </button>
  );
}