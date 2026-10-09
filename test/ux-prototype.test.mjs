import test from 'node:test';
import assert from 'node:assert/strict';
import {localStatus} from '../public/experience.js';
import {verifiedEmpty} from '../public/empty-state.js';

test('prototype and constructor status strings are never laundered into supported library state',()=>{
 for(const domain of ['hold','loan','suggestion','__proto__','constructor',null]){
  for(const status of ['__proto__','constructor','toString','valueOf','hasOwnProperty']){
   const x=localStatus(domain,status);
   assert.equal(x.epistemic,'unknown');
   assert.equal(x.label,'Stato da verificare');
  }
 }
 assert.equal(localStatus('hold','queued').label,'In coda');
 assert.equal(localStatus('hold','ready').label,'Pronto al ritiro');
});
test('query string truthiness cannot invent a reset action',()=>{
 for(const query of [false,null,undefined,0,'true','false',{},[]])
  assert.equal(verifiedEmpty('catalog',{confirmed:true,query}).action,null);
 assert.equal(verifiedEmpty('catalog',{confirmed:true,query:true}).action.href,'/catalogo');
});
