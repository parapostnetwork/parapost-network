// Keep the order of mounted Reels during live updates. Prepending newly
// uploaded Reels would move the scroll position away from the playing Reel.
export function mergeReelRefresh<T extends { id: string }>(current: T[], incoming: T[]): T[] {
  const remaining = new Map(incoming.map((reel) => [reel.id, reel]));
  const merged: T[] = [];
  for (const reel of current) {
    const updated = remaining.get(reel.id);
    if (updated) {
      merged.push(updated);
      remaining.delete(reel.id);
    }
  }
  return [...merged, ...remaining.values()];
}

export function resolveActiveReel(
  currentId: string,
  incoming: readonly { id: string }[],
  preferredId = "",
): string {
  if (preferredId && incoming.some((reel) => reel.id === preferredId)) return preferredId;
  if (incoming.some((reel) => reel.id === currentId)) return currentId;
  return incoming[0]?.id || "";
}
