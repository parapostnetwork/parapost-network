import test from "node:test";
import assert from "node:assert/strict";
import { syncYoutube, transition, youtubeVideoId, type Stream } from "../supabase/functions/sync-youtube-live/sync.ts";
import { canPlayPublishedStream } from "../lib/live/playback.ts";
import { createHandler } from "../supabase/functions/sync-youtube-live/handler.ts";

const start = "2026-09-26T19:00:00Z";
const end = "2026-09-26T20:00:00Z";
const row: Stream = { id: "row1", provider: "youtube", external_url: "https://youtube.com/live/abcdefghijk",
  embed_url: "https://www.youtube.com/embed/abcdefghijk", status: "upcoming", visibility: "public",
  is_hidden: false, started_at: null, ended_at: null, updated_at: "2026-09-25T12:00:00Z" };
const live = { id: "abcdefghijk", liveStreamingDetails: { actualStartTime: start } };
const config = { supabaseUrl: "https://example.supabase.co", serviceRoleKey: "test-service", youtubeApiKey: "test-youtube" };

test("published waiting-room player is available before owner edits or status changes", () => {
  assert.equal(canPlayPublishedStream(row), true);
  for (const status of ["draft", "cancelled"]) assert.equal(canPlayPublishedStream({ ...row, status }), false);
  assert.equal(canPlayPublishedStream({ ...row, visibility: "private" }), false);
  assert.equal(canPlayPublishedStream({ ...row, is_hidden: true }), false);
  assert.equal(canPlayPublishedStream({ ...row, embed_url: null }), false);
});
test("accept supported YouTube links and reject impostor hosts/channel URLs", () => {
  for (const url of ["https://youtu.be/abcdefghijk?t=3", "https://youtube.com/watch?v=abcdefghijk", row.external_url, row.embed_url]) {
    assert.equal(youtubeVideoId(url), "abcdefghijk");
  }
  for (const url of ["https://evil-youtube.com/watch?v=abcdefghijk", "https://youtube.com/@channel/live", "garbage", null]) {
    assert.equal(youtubeVideoId(url), null);
  }
});
test("YouTube's actual start automatically promotes an upcoming show", () => {
  assert.deepEqual(transition(row, live), { status: "live", started_at: start, ended_at: null });
});
test("scheduled time passing, missing video and ordinary uploads do not invent a live status", () => {
  assert.equal(transition(row, undefined), null);
  assert.equal(transition(row, { id: live.id }), null);
  assert.equal(transition(row, { id: live.id, liveStreamingDetails: {} }), null);
});
test("actual end creates replay, including a broadcast discovered after it finished", () => {
  const ended = { id: live.id, liveStreamingDetails: { actualStartTime: start, actualEndTime: end } };
  assert.deepEqual(transition(row, ended), { status: "ended", started_at: start, ended_at: end });
  assert.deepEqual(transition({ ...row, status: "live" }, ended), { status: "ended", started_at: start, ended_at: end });
});
test("private, hidden, draft, cancelled, manually ended and non-YouTube rows stay untouched", () => {
  for (const overrides of [{ visibility: "private" }, { is_hidden: true }, { status: "draft" },
    { status: "cancelled" }, { status: "ended" }, { provider: "twitch" }]) {
    assert.equal(transition({ ...row, ...overrides }, live), null);
  }
});
test("running broadcasts are idempotent and malformed times are ignored", () => {
  assert.equal(transition({ ...row, status: "live", started_at: start }, live), null);
  assert.equal(transition(row, { id: live.id, liveStreamingDetails: { actualStartTime: "invalid" } }), null);
  assert.equal(transition(row, { id: live.id, liveStreamingDetails: { actualStartTime: end, actualEndTime: start } }), null);
});

