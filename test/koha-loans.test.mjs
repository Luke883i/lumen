import test from 'node:test';
import assert from 'node:assert/strict';
import {openStore,bootstrap} from '../src/store.mjs';
import {createKohaLoans} from '../src/koha-loans.mjs';
const fails=(fn,code)=>assert.rejects(fn,e=>e?.code===code);
function fixture(overrides={}){
 const s=openStore(':memory:');bootstrap(s,{NODE_ENV:'test',LUMEN_DEMO:'1'});
 const user=r=>s.get('SELECT id,email,role,active FROM users WHERE role=?',r);
 const student=user('student'),faculty=user('faculty'),staff=user('librarian');
 s.run('INSERT INTO koha_patron_mappings(user_id,koha_patron_id,verified_by,verified_at) VALUES(?,?,?,?)',student.id,101,staff.id,new Date().toISOString());
 const calls={renew:0,issue:0};
 const old={checkout_id:501,patron_id:101,item_id:81,renewals_count:0,due_date:'2026-11-01T00:00:00Z',checkin_date:null};
 const bridge={configured:true,
  async checkoutsForPatron(id){return id===101?[old]:[];},
  async checkout(id){return {...old,checkout_id:id};},
  async renewalAvailability(){return {allowed:true,current:0,max:2,reason:''};},
  async renewCheckout(id){calls.renew++;return {...old,checkout_id:id,renewals_count:1,due_date:'2026-11-14T00:00:00Z'};},
  async checkoutAvailability(){return {blockers:{},confirms:{},warnings:{}};},
  async issueCheckout({patronId,itemId}){calls.issue++;return {...old,checkout_id:600,patron_id:patronId,item_id:itemId};},
  ...overrides
 };
 const config={KOHA_CIRCULATION_ENABLED:'1',KOHA_LOANS_ENABLED:'1',KOHA_PICKUP_LIBRARY_ID:'MAIN'};
 return {s,user,student,faculty,staff,calls,bridge,loans:createKohaLoans(s,bridge,config),config};
}
test('R4 is explicitly disabled by default even if Koha client exists',()=>{
 const f=fixture();const c=createKohaLoans(f.s,f.bridge,{KOHA_CIRCULATION_ENABLED:'1',KOHA_PICKUP_LIBRARY_ID:'MAIN'});
 assert.equal(c.enabled,false);assert.throws(()=>c.pending(f.staff),e=>e.code==='KOHA_LOANS_DISABLED');f.s.close();
});
test('owned loans come from Koha, are scoped to bound patron and do not write local loans',async()=>{
 const f=fixture();const result=await f.loans.mine(f.student);
 assert.equal(result.patronId,101);assert.equal(result.loans.length,1);
 assert.equal(f.s.get('SELECT count(*) n FROM loans').n,0);
 await fails(()=>f.loans.mine(f.faculty),'KOHA_MAPPING_MISSING');f.s.close();
});
test('wrong Koha patron returned by remote is rejected, no cross-patron disclosure',async()=>{
 const f=fixture({async checkoutsForPatron(){return [{checkout_id:501,patron_id:202,item_id:81}]}});
 await fails(()=>f.loans.mine(f.student),'KOHA_OWNER_MISMATCH');f.s.close();
});
test('patron renewal is Koha-governed and durable retry does not post twice',async()=>{
 const f=fixture();const key='renew-key-accepted-001';
 const result=await f.loans.renew(f.student,501,key);
 assert.equal(result.checkoutId,501);assert.equal(result.renewals,1);
 assert.deepEqual(await f.loans.renew(f.student,501,key),result);
 assert.equal(f.calls.renew,1);
 assert.equal(f.s.get('SELECT count(*) n FROM loans').n,0);
 assert.equal(f.s.get("SELECT count(*) n FROM audit_events WHERE operation='koha_renew'").n,1);
 await fails(()=>f.loans.renew(f.student,502,key),'IDEMPOTENCY_CONFLICT');f.s.close();
});
test('wrong owner, completed loan and Koha renew refusal all prevent remote POST',async()=>{
 const f=fixture({async checkout(){return {checkout_id:501,patron_id:202,item_id:81,checkin_date:null,renewals_count:0}}});
 await fails(()=>f.loans.renew(f.student,501,'renew-bad-owner-0001'),'KOHA_OWNER_MISMATCH');
 assert.equal(f.calls.renew,0);f.s.close();
 const f2=fixture({async renewalAvailability(){return {allowed:false,reason:'hold queue'};}});
 await fails(()=>f2.loans.renew(f2.student,501,'renew-blocked-00001'),'KOHA_RENEWAL_DENIED');
 assert.equal(f2.calls.renew,0);f2.s.close();
});
test('timeout after renew is uncertain, exact and distinct retry keys are fail closed',async()=>{
 const f=fixture({async renewCheckout(){throw Object.assign(new Error('read timeout'),{code:'KOHA_NETWORK'});}});
 await fails(()=>f.loans.renew(f.student,501,'renew-network-uncertain-01'),'KOHA_RECONCILIATION_REQUIRED');
 assert.equal(f.s.get('SELECT state FROM koha_loan_attempts').state,'uncertain');
 await fails(()=>f.loans.renew(f.student,501,'renew-network-uncertain-01'),'KOHA_RECONCILIATION_REQUIRED');
 await fails(()=>f.loans.renew(f.student,501,'renew-new-key-00001'),'KOHA_RECONCILIATION_REQUIRED');
 assert.equal(f.loans.pending(f.staff).length,1);f.s.close();
});
test('staff-only Koha checkout requires a bound patron and no Koha blockers/warnings/confirmations',async()=>{
 const f=fixture();const key='checkout-staff-key-0001';
 await fails(()=>f.loans.issue(f.student,f.student.id,81,key),'FORBIDDEN');
 const receipt=await f.loans.issue(f.staff,f.student.id,81,key);
 assert.equal(receipt.itemId,81);
 assert.equal(f.calls.issue,1);
 assert.deepEqual(await f.loans.issue(f.staff,f.student.id,81,key),receipt);
 assert.equal(f.calls.issue,1);
 assert.equal(f.s.get("SELECT count(*) n FROM audit_events WHERE operation='koha_checkout'").n,1);
 f.s.close();
 const x=fixture({async checkoutAvailability(){return {blockers:{},confirms:{manual:true},warnings:{}};}});
 await fails(()=>x.loans.issue(x.staff,x.student.id,81,'checkout-review-00001'),'KOHA_CHECKOUT_REQUIRES_STAFF_REVIEW');
 assert.equal(x.calls.issue,0);x.s.close();
});
test('staff checkout timeout requires remote receipt reconciliation; mismatch remains pending',async()=>{
 const f=fixture({async issueCheckout(){throw Object.assign(new Error('lost response'),{code:'KOHA_NETWORK'});}});
 await fails(()=>f.loans.issue(f.staff,f.student.id,81,'checkout-uncertain-001'),'KOHA_RECONCILIATION_REQUIRED');
 const pending=f.loans.pending(f.staff);assert.equal(pending.length,1);
 await fails(()=>f.loans.reconcile(f.student,pending[0].id,600),'FORBIDDEN');
 await fails(()=>f.loans.reconcile(f.staff,pending[0].id,600),'KOHA_RECEIPT_MISMATCH');
 assert.equal(f.loans.pending(f.staff).length,1);f.s.close();
});
test('reconciliation confirms remote issue only on matching patron/item; audited exact receipt',async()=>{
 const f=fixture({async issueCheckout(){throw Object.assign(new Error('timeout'),{code:'KOHA_NETWORK'});},
  async checkout(id){return {checkout_id:id,patron_id:101,item_id:81,renewals_count:0,checkin_date:null,due_date:'2026-11-01'};}});
 await fails(()=>f.loans.issue(f.staff,f.student.id,81,'issue-pending-recover-001'),'KOHA_RECONCILIATION_REQUIRED');
 const pending=f.loans.pending(f.staff)[0];
 const done=await f.loans.reconcile(f.staff,pending.id,700);
 assert.equal(done.reconciled,true);assert.equal(done.checkoutId,700);
 assert.deepEqual(await f.loans.issue(f.staff,f.student.id,81,'issue-pending-recover-001'),done);
 assert.equal(f.loans.pending(f.staff).length,0);f.s.close();
});
test('preflight rejects issue/renew on account revocation before external POST',async()=>{
 const f=fixture({async checkoutAvailability(){f.s.run('UPDATE users SET active=0 WHERE id=?',f.student.id);return {blockers:{},confirms:{},warnings:{}};}});
 await fails(()=>f.loans.issue(f.staff,f.student.id,81,'disable-before-issue-01'),'KOHA_PATRON_DISABLED');
 assert.equal(f.calls.issue,0);f.s.close();
});
