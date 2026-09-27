import { getLiveDisplayStatus } from "./status";
import { supabase } from "@/lib/supabase";

type ScheduledShow = { id: string; status: string | null; scheduled_at: string | null; visibility: string | null; is_hidden: boolean | null };

const retryAfter = new Map<string, number>();

export async function startDueShows<T extends ScheduledShow>(rows: T[]): Promise<T[]> {
  for (const [id, deadline] of retryAfter) if (deadline <= Date.now()) retryAfter.delete(id);
  const due = rows.filter(row => !retryAfter.has(row.id) && (row.status === "upcoming" || row.status === "live") && getLiveDisplayStatus(row) !== row.status && row.visibility === "public" && row.is_hidden === false && row.scheduled_at && Date.parse(row.scheduled_at) <= Date.now()).slice(0, 5);
  if (!due.length) return rows;
  const { data } = await supabase.auth.getSession();
  if (!data.session) return rows;
  const changes = new Map<string, Partial<T>>();
  await Promise.all(due.map(async row => {
    retryAfter.set(row.id, Date.now() + 30000);
    try {
      const result = await fetch("/api/live/start", {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session.access_token}` },
        body: JSON.stringify({ id: row.id }), signal: AbortSignal.timeout(10000),
      });
      if (!result.ok) return;
      const { stream } = await result.json();
      if (stream?.id === row.id) { changes.set(row.id, stream); retryAfter.delete(row.id); }
    } catch { /* Retry on the next refresh; keep the last known database state. */ }
  }));
  return rows.map(row => ({ ...row, ...changes.get(row.id) }));
}