test("background sync persists start without owner session, including concurrency guards", async () => {
  let patches = 0;
  const mock = (async (input, options) => {
    const url = new URL(String(input));
    if (url.hostname === "www.googleapis.com") {
      assert.equal(new Headers(options?.headers).get("X-Goog-Api-Key"), "test-youtube");
      return Response.json({ items: [live] });
    }
    if (options?.method === "PATCH") {
      patches++;
      for (const [key, value] of Object.entries({ status: "eq.upcoming", visibility: "eq.public",
        is_hidden: "eq.false", updated_at: `eq.${row.updated_at}`, external_url: `eq.${row.external_url}` })) {
        assert.equal(url.searchParams.get(key), value);
      }
      assert.equal(JSON.parse(String(options.body)).started_at, start);
      return Response.json([{ id: row.id }]);
    }
    return Response.json([row]);
  }) as typeof fetch;
  assert.deepEqual(await syncYoutube(config, mock), { checked: 1, videos: 1, changed: 1, conflicts: 0, dryRun: false });
  assert.equal(patches, 1);
});
test("concurrent cancellation/edit is not overwritten; dry run never writes", async () => {
  let patches = 0;
  const mock = (async (input, options) => {
    if (String(input).includes("googleapis.com")) return Response.json({ items: [live] });
    if (options?.method === "PATCH") { patches++; return Response.json([]); }
    return Response.json([row]);
  }) as typeof fetch;
  assert.equal((await syncYoutube(config, mock)).conflicts, 1);
  assert.equal((await syncYoutube(config, mock, true)).changed, 1);
  assert.equal(patches, 1);
});
test("provider failure leaves statuses untouched and does not leak the API key", async () => {
  let writes = 0;
  const mock = (async (input, options) => {
    if (options?.method === "PATCH") writes++;
    if (String(input).includes("googleapis.com")) return new Response("quota exceeded", { status: 403 });
    return Response.json([row]);
  }) as typeof fetch;
  await assert.rejects(syncYoutube(config, mock), /^Error: YouTube status check failed \(403\)$/);
  assert.equal(writes, 0);
});
test("duplicate show links share a provider lookup and every eligible show is updated", async () => {
  let youtubeCalls = 0;
  const mock = (async (input, options) => {
    if (String(input).includes("googleapis.com")) {
      youtubeCalls++;
      assert.equal(new URL(String(input)).searchParams.get("id"), live.id);
      return Response.json({ items: [live] });
    }
    if (options?.method === "PATCH") return Response.json([{ id: "matched" }]);
    return Response.json([row, { ...row, id: "row2" }]);
  }) as typeof fetch;
  assert.equal((await syncYoutube(config, mock)).changed, 2);
  assert.equal(youtubeCalls, 1);
});

test("unauthenticated cron calls and unsupported methods never reach the database", async () => {
  const handler = createHandler(() => "configured-secret", (async () => { throw new Error("must not fetch"); }) as typeof fetch);
  assert.equal((await handler(new Request("https://example.test", { method: "POST" }))).status, 401);
  assert.equal((await handler(new Request("https://example.test"))).status, 405);
});
test("missing backend configuration fails closed", async () => {
  const handler = createHandler(name => name === "LIVE_SYNC_SECRET" ? "secret" : undefined);
  assert.equal((await handler(new Request("https://example.test", {
    method: "POST", headers: { "x-live-sync-secret": "secret" },
  }))).status, 503);
});
test("pagination includes shows beyond the first database page", async () => {
  let reads = 0;
  const mock = (async (input) => {
    const url = new URL(String(input));
    if (url.hostname === "www.googleapis.com") return Response.json({ items: [live] });
    reads++;
    if (reads === 1) return Response.json(Array.from({ length: 500 }, (_, i) => ({ ...row, id: `id${i}` })));
    assert.equal(url.searchParams.get("id"), "gt.id499");
    return Response.json([{ ...row, id: "last" }]);
  }) as typeof fetch;
  const result = await syncYoutube(config, mock, true);
  assert.equal(result.checked, 501);
  assert.equal(result.changed, 501);
});
