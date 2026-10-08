import test from 'node:test';
import assert from 'node:assert/strict';
import {
  projectLocalBook,projectKohaBook,projectLocalHold,projectLocalLoan,
  projectAcquisition,projectNotification,projectPatron,projectKohaOperation
} from '../public/projections.js';

const invariant=p=>{
 assert.ok(['supported','conditional','unknown','blocked'].includes(p.epistemicStatus));
 assert.equal(typeof p.provenance,'string');
 assert.ok(p.provenance.length>0);
 assert.equal(typeof p.label,'string');
 assert.ok(p.label.length>0);
 assert.equal(typeof p.helper,'string');
 assert.ok(p.helper.length>0);
 assert.equal(Object.isFrozen(p),true);
 if(p.action)assert.equal(Object.isFrozen(p.action),true);
 return p;
};
test('standalone book never fabricates stock, authorization or loan status',()=>{
 for(const count of [undefined,null,-3,'7',NaN,Infinity,0,1,3]){
  for(const role of [null,'student','faculty','librarian','admin']){
   const original=Object.freeze({id:'valid-id',available:count,title:'Book'});
   const p=invariant(projectLocalBook(original,{role}));
   assert.equal(p.provenance,'lumen.standalone.catalog');
   assert.equal(p.action.enabled,['student','faculty','librarian'].includes(role));
   if(count===0){assert.equal(p.status,'unavailable');assert.equal(p.epistemicStatus,'supported');}
   else if(Number.isSafeInteger(count)&&count>0){assert.equal(p.status,'available');}
   else {assert.equal(p.status,'unknown');assert.equal(p.epistemicStatus,'unknown');}
   assert.doesNotMatch(p.helper,/prestito (effettuato|confermato)/i);
   assert.deepEqual(original,{id:'valid-id',available:count,title:'Book'});
  }
 }
 assert.equal(projectLocalBook({id:'a/b',available:2},{role:'student'}).action.href,'/catalogo/a%2Fb');
 assert.equal(projectLocalBook({available:2},{role:'student'}).action.enabled,false);
});
test('Koha collection never becomes lendable from bibliographic copy count',()=>{
 for(const copies of [0,1,7,1000]){
  for(const mapped of [false,true,undefined]){
   for(const writeEnabled of [false,true]){
    for(const role of [null,'student','faculty','librarian']){
     const x=invariant(projectKohaBook({id:'koha_7',copies},{configured:true,writeEnabled,mapped,role}));
     assert.equal(x.status,'availability_unknown');
     assert.equal(x.epistemicStatus,'unknown');
     assert.match(x.label,/verificare su Koha/);
     assert.equal(x.action.enabled,!!(mapped&&writeEnabled&&role));
     if(x.action.enabled)assert.equal(x.action.epistemicStatus,'conditional');
    }
   }
  }
 }
 assert.equal(projectKohaBook({id:'koha_7',copies:1}).status,'unconfigured');
 assert.equal(projectKohaBook({id:'koha_7',copies:1}).action.enabled,false);
 assert.equal(projectKohaBook({copies:1},{configured:true,mapped:true,writeEnabled:true,role:'faculty'}).action.enabled,false);
});
test('hold and loan finite state tables never grant new authority',()=>{
 const holds={queued:'In coda',ready:'Pronto al ritiro',fulfilled:'Consegnata',cancelled:'Annullata'};
 for(const [status,label] of Object.entries(holds)){
  const p=invariant(projectLocalHold(Object.freeze({status})));
  assert.equal(p.label,label);assert.equal(p.action.enabled,status==='queued'||status==='ready');
  assert.equal(p.action.epistemicStatus,p.action.enabled?'conditional':'blocked');
 }
 for(const status of ['not_defined',undefined,'','approved',null]){
  const p=invariant(projectLocalHold({status}));
  assert.equal(p.epistemicStatus,'unknown');
  assert.equal(p.action.enabled,false);
 }
 for(const status of ['active','returned','stale',undefined]){
  for(const renewal_count of [undefined,0,1,2,-1,'0']){
   const p=invariant(projectLocalLoan({status,renewal_count}));
   assert.equal(p.action.enabled,status==='active'&&renewal_count===0);
   assert.equal(p.epistemicStatus,['active','returned'].includes(status)?'supported':'unknown');
  }
 }
});
test('ordered acquisition is not an acquired or delivered book',()=>{
 const mapping={pending:'In valutazione',approved:'Approvata',rejected:'Non accolta',ordered:'Ordinata'};
 for(const [status,label] of Object.entries(mapping)){
  const p=invariant(projectAcquisition(Object.freeze({status})));
  assert.equal(p.label,label);
  assert.equal(p.epistemicStatus,'supported');
  assert.doesNotMatch(p.helper,/risulta acquistato/i);
 }
 for(const status of [null,'acquired','delivered',undefined,'unknown']){
  assert.equal(projectAcquisition({status}).epistemicStatus,'unknown');
 }
});
test('inbox read status proves nothing about OS Web Push',()=>{
 for(const record of [{id:'id-a',read_at:null},{id:'id-b',read_at:'2026-10-08T09:00:00Z'},
   {id:'id-c',read_at:undefined},{id:'id-d',read_at:null,push_status:'sent'}]){
  const p=invariant(projectNotification(Object.freeze(record)));
  assert.equal(p.provenance,'lumen.inbox');
  assert.equal(p.action.enabled,record.read_at==null);
  assert.doesNotMatch(p.helper,/consegnata (su|al)|ricevuta da Chrome/i);
 }
 assert.equal(projectNotification({}).epistemicStatus,'unknown');
});
test('patron projection is a UI affordance only, unknown roles always fail closed',()=>{
 for(const role of ['student','faculty','librarian','admin',undefined,null]){
  const p=invariant(projectPatron(Object.freeze({id:'user1',role})));
  assert.equal(p.provenance,'lumen.session');
  assert.equal(p.capabilities.search,true);
  assert.equal(p.capabilities.acquisitions,role==='faculty');
  assert.equal(p.capabilities.staff,role==='librarian');
  assert.equal(p.capabilities.holds,['student','faculty','librarian'].includes(role));
  assert.equal(Object.isFrozen(p.capabilities),true);
  assert.notEqual(p.epistemicStatus,'supported'); // UI alone never authorizes
 }
 assert.equal(projectPatron({role:'librarian'}).capabilities.staff,false);
});
test('Koha pending/timeout is never equated to remote commit',()=>{
 const states=['pending','prepared','submitted','timeout','unknown','failed','rejected','verified','reconciled'];
 for(const state of states){
  for(const proofVerified of [false,true]){
   const p=invariant(projectKohaOperation(Object.freeze({state,proofVerified})));
   assert.equal(p.provenance,'koha.receipt');
   if(['verified','reconciled'].includes(state)&&proofVerified){
    assert.equal(p.epistemicStatus,'supported');assert.equal(p.status,'verified');
   } else if(['failed','rejected'].includes(state)){
    assert.equal(p.status,'blocked');assert.equal(p.epistemicStatus,'blocked');
   } else {
    assert.notEqual(p.epistemicStatus,'supported');
    assert.doesNotMatch(p.label,/esito verificato/i);
   }
  }
 }
 assert.equal(projectKohaOperation(null).status,'uncertain');
});
test('projection module carries no network, DOM, storage, or mutating side effects',async()=>{
 const {readFileSync}=await import('node:fs');
 const source=readFileSync(new URL('../public/projections.js',import.meta.url),'utf8');
 for(const forbidden of [/\bfetch\s*\(/,/\blocalStorage\b/,/\bindexedDB\b/,
   /\bdocument\./,/\bwindow\./,/\bs\.run\s*\(/,/\bapi\s*\(/])
  assert.doesNotMatch(source,forbidden);
});
