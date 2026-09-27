import { supabase } from "@/lib/supabase";

type ScheduledShow = { id: string; status: string | null; scheduled_at: string | null; visibility: string | null; is_hidden: boolean | null };

export async function startDueShows<T extends ScheduledShow>(rows: T[]): Promise<T[]> {
  const due = rows.filter(row => row.status === "upcoming" && row.visibility === "public" && row.is_hidden === false && row.scheduled_at && Date.parse(row.scheduled_at) <= Date.now()).slice(0, 5);
  if (!due.length) return rows;
  const { data } = await supabase.auth.getSession();
  if (!data.session) return rows;
  const changes = new Map<string, Partial<T>>();
  await Promise.all(due.map(async row => {
    try {
      const result = await fetch("/api/live/start", {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session.access_token}` },
        body: JSON.stringify({ id: row.id }), signal: AbortSignal.timeout(10000),
      });
      if (!result.ok) return;
      const { stream } = await result.json();
      if (stream?.id === row.id) changes.set(row.id, stream);
    } catch { /* Retry on the next refresh; keep the last known database state. */ }
  }));
  return rows.map(row => ({ ...row, ...changes.get(row.id) }));
}
