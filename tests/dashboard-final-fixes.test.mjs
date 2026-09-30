import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { preserveBlockedIds } from '../lib/dashboard/blocked-ids.ts';
import { queryDashboardLikes, queryExactPostLikes } from '../lib/dashboard/like-queries.ts';

for(const next of [['a','b'],['b','a'],['a','a','b']])test(`same membership ${next} preserves original object`,()=>{const prev=['a','b'];assert.equal(preserveBlockedIds(prev,next),prev);});
for(const next of [['a','b','c'],['a'],[]])test(`changed membership ${next} updates state`,()=>{const prev=['a','b'];const result=preserveBlockedIds(prev,next);assert.notEqual(result,prev);assert.deepEqual(result,next);});
test('initial/empty/failed query semantics preserved',()=>{const empty=[];assert.equal(preserveBlockedIds(empty,[]),empty);assert.deepEqual(preserveBlockedIds(empty,['a']),['a']);assert.deepEqual(preserveBlockedIds(['a'],[]),[]);});
test('semantic state stability preserves callback and effect dependencies; real changes invalidate them',()=>{
 let state=['a','b'],counts={},loader={},subscriptions=1;
 function refresh(next){const updated=preserveBlockedIds(state,next);if(!Object.is(updated,state)){counts={};loader={};subscriptions++;}state=updated;}
 const oldCounts=counts,oldLoader=loader;refresh(['b','a']);refresh(['a','b']);assert.equal(subscriptions,1);assert.equal(counts,oldCounts);assert.equal(loader,oldLoader);
 refresh(['b']);assert.equal(subscriptions,2);assert.notEqual(counts,oldCounts);assert.notEqual(loader,oldLoader);
 const source=readFileSync(new URL('../app/dashboard/page.tsx',import.meta.url),'utf8');
 assert.ok(source.includes('setBlockedUserIds(previous => preserveBlockedIds(previous, blockedIds))'));
 assert.ok(source.includes('setBlockedUserIds(previous => preserveBlockedIds(previous, []))'));
 assert.match(source,/if \(blocksError\) \{[\s\S]*?blockedIds = \[\];/);
});
function clientWith(total,mine,{failTotal=false,failMine=false,nullTotal=false,throwMine=false}={}){
 const calls=[];
 const client=createClient('http://127.0.0.1:54321','placeholder',{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:async(url,options)=>{
  const parsed=new URL(url);calls.push({url:parsed,method:options.method,headers:new Headers(options.headers)});
  const own=parsed.searchParams.has('user_id');if(own&&throwMine)throw new Error('network');
  if((own&&failMine)||(!own&&failTotal))return new Response(null,{status:503});
  const count=own?mine:total;const headers={'content-type':'application/json'};
  if(own||!nullTotal)headers['content-range']=`0-0/${count}`;
  return new Response(options.method==='HEAD'?null:JSON.stringify([]),{headers});
 }}});return {client,calls};
}
test('actual SDK serializes bounded normal GET plus exact count',async()=>{
 const h=clientWith(0,0);const result=await queryDashboardLikes(h.client,['p','q']);assert.equal(result.count,0);assert.equal(h.calls.length,1);
 const c=h.calls[0];assert.equal(c.method,'GET');assert.equal(c.url.searchParams.get('limit'),'1000');assert.equal(c.url.searchParams.get('post_id'),'in.(p,q)');assert.ok(c.headers.get('prefer').includes('count=exact'));
});
for(const n of [100,999,1000,1001,10000,100000])test(`fallback for ${n} likes uses only two exact HEAD requests`,async()=>{
 const h=clientWith(n,1);const result=await queryExactPostLikes(h.client,'p','me');assert.deepEqual(result,{count:n,liked:true});assert.equal(h.calls.length,2);
 for(const c of h.calls){assert.equal(c.method,'HEAD');assert.equal(c.url.searchParams.get('post_id'),'eq.p');assert.ok(c.headers.get('prefer').includes('count=exact'));assert.equal(c.url.searchParams.has('offset'),false);}
 assert.equal(h.calls[1].url.searchParams.get('user_id'),'eq.me');
});
test('HEAD zero/no-own-like returns explicit zero and false',async()=>{const h=clientWith(0,0);assert.deepEqual(await queryExactPostLikes(h.client,'p','me'),{count:0,liked:false});});
for(const opts of [{failTotal:true},{failMine:true},{nullTotal:true},{throwMine:true}])test(`SDK errors/missing exact counts stay unknown: ${JSON.stringify(opts)}`,async()=>{
 const h=clientWith(1001,1,opts);const result=await queryExactPostLikes(h.client,'p','me');assert.equal(result.count,opts.failTotal||opts.nullTotal?null:1001);assert.equal(result.liked,opts.failMine||opts.throwMine?null:true);
});
