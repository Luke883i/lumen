import test from 'node:test';
import assert from 'node:assert/strict';
import {verifiedEmpty} from '../public/empty-state.js';

test('empty states require a verified server response and never infer a network failure',()=>{
 for(const kind of ['catalog','holds','loans','inbox','proposals','featured','other','__proto__']){
  for(const confirmed of [false,undefined,null,'true']){
   const x=verifiedEmpty(kind,{confirmed});
   assert.equal(x.status,'unknown');
   assert.equal(x.action,null);
   assert.equal(x.epistemicStatus,'unknown');
   assert.equal(Object.isFrozen(x),true);
  }
 }
});
test('confirmed empty states offer one contextual next step without claiming a new transaction',()=>{
 for(const kind of ['catalog','holds','loans','inbox','proposals','featured']){
  const x=verifiedEmpty(kind,{confirmed:true,query:true});
  assert.equal(x.status,'empty');
  assert.equal(x.epistemicStatus,'supported');
  assert.ok(x.message.length>24);
  assert.doesNotMatch(x.message,/Koha|notifiche Chrome|prestito approvato/i);
  if(x.action){
   assert.equal(Object.isFrozen(x.action),true);
   assert.match(x.action.href,/^\//);
  }
 }
 assert.equal(verifiedEmpty('catalog',{confirmed:true,query:false}).action,null);
 assert.equal(verifiedEmpty('catalog',{confirmed:true,query:true}).action.href,'/catalogo');
 assert.equal(verifiedEmpty('proposals',{confirmed:true}).action,null);
});
