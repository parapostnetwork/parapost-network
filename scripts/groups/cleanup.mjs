/** Never scheduled or run automatically. Requires explicit staging mutation approval. */
import { createClient } from '@supabase/supabase-js';
if (process.argv[2] !== '--execute-approved-staging' || process.env.GROUPS_CLEANUP_APPROVED !== 'vmgelrgrtpghmvqgufzz') {
  console.error('Not executed. Review docs/GROUPS_REVIEW.md and obtain approval first.'); process.exit(1);
}
const url=process.env.GROUPS_TEST_URL;
if(url !== 'https://vmgelrgrtpghmvqgufzz.supabase.co')throw new Error('Only the exact staging target is supported.');
const key=process.env.GROUPS_STAGING_SERVICE_ROLE_KEY;
if(!key)throw new Error('Missing staging-only operator credential.');
const client=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
// Database functions prune abandoned drafts/reservations and return only queued object paths.
// Storage API deletion removes both physical bytes and Storage metadata.
const batch=await client.rpc('groups_cleanup_batch');
if(batch.error)throw new Error('Cleanup batch failed; inspect staging privately.');
let removed=0;
for(const path of batch.data ?? []){
 const result=await client.storage.from('group-media').remove([path]);
 if(result.error)continue; // Leave queue entry for retry, never acknowledge a failed removal.
 const ack=await client.rpc('groups_cleanup_ack',{p_paths:[path]});
 if(ack.error)throw new Error('Cleanup acknowledgement failed; retry is safe.');
 removed++;
}
console.log(`Staging cleanup complete: ${removed} queued objects removed.`);
