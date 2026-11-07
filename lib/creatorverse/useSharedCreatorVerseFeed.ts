
"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export type SharedCreatorVersePost = {
  share_id: string;
  post_id: string;
  page_id: string;
  sharer_id: string;
  shared_at: string;
  caption: string | null;
  page_name: string;
  original_content: string;
  original_author_id: string;
  original_created_at: string;
};

type FeedState = {
  scope: string;
  shares: SharedCreatorVersePost[];
  loading: boolean;
  error: string;
};

const stagingEnabled =
  process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "") ===
    "https://vmgelrgrtpghmvqgufzz.supabase.co" &&
  process.env.NEXT_PUBLIC_CREATORVERSE_SOCIAL_UI_ENABLED === "true";

function validShare(value: unknown): value is SharedCreatorVersePost {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const row = value as Record<string, unknown>;

  return [
    "share_id",
    "post_id",
    "page_id",
    "sharer_id",
    "shared_at",
    "page_name",
    "original_author_id",
    "original_created_at"
  ].every(key => typeof row[key] === "string") &&
    typeof row.original_content === "string" &&
    (row.caption === null || typeof row.caption === "string");
}

export function useSharedCreatorVerseFeed(
  sharerId: string | null,
  limit = 60
) {
  const scope = JSON.stringify([sharerId, limit]);
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<FeedState>({
    scope: "",
    shares: [],
    loading: true,
    error: ""
  });

  const refresh = useCallback(() => {
    setRevision(value => value + 1);
  }, []);

  useEffect(() => {
    if (!stagingEnabled) return;

    let active = true;
    let sequence = 0;

    async function reload() {
      const current = ++sequence;

      try {
        const { data: auth, error: authError } =
          await supabase.auth.getSession();

        if (!active || current !== sequence) return;

        if (authError || !auth.session?.user) {
          setState({
            scope,
            shares: [],
            loading: false,
            error: ""
          });
          return;
        }

        const { data, error } = await supabase.rpc(
          "creatorverse_shared_feed",
          {
            p_sharer_id: sharerId,
            p_limit: Math.min(Math.max(limit, 1), 60),
            p_offset: 0
          }
        );

        if (!active || current !== sequence) return;

        if (error) throw error;

        const shares = (Array.isArray(data) ? data : [])
          .filter(validShare)
          .filter(share =>
            !sharerId || share.sharer_id === sharerId
          );

        setState({
          scope,
          shares,
          loading: false,
          error: ""
        });

      } catch {
        if (active && current === sequence) {
          setState({
            scope,
            shares: [],
            loading: false,
            error: "CreatorVerse shares could not be loaded."
          });
        }
      }
    }

    void reload();

    const { data: subscription } =
      supabase.auth.onAuthStateChange(() => {
        void reload();
      });

    const onRefresh = () => {
      if (document.visibilityState === "visible") {
        void reload();
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        sequence++;
        setState({
          scope,
          shares: [],
          loading: true,
          error: ""
        });
      } else {
        void reload();
      }
    };

    window.addEventListener("focus", onRefresh);
    window.addEventListener(
      "parapost-creatorverse-shared",
      onRefresh
    );
    document.addEventListener(
      "visibilitychange",
      onVisibility
    );

    const timer = window.setInterval(onRefresh, 30000);

    return () => {
      active = false;
      sequence++;

      subscription.subscription.unsubscribe();
      window.clearInterval(timer);
      window.removeEventListener("focus", onRefresh);
      window.removeEventListener(
        "parapost-creatorverse-shared",
        onRefresh
      );
      document.removeEventListener(
        "visibilitychange",
        onVisibility
      );
    };
  }, [scope, sharerId, limit, revision]);

  return {
    shares:
      stagingEnabled && state.scope === scope
        ? state.shares
        : [],
    loading:
      stagingEnabled &&
      (state.scope !== scope || state.loading),
    error:
      stagingEnabled && state.scope === scope
        ? state.error
        : "",
    refresh
  };
}
