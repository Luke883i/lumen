import test from 'node:test';
import assert from 'node:assert/strict';
import {nextJourney} from '../public/journey.js';

test('next-step selector is pure, frozen, source-bound and never grants roles',()=>{
  const expected={guest:'/catalogo',student:'/me',faculty:'/acquisti',librarian:'/staff'};
  for(const role of [null,'guest','student','faculty','librarian','admin','__proto__']){
    for(const authenticated of [false,true]){
      const raw=Object.freeze({role,authenticated,koha:true});
      const x=nextJourney(raw);
      const effective=authenticated&&['student','faculty','librarian'].includes(role)?role:'guest';
      assert.equal(x.role,effective);
      assert.equal(x.href,expected[effective]);
      assert.equal(x.epistemicStatus,'conditional');
      assert.equal(x.provenance,'lumen.navigation_only');
      assert.equal(Object.isFrozen(x),true);
      assert.equal(x.enabled,true);
      assert.deepEqual(raw,{role,authenticated,koha:true});
    }
  }
});
test('Koha projection is bibliographic navigation, not stock or loan authority',()=>{
 const disabled=nextJourney({source:'koha',koha:false,role:'student',authenticated:true});
 assert.equal(disabled.href,'/me');
 const enabled=nextJourney({source:'koha',koha:true,role:'student',authenticated:true});
 assert.equal(enabled.href,'/koha');
 assert.match(enabled.detail,/non dimostrano la disponibilità/);
 assert.notEqual(enabled.epistemicStatus,'supported');
 assert.equal(enabled.provenance,'koha.navigation_only');
});
test('offline state prevents a CTA from implying a working backend operation',()=>{
 for(const role of [null,'student','faculty','librarian']){
  const x=nextJourney({role,authenticated:true,online:false,source:'koha',koha:true});
  assert.equal(x.href,null);
  assert.equal(x.enabled,false);
  assert.equal(x.epistemicStatus,'blocked');
  assert.match(x.detail,/torna online/);
 }
});

test('unknown network connectivity does not imply live Koha availability',()=>{
 const p=nextJourney({role:'student',authenticated:true,source:'koha',koha:true,online:null});
 assert.equal(p.provenance,'lumen.navigation_only');
 assert.equal(p.href,'/me');
 assert.notEqual(p.epistemicStatus,'supported');
});
