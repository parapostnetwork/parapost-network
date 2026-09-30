type LikeRow = { post_id: string; user_id: string };
type LikeEvent = { eventType?: string; new?: Record<string, unknown>; old?: Record<string, unknown> };
type Snapshot = { userId: string; postIds: string[]; canRun: boolean; fullLoad: boolean };
type Options = {
  snapshot: () => Snapshot;
  read: (postIds: string[]) => Promise<{ data: LikeRow[] | null; error: unknown; count: number | null }>;
  readExact: (postId: string) => Promise<{ count: number | null; liked: boolean | null }>;
  apply: (counts: Record<string, number>, liked: Record<string, boolean>) => void;
  onError: () => void;
  schedule?: (callback: () => void, delay: number) => ReturnType<typeof setTimeout>;
  cancel?: (timer: ReturnType<typeof setTimeout>) => void;
};

// One bounded ID set and one running read per mounted user's Dashboard.
export function createLikeReconciler(options: Options) {
  const schedule = options.schedule ?? setTimeout;
  const cancel = options.cancel ?? clearTimeout;
  const owner = options.snapshot().userId;
  let disposed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let running = false;
  let version = 0;
  let mutations = 0;
  let all = false;
  const pending = new Set<string>();
  let active: string[] = [];
  let protectedIds: string[] = [];

  const current = () => !disposed && options.snapshot().userId === owner;
  function add(ids: string[]) {
    const loaded = new Set(options.snapshot().postIds);
    for (const id of pending) if (!loaded.has(id)) pending.delete(id);
    for (const id of ids) if (loaded.has(id)) pending.add(id);
  }
  function wake() {
    const state = options.snapshot();
    if (!current() || running || timer !== undefined || mutations || state.fullLoad || !state.canRun || (!all && !pending.size)) return;
    // A fixed window, not a reset-on-every-event debounce: storms cannot starve it.
    timer = schedule(() => { timer = undefined; void run(); }, 1500);
  }
  async function run() {
    const state = options.snapshot();
    if (!current() || running || mutations || state.fullLoad || !state.canRun) return;
    const loaded = new Set(state.postIds);
    const ids = all ? [...loaded] : [...pending].filter(id => loaded.has(id));
    pending.clear();
    all = false;
    if (!ids.length) return;
    running = true;
    active = ids;
    const startedVersion = version;
    try {
      const result = await options.read(ids);
      if (!current()) return;
      const latest = options.snapshot();
      if (version !== startedVersion || mutations || latest.fullLoad || !latest.canRun) {
        add(ids);
        return;
      }
      if (result.error) { options.onError(); return; }
      const counts: Record<string, number> = {};
      const liked: Record<string, boolean> = {};
      const complete = Array.isArray(result.data) && Number.isSafeInteger(result.count) &&
        result.count !== null && result.count >= 0 && result.count === result.data.length;
      if (complete) {
        for (const id of ids) { counts[id] = 0; liked[id] = false; }
        for (const row of result.data!) {
          if (!(row.post_id in counts)) continue;
          counts[row.post_id] += 1;
          if (row.user_id === owner) liked[row.post_id] = true;
        }
      } else {
        // A truncated multi-post result cannot prove which posts are complete.
        // Recount each affected post, sequentially: at most two HEADs in flight.
        for (const id of ids) {
          if (!current()) return;
          const snapshot = options.snapshot();
          if (version !== startedVersion || mutations || snapshot.fullLoad || !snapshot.canRun) {
            add(ids);
            return;
          }
          if (!snapshot.postIds.includes(id)) continue;
          try {
            const exact = await options.readExact(id);
            if (!current()) return;
            if (typeof exact.count === "number" && Number.isSafeInteger(exact.count) && exact.count >= 0) counts[id] = exact.count;
            if (typeof exact.liked === "boolean") liked[id] = exact.liked;
            if (exact.count === null || exact.liked === null) options.onError();
          } catch {
            if (current()) options.onError();
          }
        }
      }
      if (!current()) return;
      const finalSnapshot = options.snapshot();
      if (version !== startedVersion || mutations || finalSnapshot.fullLoad || !finalSnapshot.canRun) {
        add(ids);
        return;
      }
      const stillLoaded = new Set(finalSnapshot.postIds);
      for (const id of ids) if (!stillLoaded.has(id)) { delete counts[id]; delete liked[id]; }

      options.apply(counts, liked);
      protectedIds = [...new Set([...protectedIds, ...Object.keys(counts), ...Object.keys(liked)])].filter(id => stillLoaded.has(id));
    } catch {
      if (current()) options.onError();
    } finally {
      running = false;
      active = [];
      // Failure alone never creates an automatic retry loop. New events/recovery
      // and the existing full Dashboard fallback can retry.
      wake();
    }
  }
  function invalidate(ids: string[]) {
    version += 1;
    add([...active, ...ids]);
  }
  return {
    isCurrent(userId = owner) { return current() && userId === owner; },
    event(payload: LikeEvent) {
      if (!current()) return;
      const id = (row?: Record<string, unknown>) => typeof row?.post_id === "string" && row.post_id ? row.post_id : null;
      const newer = id(payload.new), older = id(payload.old);
      const ids = payload.eventType === "INSERT" ? [newer]
        : payload.eventType === "DELETE" ? [older]
        : payload.eventType === "UPDATE" ? [older, newer] : [];
      if (!ids.length || ids.some(value => !value)) all = true;
      else add(ids as string[]);
      wake();
    },
    fullStart() {
      if (!current()) return;
      invalidate([]);
      protectedIds = [];
    },
    // Existing full-load setters remain authoritative. If a late first-pass
    // write lands after a targeted read, reconcile again instead of leaving it stale.
    externalWrite() {
      if (!current()) return;
      invalidate(protectedIds);
      protectedIds = [];
      wake();
    },
    beginMutation(postId: string) {
      if (!current()) return;
      mutations += 1;
      invalidate([postId]);
    },
    endMutation(postId: string) {
      if (!current()) return;
      mutations = Math.max(0, mutations - 1);
      invalidate([postId]);
      wake();
    },
    resume() { wake(); },
    dispose() {
      disposed = true;
      version += 1;
      if (timer !== undefined) cancel(timer);
      timer = undefined;
      pending.clear();
      protectedIds = [];
    },
  };
}
