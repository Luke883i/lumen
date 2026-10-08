import test from 'node:test';
import assert from 'node:assert/strict';
import {createRenderEpoch,mutationFailure,beginAction,afterAction} from '../public/interaction.js';

test('UX-S5 render epoch rejects stale views and older navigation focus',()=>{
 const guard=createRenderEpoch();
 const first=guard.begin(),second=guard.begin();
 assert.equal(guard.latest(first),false);
 assert.equal(guard.latest(second),true);
 guard.invalidate();assert.equal(guard.latest(second),false);
});
test('UX-S5 GET offline can retry, writes with ambiguous transport never claim failure/success',()=>{
 assert.equal(mutationFailure({method:'GET'}).kind,'unavailable');
 for(const method of ['POST','PUT','PATCH','DELETE']){
  for(const x of [{transport:'network'},{transport:'invalid_response'},{transport:'http',status:503}]){
   const v=mutationFailure({method,...x});
   assert.equal(v.kind,'uncertain');
   assert.match(v.message,/prima di ripetere/i);
   assert.doesNotMatch(v.message,/riuscita|confermata|registrata con successo/i);
  }
 }
 assert.equal(mutationFailure({method:'POST',transport:'http',status:400}).kind,'unavailable');
});
test('UX-S5 busy action locks out second click and restores exact compact button markup',()=>{
 const attrs=new Map();
 const control={
  disabled:false,innerHTML:'<svg aria-hidden="true"></svg> Invia prenotazione',
  setAttribute(k,v){attrs.set(k,v);},getAttribute(k){return attrs.get(k)||null;},
  removeAttribute(k){attrs.delete(k);},set textContent(v){this.innerHTML=v;}
 };
 const finish=beginAction(control);
 assert.ok(finish);assert.equal(control.disabled,true);
 assert.equal(control.getAttribute('aria-busy'),'true');
 assert.equal(beginAction(control),null);
 finish();finish();
 assert.equal(control.disabled,false);
 assert.equal(control.getAttribute('aria-busy'),null);
 assert.match(control.innerHTML,/svg/);
 assert.equal(afterAction.hold.href,'/me');
});
