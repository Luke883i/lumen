import test from 'node:test';
import assert from 'node:assert/strict';
import {openStore,bootstrap} from '../src/store.mjs';
import {createKohaCirculation} from '../src/koha-circulation.mjs';
import {makeKoha} from '../src/koha.mjs';
function fixture(overrides={}){
  const s=openStore(':memory:');
  bootstrap(s,{NODE_ENV:'test',LUMEN_DEMO:'1'});
  const [student,faculty,staff]=['student','faculty','librarian'].map(role=>s.get('SELECT id,email,role,active FROM users WHERE role=?',role));
  const calls={patron:0,reads:0,posts:0};
  const koha={
    configured:true,
    async patron(id){calls.patron++;return {patron_id:id,email:id===101?student.email:faculty.email};},
    async patronHolds(){calls.reads++;return [];},
    async placeHold(payload){calls.posts++;return {hold_id:1000+calls.posts,patron_id:payload.patronId,biblio_id:payload.biblioId,priority:1};},
    ...overrides
  };
  const config={KOHA_CIRCULATION_ENABLED:'1',KOHA_PICKUP_LIBRARY_ID:'MAIN'};
  const c=createKohaCirculation(s,koha,config);
  return {s,c,koha,student,faculty,staff,calls,config};
}
function fail(fn,code){return assert.rejects(fn,e=>e.code===code);}
test('feature flag fail-closed until Koha configured',()=>{
  const f=fixture();
  const c=createKohaCirculation(f.s,{configured:false},f.config);
  assert.equal(c.enabled,false);
  assert.throws(()=>c.getBinding(f.student),e=>e.code==='KOHA_CIRCULATION_DISABLED');
  f.s.close();
});
test('manual binding validates email, role, and prevents reusing remote patron identity',async()=>{
  const f=fixture();
  await fail(()=>f.c.bind(f.student,f.student.id,101),'FORBIDDEN');
  await fail(()=>f.c.bind(f.staff,f.faculty.id,101),'KOHA_IDENTITY_MISMATCH');
  const bound=await f.c.bind(f.staff,f.student.id,101);
  assert.equal(bound.kohaPatronId,101);
  assert.deepEqual(f.c.getBinding(f.student).mapped,true);
  await fail(()=>f.c.bind(f.staff,f.faculty.id,101),'KOHA_IDENTITY_MISMATCH');
  assert.equal(f.s.get('SELECT count(*) n FROM koha_patron_mappings').n,1);
  f.s.close();
});
test('Koha hold is received from Koha only, a replay does not reissue POST, local holds unchanged',async()=>{
  const f=fixture();
  await f.c.bind(f.staff,f.student.id,101);
  const key='hold-staging-request-1234';
  const first=await f.c.placeHold(f.student,125,key);
  const replay=await f.c.placeHold(f.student,125,key);
  assert.deepEqual(first,replay);
  assert.equal(first.holdId,1001);
  assert.equal(f.calls.posts,1);
  assert.equal(f.calls.reads,1);
  assert.equal(f.s.get('SELECT count(*) n FROM holds').n,0);
  assert.equal(f.s.get("SELECT count(*) n FROM audit_events WHERE operation='koha_hold'").n,1);
  assert.equal(f.s.get("SELECT state FROM koha_hold_attempts").state,'succeeded');
  await fail(()=>f.c.placeHold(f.student,126,key),'IDEMPOTENCY_CONFLICT');
  f.s.close();
});
test('network loss after POST leaves durable uncertainty, never blindly replays',async()=>{
  const f=fixture({async placeHold(){throw Object.assign(new Error('timeout'),{code:'KOHA_NETWORK'});}});
  await f.c.bind(f.staff,f.student.id,101);
  await fail(()=>f.c.placeHold(f.student,125,'retry-no-post-000001'),'KOHA_RECONCILIATION_REQUIRED');
  assert.equal(f.s.get('SELECT state FROM koha_hold_attempts').state,'uncertain');
  await fail(()=>f.c.placeHold(f.student,125,'retry-no-post-000001'),'KOHA_RECONCILIATION_REQUIRED');
  await fail(()=>f.c.placeHold(f.student,125,'another-request-00001'),'KOHA_RECONCILIATION_REQUIRED');
  assert.equal(f.c.pending(f.staff).length,1);
  assert.equal(f.s.get("SELECT count(*) n FROM audit_events WHERE operation='koha_hold'").n,0);
  f.s.close();
});
test('preflight existing hold blocks write and marks definite reject',async()=>{
  const f=fixture({async patronHolds(id){return [{patron_id:id,biblio_id:125,cancellation_date:null}]}});
  await f.c.bind(f.staff,f.student.id,101);
  await fail(()=>f.c.placeHold(f.student,125,'already-present-000001'),'KOHA_HOLD_EXISTS');
  assert.equal(f.calls.posts,0);
  assert.equal(f.s.get('SELECT state FROM koha_hold_attempts').state,'rejected');
  f.s.close();
});
test('Koha 5xx is uncertain and access to pending is restricted',async()=>{
  const f=fixture({async placeHold(){throw Object.assign(new Error('koha 503'),{code:'KOHA_HTTP_503'});}});
  await f.c.bind(f.staff,f.student.id,101);
  await fail(()=>f.c.placeHold(f.student,125,'uncertain-503-0000001'),'KOHA_RECONCILIATION_REQUIRED');
  assert.equal(f.s.get('SELECT state FROM koha_hold_attempts').state,'uncertain');
  assert.throws(()=>f.c.pending(f.student),e=>e.code==='FORBIDDEN');
  f.s.close();
});
test('patron reads scoped to the bound account even on malicious remote rows',async()=>{
  const f=fixture({async patronHolds(){return [
    {patron_id:101,biblio_id:125,hold_id:11},
    {patron_id:202,biblio_id:126,hold_id:12}
  ]}});
  await f.c.bind(f.staff,f.student.id,101);
  const result=await f.c.myHolds(f.student);
  assert.equal(result.holds.length,1);
  assert.equal(result.holds[0].hold_id,11);
  f.s.close();
});
test('Koha transport POST uses typed JSON body, OAuth2 and no redirects',async()=>{
  const sent=[];
  const transport=async(url,opts)=>{
    sent.push({url,opts});
    if(url.endsWith('/api/v1/oauth/token'))return Response.json({access_token:'ticket',token_type:'Bearer',expires_in:600});
    if(url.endsWith('/api/v1/patrons/101'))return Response.json({patron_id:101,email:'student@lumen.local'});
    if(url.includes('/api/v1/holds?'))return Response.json([]);
    if(url.endsWith('/api/v1/holds')&&opts.method==='POST')return Response.json({hold_id:800,patron_id:101,biblio_id:125,priority:1},{status:201});
    return Response.json({error:'not found'},{status:404});
  };
  const adapter=makeKoha({NODE_ENV:'test',KOHA_BASE_URL:'http://127.0.0.1:9999',KOHA_CLIENT_ID:'id',KOHA_CLIENT_SECRET:'secret'},transport);
  const patron=await adapter.patron(101);
  assert.equal(patron.email,'student@lumen.local');
  assert.deepEqual(await adapter.patronHolds(101),[]);
  const hold=await adapter.placeHold({patronId:101,biblioId:125,pickupLibraryId:'MAIN'});
  assert.equal(hold.hold_id,800);
  const post=sent.find(x=>x.url.endsWith('/api/v1/holds')&&x.opts.method==='POST');
  assert.deepEqual(JSON.parse(post.opts.body),{patron_id:101,biblio_id:125,pickup_library_id:'MAIN'});
  assert.ok(sent.every(x=>x.opts.redirect==='error'));
});

