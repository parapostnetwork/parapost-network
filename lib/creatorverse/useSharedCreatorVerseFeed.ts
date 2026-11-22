
"use client";
import { communityClientTargetAllowed } from '@/lib/community/release-target';

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
  hasMore: boolean;
};

const stagingEnabled =
  communityClientTargetAllowed() &&
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
  const batchSize = Math.min(Math.max(Math.floor(limit), 1), 60);

  const [revision, setRevision] = useState(0);
  const [pageRequest, setPageRequest] = useState({
    scope,
    pages: 1
  });

  const pagesToLoad =
    pageRequest.scope === scope ? pageRequest.pages : 1;

  const [state, setState] = useState<FeedState>({
    scope: "",
    shares: [],
    loading: true,
    error: "",
    hasMore: false
  });

  const refresh = useCallback(() => {
    setRevision(value => value + 1);
  }, []);

  const loadMore = useCallback(() => {
    if (
      !stagingEnabled ||
      state.scope !== scope ||
      state.loading ||
      !state.hasMore
    ) return;

    setPageRequest(previous => ({
      scope,
      pages: previous.scope === scope ? previous.pages + 1 : 2
    }));
  }, [scope, state.scope, state.loading, state.hasMore]);

  useEffect(() => {
    if (!stagingEnabled) return;

    let active = true;
    let sequence = 0;

    async function reload() {
      const current = ++sequence;

      setState(previous => previous.scope === scope
        ? { ...previous, loading: true, error: "" }
        : {
            scope,
            shares: [],
            loading: true,
            error: "",
            hasMore: false
          }
      );

      try {
        const { data: auth, error: authError } =
          await supabase.auth.getSession();

        if (!active || current !== sequence) return;

        if (authError || !auth.session?.user) {
          setState({
            scope,
            shares: [],
            loading: false,
            error: "",
            hasMore: false
          });
          return;
        }

        const shares: SharedCreatorVersePost[] = [];
        const seen = new Set<string>();
        let hasMore = false;

        for (let page = 0; page < pagesToLoad; page++) {
          const { data, error } = await supabase.rpc(
            "creatorverse_shared_feed",
            {
              p_sharer_id: sharerId,
              p_limit: batchSize,
              p_offset: page * batchSize
            }
          );

          if (!active || current !== sequence) return;
          if (error) throw error;

          const rows: unknown[] = Array.isArray(data) ? data : [];
          hasMore = rows.length === batchSize;

          for (const row of rows) {
            if (!validShare(row)) continue;
            if (sharerId && row.sharer_id !== sharerId) continue;
            if (seen.has(row.share_id)) continue;

            seen.add(row.share_id);
            shares.push(row);
          }

          if (!hasMore) break;
        }

        setState({
          scope,
          shares,
          loading: false,
          error: "",
          hasMore
        });
      } catch {
        if (active && current === sequence) {
          setState({
            scope,
            shares: [],
            loading: false,
            error: "CreatorVerse shares could not be loaded.",
            hasMore: false
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
          error: "",
          hasMore: false
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
  }, [scope, sharerId, batchSize, pagesToLoad, revision]);

  const current = stagingEnabled && state.scope === scope;

  return {
    shares: current ? state.shares : [],
    loading: stagingEnabled &&
      (!current || state.loading),
    error: current ? state.error : "",
    hasMore: current && state.hasMore,
    loadingMore: current &&
      state.loading &&
      pagesToLoad > 1,
    loadMore,
    refresh
  };
}
