import { syncYoutube } from "./sync.ts";

export function createHandler(env: (name: string) => string | undefined, fetcher: typeof fetch = fetch) {
  return async (request: Request) => {
    if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
    const secret = env("LIVE_SYNC_SECRET");
    if (!secret || request.headers.get("x-live-sync-secret") !== secret) {
      return new Response("Unauthorized", { status: 401 });
    }
    const supabaseUrl = env("SUPABASE_URL");
    const serviceRoleKey = env("SUPABASE_SERVICE_ROLE_KEY");
    const youtubeApiKey = env("YOUTUBE_API_KEY");
    if (!supabaseUrl || !serviceRoleKey || !youtubeApiKey) {
      return Response.json({ error: "Live sync is not configured" }, { status: 503 });
    }
    try {
      // Authenticate even dry runs; return counts, never rows or credentials.
      const dryRun = new URL(request.url).searchParams.get("dry_run") === "true";
      return Response.json(await syncYoutube({ supabaseUrl, serviceRoleKey, youtubeApiKey }, fetcher, dryRun));
    } catch {
      console.error("YouTube live sync failed; inspect provider availability and configuration.");
      return Response.json({ error: "Live sync failed" }, { status: 502 });
    }
  };
}

