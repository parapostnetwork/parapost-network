import { privateHeaders } from './server';
import { shareErrorFromResponse } from './shareErrors';

/** Call only for errors from the authorized sharing RPC, never generic requests. */
export function shareErrorResponse(error: unknown): Response | null {
  if (!error || typeof error !== 'object') return null;
  const rpc = error as { code?: string; message?: string; details?: string };
  if (rpc.code === '42501') {
    return Response.json({ code: 'share_forbidden' }, { status: 403, headers: privateHeaders });
  }
  if (rpc.code !== 'P0001' || rpc.message !== 'GROUP_SHARE_COOLDOWN' || typeof rpc.details !== 'string') return null;
  try {
    const details = JSON.parse(rpc.details);
    const normalized = { code: 'share_cooldown', kind: details.kind, retry_after_seconds: details.retry_after_seconds };
    if (!shareErrorFromResponse(normalized)) return null;
    return Response.json(normalized, { status: 409, headers: { ...privateHeaders, 'Retry-After': String(Math.ceil(normalized.retry_after_seconds)) } });
  } catch { return null; }
}
