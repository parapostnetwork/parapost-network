const LIVE_REPLAY_DELAY_MS = 6 * 60 * 60 * 1000;
type Env = (name: string) => string | undefined;
const select = "id,status,scheduled_at,started_at,ended_at,updated_at";

// Preserve the manager's scheduled-start behavior without requiring its owner
// to open the manager. Authentication and scheduled-time eligibility are checked
// server-side; clients cannot supply a status, timestamp or arbitrary update.
export function createScheduledStartHandler(env: Env, fetcher: typeof fetch = fetch, now = () => Date.now()) {
  return async (request: Request) => {
    if (request.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405 });
    const authorization = request.headers.get("authorization");
    if (!authorization?.startsWith("Bearer ")) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const url = env("NEXT_PUBLIC_SUPABASE_URL");
    const anon = env("NEXT_PUBLIC_SUPABASE_ANON_KEY");
    const service = env("SUPABASE_SERVICE_ROLE_KEY")?.trim();
    if (!url || !anon || !service) return Response.json({ error: "Live start unavailable" }, { status: 503 });
    try {
      const body = await request.json();
      if (typeof body?.id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.id)) {
        return Response.json({ error: "Invalid show" }, { status: 400 });
      }
      const base = url.replace(/\/$/, "");
      const userHeaders = { apikey: anon, Authorization: authorization };
      const auth = await fetcher(`${base}/auth/v1/user`, { headers: userHeaders, signal: AbortSignal.timeout(10000) });
      if (!auth.ok || !(await auth.json())?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });
      const query = new URLSearchParams({ id: `eq.${body.id}`, visibility: "eq.public", is_hidden: "eq.false", select });
      const table = `${base}/rest/v1/live_streams`;
      const read = await fetcher(`${table}?${query}`, { headers: userHeaders, signal: AbortSignal.timeout(10000) });
      if (!read.ok) return Response.json({ error: "Cannot read show" }, { status: 403 });
      const [row] = await read.json();
      if (!row) return Response.json({ stream: null });
      const scheduled = row.scheduled_at ? Date.parse(row.scheduled_at) : NaN;
      const currentTime = now();
      const expired = Number.isFinite(scheduled) && currentTime >= scheduled + LIVE_REPLAY_DELAY_MS;
      if (!["upcoming", "live"].includes(row.status) || !Number.isFinite(scheduled) || scheduled > currentTime || (row.status === "live" && !expired)) return Response.json({ stream: row });
      query.set("status", `eq.${row.status}`);
      query.set("scheduled_at", `eq.${row.scheduled_at}`);
      query.set("updated_at", row.updated_at ? `eq.${row.updated_at}` : "is.null");
      const update = await fetcher(`${table}?${query}`, {
        method: "PATCH", signal: AbortSignal.timeout(10000),
        headers: { apikey: service, ...(!service.startsWith("sb_secret_") ? { Authorization: `Bearer ${service}` } : {}), "Content-Type": "application/json", Prefer: "return=representation" },
        body: JSON.stringify({ status: expired ? "ended" : "live", started_at: row.started_at || row.scheduled_at, ended_at: expired ? new Date(scheduled + LIVE_REPLAY_DELAY_MS).toISOString() : null, updated_at: new Date(currentTime).toISOString() }),
      });
      if (!update.ok) {
        // Log only an allowlisted category/status, never credentials or response bodies.
        let reason = "backend_rejected";
        try {
          const failure = await update.json();
          const message = String(failure?.message || "").toLowerCase();
          if (message.includes("invalid api key") || message.includes("unregistered api key")) reason = "invalid_api_key";
          else if (message.includes("jwt")) reason = "invalid_jwt";
          else if (message.includes("permission")) reason = "permission_denied";
        } catch { /* Keep the generic category. */ }
        console.error("Live status synchronization rejected", { status: update.status, reason });
        return Response.json({ error: "Cannot synchronize show" }, { status: 502 });
      }
      const [updated] = await update.json();
      return Response.json({ stream: updated || null });
    } catch {
      return Response.json({ error: "Live start unavailable" }, { status: 502 });
    }
  };
}
