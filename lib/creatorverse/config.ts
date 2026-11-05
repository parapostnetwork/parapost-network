/** Independent of Groups. Hosted access is restricted to the approved staging project. */
export function isCreatorVerseTarget(value: string | undefined): boolean {
  try {
    const url = new URL(value ?? '');
    if (url.username || url.password || url.search || url.hash || url.pathname !== '/') return false;
    return (url.protocol === 'https:' && url.hostname === 'vmgelrgrtpghmvqgufzz.supabase.co' && !url.port)
      || (url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname));
  } catch { return false; }
}
export function creatorVerseEnabled(): boolean {
  const approvedStaging =
    process.env.VERCEL_ENV === 'preview' &&
    process.env.VERCEL_GIT_COMMIT_REF === 'staging';

  const approvedLocal =
    process.env.NODE_ENV === 'development' &&
    process.env.CREATORVERSE_ENABLED === 'true';

  return isCreatorVerseTarget(process.env.NEXT_PUBLIC_SUPABASE_URL)
    && (approvedStaging || approvedLocal);
}
