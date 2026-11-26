export const MENTION_USERNAME_PATTERN = /^[a-zA-Z0-9_]{1,30}$/;

export function extractMentionUsernames(content: string): string[] {
  const usernames = new Set<string>();
  const pattern = /(^|[^a-zA-Z0-9_@])@([a-zA-Z0-9_]{1,30})(?![a-zA-Z0-9_])/g;

  for (const match of content.matchAll(pattern)) {
    usernames.add(match[2].toLowerCase());
  }

  return [...usernames];
}

export function activeMentionAtCursor(
  content: string,
  cursor: number
): { start: number; end: number; query: string } | null {
  const before = content.slice(0, cursor);
  const match = /(^|[^a-zA-Z0-9_@])@([a-zA-Z0-9_]{0,30})$/.exec(before);

  if (!match) return null;

  const start = cursor - match[2].length - 1;

  if (content[cursor] && /[a-zA-Z0-9_]/.test(content[cursor])) {
    return null;
  }

  return { start, end: cursor, query: match[2] };
}
