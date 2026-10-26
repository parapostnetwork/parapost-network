import test from 'node:test';
import assert from 'node:assert/strict';
import {groupFeedCursor,appendGroupPosts} from '../lib/groups/feed.ts';
const id='10000000-0000-4000-8000-000000000001';
test('feed cursor keeps microseconds and breaks timestamp ties',()=>{
 const date='2026-10-23T12:00:00.123456+00:00';
 assert.equal(groupFeedCursor(date,id),`created_at.lt.${date},and(created_at.eq.${date},id.lt.${id})`);
 assert.equal(groupFeedCursor(null,null),null);
});
test('feed cursor rejects partial, malformed and PostgREST filter injection inputs',()=>{
 for(const pair of [[null,id],['2026-10-23T12:00:00Z',null],['invalid',id],['2026-10-23T12:00:00Z),id.gt.0',id],['2026-10-23T12:00:00Z','x),group_id.neq.0']])assert.throws(()=>groupFeedCursor(...pair));
});
test('appending older posts preserves loaded posts and removes overlap and repeated IDs',()=>{
 const current=[{id:'a'},{id:'b'}];const incoming=[{id:'b'},{id:'c'},{id:'c'},{id:'d'}];
 assert.deepEqual(appendGroupPosts(current,incoming).map(p=>p.id),['a','b','c','d']);
 assert.deepEqual(current,[{id:'a'},{id:'b'}]);assert.deepEqual(appendGroupPosts(current,[]),current);
});
