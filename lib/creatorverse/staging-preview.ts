export function creatorVerseStagingPreviewEnabled(): boolean {
  const localStagingPreview =
    process.env.NODE_ENV === 'development'
    && process.env.VERCEL_ENV === undefined
    && process.env.NEXT_PUBLIC_SUPABASE_URL ===
      'https://vmgelrgrtpghmvqgufzz.supabase.co';

  const hostedStagingPreview =
    process.env.VERCEL_ENV === 'preview'
    && process.env.VERCEL_GIT_COMMIT_REF === 'staging';

  return localStagingPreview || hostedStagingPreview;
}
