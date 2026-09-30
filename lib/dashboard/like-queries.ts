import type { SupabaseClient } from "@supabase/supabase-js";

type Client = Pick<SupabaseClient, "from">;
const LIKE_ROW_LIMIT = 1000;

export async function queryDashboardLikes(client: Client, postIds: string[]) {
  return await client.from("likes")
    .select("post_id, user_id", { count: "exact" })
    .in("post_id", postIds)
    .limit(LIKE_ROW_LIMIT);
}

export async function queryExactPostLikes(client: Client, postId: string, userId: string) {
  // HEAD responses return no liker rows, regardless of a post's popularity.
  const [total, mine] = await Promise.all([
    client.from("likes").select("post_id", { count: "exact", head: true }).eq("post_id", postId),
    client.from("likes").select("post_id", { count: "exact", head: true }).eq("post_id", postId).eq("user_id", userId),
  ].map(query => Promise.resolve(query).catch(() => ({ count: null, error: true }))));
  const validCount = (result: { count: number | null; error: unknown }) =>
    !result.error && typeof result.count === "number" && Number.isSafeInteger(result.count) && result.count >= 0;
  return {
    count: validCount(total) ? total.count : null,
    liked: validCount(mine) ? mine.count! > 0 : null,
  };
}
