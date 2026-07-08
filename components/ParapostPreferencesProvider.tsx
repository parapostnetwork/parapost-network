"use client";

import { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

type AccentKey =
  | "parapost-purple"
  | "mystic-blue"
  | "creator-pink"
  | "night-green"
  | "ember-gold"
  | "ghost-white";

type FontKey =
  | "parapost-default"
  | "clean-modern"
  | "rounded"
  | "bold-creator"
  | "classic-serif"
  | "minimal";

type UserPreferenceRow = {
  user_id: string;
  accent_color: string | null;
  font_style: string | null;
};

const DEFAULT_ACCENT: AccentKey = "parapost-purple";
const DEFAULT_FONT: FontKey = "parapost-default";

const FONT_FAMILY_MAP: Record<FontKey, string> = {
  "parapost-default": "var(--font-geist-sans), Arial, Helvetica, sans-serif",
  "clean-modern": "Inter, Arial, Helvetica, sans-serif",
  rounded: '"Nunito", "Avenir Next", "Segoe UI Rounded", Arial, Helvetica, sans-serif',
  "bold-creator": '"Arial Black", var(--font-geist-sans), Arial, Helvetica, sans-serif',
  "classic-serif": 'Georgia, "Times New Roman", serif',
  minimal: '"Helvetica Neue", Arial, Helvetica, sans-serif',
};

const VALID_ACCENTS: AccentKey[] = [
  "parapost-purple",
  "mystic-blue",
  "creator-pink",
  "night-green",
  "ember-gold",
  "ghost-white",
];

const VALID_FONTS: FontKey[] = [
  "parapost-default",
  "clean-modern",
  "rounded",
  "bold-creator",
  "classic-serif",
  "minimal",
];

function normalizeAccent(value?: string | null): AccentKey {
  return VALID_ACCENTS.includes(value as AccentKey) ? (value as AccentKey) : DEFAULT_ACCENT;
}

function normalizeFont(value?: string | null): FontKey {
  return VALID_FONTS.includes(value as FontKey) ? (value as FontKey) : DEFAULT_FONT;
}

function getPreferenceKey(accent: AccentKey, font: FontKey) {
  return `${accent}:${font}`;
}

function applyPreferenceAttributes(accent: AccentKey, font: FontKey) {
  if (typeof document === "undefined") return;

  const root = document.documentElement;
  root.dataset.parapostAccent = accent;
  root.dataset.parapostFont = font;
  root.style.setProperty("--parapost-user-font", FONT_FAMILY_MAP[font] || FONT_FAMILY_MAP[DEFAULT_FONT]);

  root.classList.remove(
    "parapost-font-default",
    "parapost-font-clean-modern",
    "parapost-font-rounded",
    "parapost-font-bold-creator",
    "parapost-font-classic-serif",
    "parapost-font-minimal"
  );

  if (font === "clean-modern") root.classList.add("parapost-font-clean-modern");
  else if (font === "rounded") root.classList.add("parapost-font-rounded");
  else if (font === "bold-creator") root.classList.add("parapost-font-bold-creator");
  else if (font === "classic-serif") root.classList.add("parapost-font-classic-serif");
  else if (font === "minimal") root.classList.add("parapost-font-minimal");
  else root.classList.add("parapost-font-default");
}

function isSupabaseLockError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "");

  return (
    message.includes("NavigatorLockAcquireTimeoutError") ||
    message.includes("LockAcquireTimeoutError") ||
    message.includes("lock") ||
    message.includes("steal")
  );
}

