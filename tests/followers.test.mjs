import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { followMember } from '../lib/followers.ts';

const id = '12345678-1234-1234-1234-123456789abc';
const target = '87654321-4321-4321-4321-cba987654321';
function fixture(options = {}) {
  let profile = options.hasProfile ?? true;
  const inserts = [];
  const client = {
    auth: { getUser: async () => ({ data: { user: options.signedOut ? null : { id: options.authId || id, user_metadata: { full_name: 'Member Name' } } }, error: null }) },
    from(table) {
      const filters = {};
      const query = {
        select() { return query; },
        eq(key, value) { filters[key] = value; return query; },
        async maybeSingle() {
          if (table === 'profiles') {
            assert.equal(filters.id, id);
            return { data: profile ? { id } : null, error: options.readError ? { code: '42501' } : null };
          }
          assert.equal(filters.follower_id, id);
          assert.equal(filters.following_id, target);
          return { data: options.existingFollow ? { follower_id: id } : null, error: null };
        },
        async insert(payload) {
          inserts.push({ table, payload });
          if (options.networkError) throw new Error('private backend details');
          if (table === 'profiles') {
            if (!options.profileError || options.concurrentProfile) profile = true;
            return { error: options.profileError || null };
          }
          assert.equal(profile, true, 'must establish profile before follow');
          return { error: options.followError || null };
        },
      };
      return query;
    },
  };
  return { client, inserts };
}
test('missing signed-in profile is created before follow using only that account ID', async () => {
  const f = fixture({ hasProfile: false });
  assert.equal((await followMember(f.client, id, target)).error, null);
  assert.deepEqual(f.inserts.map(x => x.table), ['profiles', 'followers']);
  assert.equal(f.inserts[0].payload.id, id);
  assert.equal(f.inserts[0].payload.full_name, 'Member Name');
  assert.equal('email' in f.inserts[0].payload, false);
  assert.deepEqual(f.inserts[1].payload, { follower_id: id, following_id: target });
});
test('existing profile is never overwritten', async () => {
  const f = fixture();
  assert.equal((await followMember(f.client, id, target)).error, null);
  assert.deepEqual(f.inserts.map(x => x.table), ['followers']);
});
test('signed-out and stale-account requests cannot create profiles or follows', async () => {
  for (const options of [{ signedOut: true }, { authId: target }]) {
    const f = fixture(options);
    assert.ok((await followMember(f.client, id, target)).error);
    assert.equal(f.inserts.length, 0);
  }
});
test('missing IDs and self-follow fail without writing', async () => {
  const f = fixture();
  for (const pair of [['',target], [id,''], [id,id]]) assert.ok((await followMember(f.client,...pair)).error);
  assert.equal(f.inserts.length,0);
});
test('profile creation race succeeds only after the account row is confirmed', async () => {
  const f = fixture({ hasProfile:false, profileError:{code:'23505'}, concurrentProfile:true });
  assert.equal((await followMember(f.client,id,target)).error,null);
  const collision = fixture({hasProfile:false,profileError:{code:'23505'}});
  assert.ok((await followMember(collision.client,id,target)).error);
  assert.equal(collision.inserts.some(x=>x.table==='followers'),false);
});
test('profile read/write errors stop following and return a safe message', async () => {
  for (const options of [{readError:true}, {hasProfile:false,profileError:{code:'42501',message:'private database detail'}}]) {
    const f=fixture(options);
    const result=await followMember(f.client,id,target);
    assert.ok(result.error);
    assert.equal(result.error.message.includes('private database detail'),false);
    assert.equal(f.inserts.some(x=>x.table==='followers'),false);
  }
});
test('duplicate follow is success only when the exact relationship exists', async () => {
  for (const existingFollow of [true,false]) {
    const f=fixture({followError:{code:'23505'},existingFollow});
    assert.equal((await followMember(f.client,id,target)).error===null,existingFollow);
  }
});
test('deleted target and network failure return friendly errors without creating target profiles', async () => {
  for (const options of [{followError:{code:'23503',message:'followers_follower_id_profiles_id_fk'}},{networkError:true}]) {
    const f=fixture(options);
    const result=await followMember(f.client,id,target);
    assert.ok(result.error);
    assert.doesNotMatch(result.error.message,/foreign key|followers_|private backend/);
    assert.equal(f.inserts.some(x=>x.table==='profiles'),false);
  }
});
test('all active follow surfaces use the shared guarded flow, regardless of layout', () => {
  for (const file of ['app/dashboard/page.tsx','app/profile/[id]/page.tsx','app/reels/page.tsx','app/profile/[id]/reels/view/page.tsx']) {
    const source=readFileSync(new URL(`../${file}`,import.meta.url),'utf8');
    assert.match(source,/await followMember\(supabase,/);
    assert.doesNotMatch(source,/\.from\("followers"\)\s*\.insert/);
  }
});
