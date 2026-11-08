import 'server-only';

import { createClient } from '@supabase/supabase-js';

const BUCKET = 'creatorverse-media';
const BATCH_LIMIT = 5;

function cleanupApproved(): boolean {
  // Independent hard lock. Never enable implicitly.
  return false;
}

type CleanupJob = {
  job_id: string;
  claim_token: string;
  page_id: string;
  post_id: string;
  media_id: string;
  storage_path: string;
};

const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const extensions = new Set([
  'jpg', 'png', 'webp', 'mp4', 'webm',
]);

function validJob(value: unknown): value is CleanupJob {
  if (!value || typeof value !== 'object') return false;

  const job = value as Partial<CleanupJob>;

  if (
    !job.job_id || !uuid.test(job.job_id) ||
    !job.claim_token || !uuid.test(job.claim_token) ||
    !job.page_id || !uuid.test(job.page_id) ||
    !job.post_id || !uuid.test(job.post_id) ||
    !job.media_id || !uuid.test(job.media_id) ||
    typeof job.storage_path !== 'string'
  ) {
    return false;
  }

  const prefix =
    `${job.page_id}/${job.post_id}/${job.media_id}.`;

  if (!job.storage_path.startsWith(prefix)) return false;

  return extensions.has(job.storage_path.slice(prefix.length));
}

/**
 * Disabled until private database RPCs are installed.
 *
 * Required RPC contract:
 *
 * creatorverse_claim_media_cleanup_batch:
 * - Service-role only
 * - Atomically claim eligible abandoned media
 * - Enforce a grace period
 * - Refuse verified or published media
 * - Lock out further verification
 * - Return short-lived claim tokens and exact paths
 *
 * creatorverse_complete_media_cleanup:
 * - Service-role only
 * - Require matching job ID and claim token
 * - Record success or retryable failure
 * - Never make completed media publishable again
 *
 * The database must also prevent new uploads for claimed
 * media and reconcile late-arriving orphan objects.
 */
export async function runCreatorVerseMediaCleanupBatch() {
  if (!cleanupApproved()) {
    throw new Error('CreatorVerse media cleanup is disabled.');
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error('Cleanup credentials are unavailable.');
  }

  const admin = createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  // First reject expired, unconsumed reservations.
  // The proposed database trigger queues rejected media
  // for cleanup after the configured grace period.
  const { data: expired, error: expirationError } =
    await admin.rpc(
      'creatorverse_expire_pending_media_batch',
      { p_limit: 20 }
    );

  if (
    expirationError ||
    typeof expired !== 'number' ||
    !Number.isInteger(expired) ||
    expired < 0 ||
    expired > 20
  ) {
    throw new Error(
      'CreatorVerse media expiration could not be confirmed.'
    );
  }

  const { data, error } = await admin.rpc(
    'creatorverse_claim_media_cleanup_batch',
    { p_limit: BATCH_LIMIT }
  );

  if (error || !Array.isArray(data)) {
    throw new Error('Cleanup jobs could not be claimed.');
  }

  if (data.length > BATCH_LIMIT ||
      !data.every(validJob)) {
    throw new Error('Invalid cleanup claim response.');
  }

  let removed = 0;
  let failed = 0;

  for (const job of data as CleanupJob[]) {
    let success = false;
    let failureReason: string | null = null;

    try {
      const { error: removalError } =
        await admin.storage
          .from(BUCKET)
          .remove([job.storage_path]);

      if (removalError) throw removalError;

      success = true;
    } catch {
      failureReason = 'storage_removal_failed';
    }

    const { data: acknowledged, error: ackError } =
      await admin.rpc(
        'creatorverse_complete_media_cleanup',
        {
          p_job_id: job.job_id,
          p_claim_token: job.claim_token,
          p_success: success,
          p_error: failureReason,
        }
      );

    if (ackError || acknowledged !== true) {
      throw new Error(
        'Cleanup completion was not acknowledged.'
      );
    }

    if (success) removed++;
    else failed++;
  }

  return { expired, claimed: data.length, removed, failed };
}
