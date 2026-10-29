import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
function moduleAt(path, modules, globals = {}) {
  const source = ts.transpileModule(read(path), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  const exports = {};
  vm.runInNewContext(source, {exports,require:name => {
    if (!(name in modules)) throw Error(`Unexpected dependency ${name}`);
    return modules[name];
  },Request,Response,URL,Buffer,TextDecoder,console,...globals});
  return exports;
}
const shareErrors=moduleAt('../lib/groups/shareErrors.ts',{});
const stats={liked:false,like_count:0,comment_count:0,comments_limited:false,comments:[]};
const id='10000000-0000-4000-8000-000000000001';
function harness(file) {
  const states=[];let cursor=0;const effects=[];
  const jsx=(type,props)=>({type,props});
  const react={useState:initial=>{const i=cursor++;if(!(i in states))states[i]=initial;return [states[i],v=>{states[i]=typeof v==='function'?v(states[i]):v;}];},useRef:initial=>({current:initial}),useEffect:fn=>effects.push(fn),useCallback:fn=>fn};
  const identity={PostAvatar:'Avatar',profileName:()=> 'Member'};
  const client={groupsFetch:async()=>Response.json(stats),groupAction:async()=>{throw new shareErrors.ShareRequestError('cooldown','post',561600);}};
  const modules={'@/lib/groups/useGroupSession':{useGroupSession:()=>({ready:true,userId:id,revision:0})},'@/lib/groups/shareErrors':shareErrors,react,'react/jsx-runtime':{jsx,jsxs:jsx},'react-dom':{createPortal:x=>x},'next/link':'Link','@/lib/supabase':{supabase:{from:()=>({select:()=>({in:()=>Promise.resolve({data:[],error:null})})}),auth:{getSession:async()=>({data:{session:{user:{id}}}})}}},'@/lib/groups/client':client,'./SharedGroupPostActions':{default:'Actions'},'./GroupShareButton':{default:'ShareButton',ShareDialog:'ShareDialog'},'@/components/PostActionIcons':{HeartIcon:'Heart',CommentIcon:'Comment',ShareIcon:'Share'},'./groupPosting.module.css':{default:{}},'./PostIdentity':identity,'@/components/postPresentation':{}};
  const component=moduleAt(file,modules,{AbortController,Event,CustomEvent,window:new EventTarget(),document:Object.assign(new EventTarget(),{visibilityState:'visible'})}).default;
  return {render(props){cursor=0;effects.length=0;return component(props);},async initialize(){for(const effect of [...effects])effect();await new Promise(resolve=>setImmediate(resolve));},states};
}
function nodes(tree) { if(!tree||typeof tree!=='object')return [];if(Array.isArray(tree))return tree.flatMap(nodes);return [tree,...nodes(tree.props?.children)]; }
const find=(tree,predicate)=>{const node=nodes(tree).find(predicate);assert.ok(node,'Expected UI node');return node;};
const button=(tree,text)=>find(tree,n=>n.type==='button'&&n.props.children===text);
const errors=tree=>nodes(tree).filter(n=>n.props?.role==='alert');

test('Group discussion share errors stay inside form and Cancel clears errors and caption',async()=>{
 const h=harness('../app/groups/GroupPostActions.tsx');
 const props={groupId:id,postId:id,viewerId:id,ownerId:id,canInteract:true,canShare:true,read:async()=>Response.json(stats),action:async()=>{throw new shareErrors.ShareRequestError('cooldown','post',561600);}};
 let tree=h.render(props);
 find(tree,n=>n.props?.['aria-label']==='Share Group post to Dashboard and your Profile').props.onClick();
 tree=h.render(props);
 find(tree,n=>n.props?.['aria-label']==='Share caption').props.onChange({target:{value:'temporary'}});
 tree=h.render(props);
 find(tree,n=>n.type==='form'&&n.props.onSubmit).props.onSubmit({preventDefault(){}});
 await new Promise(resolve=>setImmediate(resolve));tree=h.render(props);
 assert.equal(errors(tree).length,1);
 assert.equal(errors(tree)[0].props.children,'Already shared. You can share this post again in 6 days, 12 hours.');
 assert.equal(nodes(tree).some(n=>n.props?.children==='Refresh reactions'),false);
 button(tree,'Cancel').props.onClick();tree=h.render(props);
 assert.equal(errors(tree).length,0);
 find(tree,n=>n.props?.['aria-label']==='Share Group post to Dashboard and your Profile').props.onClick();tree=h.render(props);
 assert.equal(find(tree,n=>n.props?.['aria-label']==='Share caption').props.value,'');assert.equal(errors(tree).length,0);
});

test('shared-post Cancel clears its share failure and starts a clean form on reopen',async()=>{
 const h=harness('../app/groups/SharedGroupPostEngagement.tsx');const props={shareId:id,groupId:id,postId:id};
 h.render(props);await h.initialize();let tree=h.render(props);
 find(tree,n=>n.type==='Actions').props.onShare();tree=h.render(props);
 find(tree,n=>n.type==='textarea').props.onChange({target:{value:'temporary'}});tree=h.render(props);
 await find(tree,n=>n.props?.['aria-label']==='Share Group post').props.onSubmit({preventDefault(){}});tree=h.render(props);
 assert.equal(errors(tree).length,1);
 assert.equal(errors(tree)[0].props.children,'Already shared. You can share this post again in 6 days, 12 hours.');button(tree,'Cancel').props.onClick();tree=h.render(props);assert.equal(errors(tree).length,0);
 find(tree,n=>n.type==='Actions').props.onShare();tree=h.render(props);assert.equal(find(tree,n=>n.type==='textarea').props.value,'');assert.equal(errors(tree).length,0);
});

test('promotion cards reuse engagement, route by share kind and open the existing Group dialog',async()=>{
 const h=harness('../app/groups/SharedGroupPostEngagement.tsx');const props={shareId:id,groupId:id,kind:'promotion',canShare:false};
 h.render(props);await h.initialize();let tree=h.render(props);assert.equal(find(tree,n=>n.type==='Actions').props.canShare,false);
 const card=read('../app/groups/SharedGroupPromotionCard.tsx');assert.match(card,/SharedGroupPostEngagement/);assert.doesNotMatch(card,/<GroupShareButton/);assert.doesNotMatch(card,/window.location.reload/);
});

function route(denied=false){const calls=[];const server={privateHeaders:{'Cache-Control':'private, no-store'},groupError:()=>Response.json({error:'Unavailable'},{status:400}),groupClient:async()=>{if(denied)throw Error('denied');return {rpc:async(name,args)=>{calls.push({name,args});return {data:stats,error:null};}};}};return {...moduleAt('../app/api/groups/sharing/interactions/route.ts',{'@/lib/groups/server':server,'@/lib/groups/validation':{UUID:/^[0-9a-f-]{36}$/i}}),calls};}
test('promotion interactions use promotion-only RPCs while legacy routing is preserved',async()=>{
 const h=route();await h.GET(new Request(`http://localhost?share=${id}&kind=promotion`));await h.GET(new Request(`http://localhost?share=${id}`));
 for(const kind of ['promotion','post'])await h.POST(new Request('http://localhost',{method:'POST',body:JSON.stringify({shareId:id,kind,action:'reply',parentId:id,content:'Reply',user_id:'attacker'})}));
 assert.deepEqual(h.calls.map(c=>c.name),['groups_promotion_stats','groups_shared_post_stats','groups_promotion_interact','groups_shared_post_interact']);assert.equal(JSON.stringify(h.calls).includes('attacker'),false);
});
test('invalid kinds, unauthenticated requests and oversized bodies cannot call engagement RPCs',async()=>{
 const h=route();assert.equal((await h.GET(new Request(`http://localhost?share=${id}&kind=other`))).status,400);
 for(const body of [{shareId:id,kind:'other',action:'like'},{shareId:id,kind:'promotion',action:'delete_group'},{shareId:id,kind:'promotion',action:'comment',content:'x'.repeat(9000)}])assert.equal((await h.POST(new Request('http://localhost',{method:'POST',body:JSON.stringify(body)}))).status,400);
 assert.equal(h.calls.length,0);const deny=route(true);assert.equal((await deny.GET(new Request(`http://localhost?share=${id}&kind=promotion`))).status,400);assert.equal(deny.calls.length,0);
});
test('staging SQL isolates promotion engagement and retains live privacy/ownership checks without changing cooldowns',()=>{
 const sql=read('../docs/sql-drafts/groups-promotional-engagement-staging.sql');
 assert.equal((sql.match(/ENABLE ROW LEVEL SECURITY/g)||[]).length,3);
 for(const required of ['promotion_preview(v_group_id, p_share_id)','promotion_preview(v_share.group_id, p_share_id)','FOR SHARE','shared_post_interaction_rate_limits','v_parent.author_id <> v_uid','parent.share_id = p_share_id','FROM PUBLIC, anon, authenticated'])assert.ok(sql.includes(required),required);
 assert.doesNotMatch(sql,/(?:UPDATE|DELETE FROM|INSERT INTO) public\.(?:groups|group_posts|group_post_shares|group_promotional_shares)\b/);
 assert.doesNotMatch(sql,/CREATE(?: OR REPLACE)? FUNCTION (?:public\.groups_share_post|public\.groups_promote|public\.groups_remove_share|parapost_groups_private\.promotion_share)\(/);
});


test('all promotion engagement actions stay scoped to their share and comment identifiers',async()=>{
 const h=route();
 for(const action of ['like','unlike','comment','reply','like_comment','unlike_comment','edit_comment','delete_comment']){
  const response=await h.POST(new Request('http://localhost',{method:'POST',body:JSON.stringify({shareId:id,kind:'promotion',action,content:'Local test',parentId:id,author_id:'attacker'})}));
  assert.equal(response.status,200);
  const call=h.calls.at(-1);assert.equal(call.name,'groups_promotion_interact');assert.equal(call.args.p_share_id,id);assert.equal(call.args.p_action,action);assert.equal(call.args.p_parent_id,id);
 }
 assert.equal(JSON.stringify(h.calls).includes('attacker'),false);
});
