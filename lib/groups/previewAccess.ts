/** No opt-in flag: deployed environments can never enable the sample preview. */
export function groupsPreviewAllowed(nodeEnv: string | undefined, vercel: string | undefined, host: string | undefined) {
  return nodeEnv === 'development' && !vercel && /^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(host ?? '');
}
