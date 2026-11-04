export function creatorVerseStagingPreviewEnabled(): boolean {
  return process.env.VERCEL_ENV === 'preview'
    && process.env.VERCEL_GIT_COMMIT_REF === 'staging';
}
