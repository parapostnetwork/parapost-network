// Membership, not result order, determines whether dependent callbacks changed.
export function preserveBlockedIds(previous: string[], next: string[]): string[] {
  const previousMembers = new Set(previous);
  const nextMembers = new Set(next);
  if (previousMembers.size === nextMembers.size && [...nextMembers].every(id => previousMembers.has(id))) {
    return previous;
  }
  return [...nextMembers];
}
