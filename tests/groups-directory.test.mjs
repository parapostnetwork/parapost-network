import test from 'node:test';
import assert from 'node:assert/strict';
import { selectMyGroups, parseGroupPreferences } from '../lib/groups/directory.ts';
import { groupsPreviewAllowed } from '../lib/groups/previewAccess.ts';
const groups = [
  {id:'owned',name:'Alpha',description:'Equipment',owner_id:'viewer',membership_role:'owner',membership_status:'approved',member_count:2},
  {id:'joined',name:'Beta',description:'Haunted locations',owner_id:'another',membership_role:'member',membership_status:'approved',member_count:40},
  {id:'pending',name:'Pending',description:'Private',membership_status:'pending',member_count:null},
];
const prefs = {favorites:['joined','pending','revoked'],visits:{owned:10,joined:20,revoked:30}};
test('organization uses current approved membership and cannot revive stale stored access',()=>{
 assert.deepEqual(selectMyGroups(groups,'viewer',prefs,'all').map(g=>g.id),['owned','joined']);
 assert.deepEqual(selectMyGroups(groups,'viewer',prefs,'owned').map(g=>g.id),['owned']);
 assert.deepEqual(selectMyGroups(groups,'viewer',prefs,'joined').map(g=>g.id),['joined']);
 assert.deepEqual(selectMyGroups(groups,'viewer',prefs,'favorites').map(g=>g.id),['joined']);
 assert.deepEqual(selectMyGroups(groups,'viewer',prefs,'recent').map(g=>g.id),['joined','owned']);
});
test('search intersects sections and supported sorts use only supplied values',()=>{
 assert.deepEqual(selectMyGroups(groups,'viewer',prefs,'all',' HAUNTED ').map(g=>g.id),['joined']);
 assert.equal(selectMyGroups(groups,'viewer',prefs,'owned','Haunted').length,0);
 assert.deepEqual(selectMyGroups(groups,'viewer',prefs,'all','','members').map(g=>g.id),['joined','owned']);
 assert.equal(groups[0].id,'owned');
});
test('malformed browser preferences cannot crash the directory',()=>{
 for(const value of ['null','no json','{"visits":null}'])assert.deepEqual(parseGroupPreferences(value),{favorites:[],visits:{}});
 assert.deepEqual(parseGroupPreferences('{"favorites":["a","a",4],"visits":{"a":1,"b":"bad","c":-1}}'),{favorites:['a'],visits:{a:1}});
});
test('sample preview fails closed for every deployed and non-loopback context',()=>{
 assert.equal(groupsPreviewAllowed('development',undefined,'localhost:3100'),true);
 assert.equal(groupsPreviewAllowed('development',undefined,'127.0.0.1:3100'),true);
 for(const env of ['production','test',undefined])assert.equal(groupsPreviewAllowed(env,undefined,'localhost:3100'),false);
 assert.equal(groupsPreviewAllowed('development','1','localhost:3100'),false);
 for(const host of ['parapost-network.vercel.app','localhost.evil.test','192.168.2.16:3100',undefined])assert.equal(groupsPreviewAllowed('development',undefined,host),false);
});
