/** Only these normalized server responses may be presented as sharing failures. */
export class ShareRequestError extends Error {
  constructor(readonly reason: 'cooldown' | 'forbidden', readonly kind?: 'group' | 'post', readonly remainingSeconds?: number) {
    super('Sharing was not completed');
    this.name = 'ShareRequestError';
  }
}

export function shareErrorFromResponse(value: unknown): ShareRequestError | null {
  if (!value || typeof value !== 'object') return null;
  const data = value as Record<string, unknown>;
  if (data.code === 'share_forbidden') return new ShareRequestError('forbidden');
  if (data.code !== 'share_cooldown' || (data.kind !== 'group' && data.kind !== 'post') ||
      typeof data.retry_after_seconds !== 'number' || !Number.isFinite(data.retry_after_seconds) ||
      data.retry_after_seconds <= 0 || data.retry_after_seconds > (data.kind === 'group' ? 259200 : 604800)) return null;
  return new ShareRequestError('cooldown', data.kind, data.retry_after_seconds);
}

export function remainingShareTime(seconds: number): string {
  if (seconds < 60) return 'less than a minute';
  // Round up to a minute so the wording never promises availability too early.
  const minutes = Math.ceil(seconds / 60);
  const units: [number, string][] = [[Math.floor(minutes / 1440), 'day'], [Math.floor(minutes % 1440 / 60), 'hour'], [minutes % 60, 'minute']];
  return units.filter(([count]) => count > 0).map(([count, unit]) => `${count} ${unit}${count === 1 ? '' : 's'}`).join(', ');
}

export function shareErrorMessage(error: unknown): string {
  if (error instanceof ShareRequestError) {
    if (error.reason === 'cooldown' && error.remainingSeconds && error.kind) {
      return `Already shared. You can share this ${error.kind === 'group' ? 'Group' : 'post'} again in ${remainingShareTime(error.remainingSeconds)}.`;
    }
    if (error.reason === 'forbidden') return 'Sharing is not permitted. Check your membership and the Group’s privacy or sharing settings.';
  }
  return 'Sharing could not be completed. Please try again.';
}