export default function ParapostPreferencesProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [accent, setAccent] = useState<AccentKey>(DEFAULT_ACCENT);
  const [font, setFont] = useState<FontKey>(DEFAULT_FONT);

  const storageKey = useMemo(() => "parapost-active-preferences", []);

  const mountedRef = useRef(false);
  const loadingRef = useRef(false);
  const pendingUserIdRef = useRef<string | null | undefined>(undefined);
  const loadTimerRef = useRef<number | null>(null);
  const scheduledUserIdRef = useRef<string | null | undefined>(undefined);
  const lastLoadedUserIdRef = useRef<string | null | undefined>(undefined);
  const lastAppliedPreferencesRef = useRef(getPreferenceKey(DEFAULT_ACCENT, DEFAULT_FONT));

  const writeCachedPreferences = useCallback(
    (nextAccent: AccentKey, nextFont: FontKey) => {
      if (typeof window === "undefined") return;

      try {
        window.localStorage.setItem(
          storageKey,
          JSON.stringify({
            accent_color: nextAccent,
            font_style: nextFont,
          })
        );
      } catch {
        // Ignore localStorage failures. The live UI should still receive the theme.
      }
    },
    [storageKey]
  );

  const applyAndStorePreferences = useCallback(
    (nextAccent: AccentKey, nextFont: FontKey, shouldStore = true) => {
      if (!mountedRef.current) return;

      const nextPreferenceKey = getPreferenceKey(nextAccent, nextFont);
      const alreadyApplied = lastAppliedPreferencesRef.current === nextPreferenceKey;

      applyPreferenceAttributes(nextAccent, nextFont);

      if (!alreadyApplied) {
        lastAppliedPreferencesRef.current = nextPreferenceKey;
        setAccent(nextAccent);
        setFont(nextFont);
      }

      if (shouldStore) {
        writeCachedPreferences(nextAccent, nextFont);
      }
    },
    [writeCachedPreferences]
  );

  const applyCachedPreferences = useCallback(() => {
    if (typeof window === "undefined") {
      applyPreferenceAttributes(DEFAULT_ACCENT, DEFAULT_FONT);
      return;
    }

    try {
      const cached = window.localStorage.getItem(storageKey);

      if (!cached) {
        applyAndStorePreferences(DEFAULT_ACCENT, DEFAULT_FONT, false);
        return;
      }

      const parsed = JSON.parse(cached) as {
        accent_color?: string;
        font_style?: string;
      };

      const cachedAccent = normalizeAccent(parsed.accent_color);
      const cachedFont = normalizeFont(parsed.font_style);

      applyAndStorePreferences(cachedAccent, cachedFont, false);
    } catch {
      applyAndStorePreferences(DEFAULT_ACCENT, DEFAULT_FONT, false);
    }
  }, [applyAndStorePreferences, storageKey]);

  const loadPreferencesForUser = useCallback(
    async (userId: string | null) => {
      if (!mountedRef.current) return;

      if (!userId) {
        lastLoadedUserIdRef.current = null;
        applyCachedPreferences();
        return;
      }

      if (lastLoadedUserIdRef.current === userId && !loadingRef.current) {
        return;
      }

      if (loadingRef.current) {
        pendingUserIdRef.current = userId;
        return;
      }

      loadingRef.current = true;

      try {
        const { data, error } = await supabase
          .from("user_preferences")
          .select("user_id, accent_color, font_style")
          .eq("user_id", userId)
          .maybeSingle();

        if (!mountedRef.current) return;

        if (error) {
          console.warn("Could not load Parapost preferences:", error.message);
          return;
        }

        const preferences = data as UserPreferenceRow | null;
        const nextAccent = normalizeAccent(preferences?.accent_color);
        const nextFont = normalizeFont(preferences?.font_style);

        lastLoadedUserIdRef.current = userId;
        applyAndStorePreferences(nextAccent, nextFont);
      } catch (error) {
        if (!isSupabaseLockError(error)) {
          console.warn("Parapost preference load failed:", error);
        }
      } finally {
        loadingRef.current = false;

        const queuedUserId = pendingUserIdRef.current;
        pendingUserIdRef.current = undefined;

        if (mountedRef.current && queuedUserId !== undefined && queuedUserId !== userId) {
          void loadPreferencesForUser(queuedUserId || null);
        }
      }
    },
    [applyAndStorePreferences, applyCachedPreferences]
  );

  const schedulePreferenceLoad = useCallback(
    (userId: string | null, delayMs = 140) => {
      if (typeof window === "undefined") return;

      if (loadTimerRef.current !== null) {
        window.clearTimeout(loadTimerRef.current);
      }

      scheduledUserIdRef.current = userId;

      loadTimerRef.current = window.setTimeout(() => {
        loadTimerRef.current = null;
        const nextUserId = scheduledUserIdRef.current;
        scheduledUserIdRef.current = undefined;
        void loadPreferencesForUser(nextUserId || null);
      }, delayMs);
    },
    [loadPreferencesForUser]
  );

  useEffect(() => {
    mountedRef.current = true;

    applyCachedPreferences();

    let cancelled = false;

    async function initializePreferences() {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (cancelled || !mountedRef.current) return;

        schedulePreferenceLoad(session?.user?.id || null, 90);
      } catch (error) {
        if (!isSupabaseLockError(error)) {
          console.warn("Initial Parapost preference session load failed:", error);
        }
      }
    }

    void initializePreferences();

    const handlePreferenceUpdate = (event: Event) => {
      const customEvent = event as CustomEvent<{
        accent_color?: string;
        font_style?: string;
      }>;

      const nextAccent = normalizeAccent(customEvent.detail?.accent_color);
      const nextFont = normalizeFont(customEvent.detail?.font_style);

      lastLoadedUserIdRef.current = undefined;
      applyAndStorePreferences(nextAccent, nextFont);
    };

    const handleStoragePreferenceUpdate = (event: StorageEvent) => {
      if (event.key !== storageKey || !event.newValue) return;

      try {
        const parsed = JSON.parse(event.newValue) as {
          accent_color?: string;
          font_style?: string;
        };

        const nextAccent = normalizeAccent(parsed.accent_color);
        const nextFont = normalizeFont(parsed.font_style);

        applyAndStorePreferences(nextAccent, nextFont, false);
      } catch {
        // Ignore malformed preference cache from another tab.
      }
    };

    window.addEventListener("parapost-preferences-updated", handlePreferenceUpdate);
    window.addEventListener("storage", handleStoragePreferenceUpdate);

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      lastLoadedUserIdRef.current = undefined;
      schedulePreferenceLoad(session?.user?.id || null, 220);
    });

    return () => {
      cancelled = true;
      mountedRef.current = false;

      if (loadTimerRef.current !== null) {
        window.clearTimeout(loadTimerRef.current);
        loadTimerRef.current = null;
      }

      scheduledUserIdRef.current = undefined;
      pendingUserIdRef.current = undefined;

      window.removeEventListener("parapost-preferences-updated", handlePreferenceUpdate);
      window.removeEventListener("storage", handleStoragePreferenceUpdate);
      subscription.unsubscribe();
    };
  }, [applyAndStorePreferences, applyCachedPreferences, schedulePreferenceLoad, storageKey]);

  useEffect(() => {
    applyPreferenceAttributes(accent, font);
  }, [accent, font]);

  return <>{children}</>;
}
