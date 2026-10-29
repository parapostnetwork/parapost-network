/** Coalesce invalidations without dropping a refresh that arrives during a read. */
export function createGroupReadQueue<T>(options: {
  read: (signal: AbortSignal) => Promise<T>;
  apply: (value: T) => void;
  fail: () => void;
  loading: (value: boolean) => void;
}) {
  let disposed = false;
  let scheduled = false;
  let pending = false;
  let revision = 0;
  let controller: AbortController | null = null;

  async function run() {
    scheduled = false;
    if (disposed || controller || !pending) return;
    pending = false;
    const version = revision;
    const request = new AbortController();
    controller = request;
    options.loading(true);
    try {
      const value = await options.read(request.signal);
      if (!disposed && version === revision) options.apply(value);
    } catch {
      if (!disposed && version === revision) options.fail();
    } finally {
      if (controller === request) controller = null;
      if (!disposed) {
        if (pending) schedule();
        else options.loading(false);
      }
    }
  }
  function schedule() {
    if (scheduled || disposed) return;
    scheduled = true;
    queueMicrotask(() => { void run(); });
  }
  function invalidate() {
    revision++;
    pending = false;
    controller?.abort();
  }
  return {
    refresh() {
      if (disposed) return;
      revision++;
      pending = true;
      schedule();
    },
    invalidate,
    dispose() { disposed = true; invalidate(); },
  };
}
