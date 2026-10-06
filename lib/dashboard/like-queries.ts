import type { SupabaseClient } from "@supabase/supabase-js";

type Client = Pick<SupabaseClient, "from">;

const LIKE_ROW_LIMIT = 1000;

export type DashboardLikeRow = {
  post_id: string;
  share_id: string | null;
  user_id: string;
};

export const dashboardLikeContextKey = (
  postId: string,
  shareId?: string | null
) => (shareId ? `share:${shareId}` : postId);

export async function queryDashboardLikes(
  client: Client,
  postIds: string[]
) {
  return await client
    .from("likes")
    .select("post_id, share_id, user_id", { count: "exact" })
    .in("post_id", postIds)
    .is("share_id", null)
    .limit(LIKE_ROW_LIMIT);
}

export async function queryExactPostLikes(
  client: Client,
  postId: string,
  userId: string
) {
  // Original-post likes always have share_id IS NULL.
  // HEAD responses return no liker rows, regardless of popularity.
  const [total, mine] = await Promise.all(
    [
      client
        .from("likes")
        .select("post_id", { count: "exact", head: true })
        .eq("post_id", postId)
        .is("share_id", null),

      client
        .from("likes")
        .select("post_id", { count: "exact", head: true })
        .eq("post_id", postId)
        .is("share_id", null)
        .eq("user_id", userId),
    ].map((query) =>
      Promise.resolve(query).catch(() => ({
        count: null,
        error: true,
      }))
    )
  );

  const validCount = (result: {
    count: number | null;
    error: unknown;
  }) =>
    !result.error &&
    typeof result.count === "number" &&
    Number.isSafeInteger(result.count) &&
    result.count >= 0;

  return {
    count: validCount(total) ? total.count : null,
    liked: validCount(mine) ? mine.count! > 0 : null,
  };
}

export async function queryDashboardSharedLikes(
  client: Client,
  shareIds: string[]
) {
  return await client
    .from("likes")
    .select("post_id, share_id, user_id", { count: "exact" })
    .in("share_id", shareIds)
    .limit(LIKE_ROW_LIMIT);
}

export async function queryExactSharedPostLikes(
  client: Client,
  shareId: string,
  userId: string
) {
  // A shared-copy like is scoped to one exact shares.id.
  const [total, mine] = await Promise.all(
    [
      client
        .from("likes")
        .select("share_id", { count: "exact", head: true })
        .eq("share_id", shareId),

      client
        .from("likes")
        .select("share_id", { count: "exact", head: true })
        .eq("share_id", shareId)
        .eq("user_id", userId),
    ].map((query) =>
      Promise.resolve(query).catch(() => ({
        count: null,
        error: true,
      }))
    )
  );

  const validCount = (result: {
    count: number | null;
    error: unknown;
  }) =>
    !result.error &&
    typeof result.count === "number" &&
    Number.isSafeInteger(result.count) &&
    result.count >= 0;

  return {
    count: validCount(total) ? total.count : null,
    liked: validCount(mine) ? mine.count! > 0 : null,
  };
}