test('manual reconciliation verifies remote receipt and exact replay',async()=>{
 const f=fixture({
  async placeHold(){throw Object.assign(new Error('timeout'),{code:'KOHA_NETWORK'});},
  async hold(id){return {hold_id:id,patron_id:101,biblio_id:125,priority:2,cancellation_date:null};}
 });
 await f.c.bind(f.staff,f.student.id,101);
 const key='reconcile-result-12345';
 await fail(()=>f.c.placeHold(f.student,125,key),'KOHA_RECONCILIATION_REQUIRED');
 const attempt=f.c.pending(f.staff)[0];
 await fail(()=>f.c.reconcile(f.student,attempt.id,900),'FORBIDDEN');
 const receipt=await f.c.reconcile(f.staff,attempt.id,900);
 assert.equal(receipt.holdId,900);
 assert.equal(receipt.reconciled,true);
 assert.deepEqual(await f.c.placeHold(f.student,125,key),receipt);
 assert.equal(f.s.get("SELECT count(*) n FROM audit_events WHERE operation='koha_hold_reconciled'").n,1);
 assert.equal(f.c.pending(f.staff).length,0);
 await fail(()=>f.c.reconcile(f.staff,attempt.id,900),'KOHA_INVALID_STATE');
 f.s.close();
});
test('wrong Koha patron cannot be used as reconciliation evidence',async()=>{
 const f=fixture({
  async placeHold(){throw Object.assign(new Error('timeout'),{code:'KOHA_NETWORK'});},
  async hold(id){return {hold_id:id,patron_id:202,biblio_id:125,priority:3,cancellation_date:null};}
 });
 await f.c.bind(f.staff,f.student.id,101);
 await fail(()=>f.c.placeHold(f.student,125,'mismatch-resolution-key'),'KOHA_RECONCILIATION_REQUIRED');
 await fail(()=>f.c.reconcile(f.staff,f.c.pending(f.staff)[0].id,777),'KOHA_RECEIPT_MISMATCH');
 assert.equal(f.c.pending(f.staff).length,1);
 f.s.close();
});

test('revocation during remote identity verification cannot bind the disabled user',async()=>{
 const f=fixture();
 f.koha.patron=async(id)=>{
   f.s.run('UPDATE users SET active=0 WHERE id=?',f.student.id);
   return {patron_id:id,email:f.student.email};
 };
 await fail(()=>f.c.bind(f.staff,f.student.id,101),'KOHA_BINDING_STALE');
 assert.equal(f.s.get('SELECT count(*) n FROM koha_patron_mappings').n,0);
 f.s.close();
});
test('revocation during hold preflight prevents Koha POST',async()=>{
 const f=fixture();
 await f.c.bind(f.staff,f.student.id,101);
 f.koha.patronHolds=async()=>{
   f.s.run('UPDATE users SET active=0 WHERE id=?',f.student.id);
   return [];
 };
 await fail(()=>f.c.placeHold(f.student,125,'revoked-before-post-001'),'FORBIDDEN');
 assert.equal(f.calls.posts,0);
 assert.equal(f.s.get('SELECT state FROM koha_hold_attempts').state,'rejected');
 f.s.close();
});
