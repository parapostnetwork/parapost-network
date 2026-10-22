/** Hard stop for production, independent of the feature flags. */
export function isGroupsTestTarget(value: string | undefined): boolean {
  try {
    const url = new URL(value ?? '');
    return (url.protocol === 'https:' && url.hostname === 'vmgelrgrtpghmvqgufzz.supabase.co' && !url.port)
      || (url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname));
  } catch { return false; }
}
export function groupsNavigationEnabled(): boolean {
  return process.env.NEXT_PUBLIC_GROUPS_ENABLED === 'true'
    && isGroupsTestTarget(process.env.NEXT_PUBLIC_SUPABASE_URL);
}
export function groupsServerEnabled(): boolean {
  return process.env.GROUPS_ENABLED === 'true' && groupsNavigationEnabled();
}
