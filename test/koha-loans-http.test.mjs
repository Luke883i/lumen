import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {openStore,bootstrap} from '../src/store.mjs';
import {createService} from '../src/service.mjs';
import {createKohaLoans} from '../src/koha-loans.mjs';
import {createKohaCirculation} from '../src/koha-circulation.mjs';
process.env.NODE_ENV='test';process.env.LUMEN_DEMO='1';process.env.LUMEN_DB_PATH=':memory:';
const {buildHandler}=await import('../src/server.mjs');
async function runFixture(fn){
 const s=openStore(':memory:');bootstrap(s,{NODE_ENV:'test',LUMEN_DEMO:'1'});
 const patron=s.get("SELECT * FROM users WHERE role='student'");
 const staff=s.get("SELECT * FROM users WHERE role='librarian'");
 s.run('INSERT INTO koha_patron_mappings(user_id,koha_patron_id,verified_by,verified_at) VALUES(?,?,?,?)',patron.id,101,staff.id,new Date().toISOString());
 const calls={renew:0,issue:0};
 const koha={configured:true,
  async checkoutsForPatron(){return [{checkout_id:501,patron_id:101,item_id:81,renewals_count:0,checkin_date:null,due_date:'2026-12-01'}];},
  async checkout(checkoutId){return {checkout_id:checkoutId,patron_id:101,item_id:81,renewals_count:0,checkin_date:null,due_date:'2026-12-01'};},
  async renewalAvailability(){return {allowed:true,current:0,max:2};},
  async renewCheckout(checkoutId){calls.renew++;return {checkout_id:checkoutId,patron_id:101,item_id:81,renewals_count:1,checkin_date:null,due_date:'2026-12-15'};},
  async checkoutAvailability(){return {blockers:{},confirms:{},warnings:{}};},
  async issueCheckout({patronId,itemId}){calls.issue++;return {checkout_id:701,patron_id:patronId,item_id:itemId,renewals_count:0,checkin_date:null,due_date:'2026-12-30'};}
 };
 const opts={KOHA_CIRCULATION_ENABLED:'1',KOHA_LOANS_ENABLED:'1',KOHA_PICKUP_LIBRARY_ID:'MAIN'};
 const loans=createKohaLoans(s,koha,opts),circ=createKohaCirculation(s,koha,opts);
 const server=createServer(buildHandler({api:createService(s),database:s,kohaApi:koha,kohaCirculationApi:circ,kohaLoansApi:loans}));
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const root='http://127.0.0.1:'+server.address().port;
 const login=async email=>{
  const response=await fetch(root+'/api/login',{method:'POST',headers:{Origin:root,'Content-Type':'application/json'},body:JSON.stringify({email,password:'Demo1234!'})});
  assert.equal(response.status,200);return {cookie:response.headers.get('set-cookie').split(';')[0],...(await response.json())};
 };
 const post=(path,sess,data,key)=>fetch(root+path,{method:'POST',headers:{
   Origin:root,Cookie:sess.cookie,'X-CSRF-Token':sess.csrf,'Content-Type':'application/json',
   ...(key?{'Idempotency-Key':key}:{})},body:JSON.stringify(data)});
 try{await fn({s,patron,staff,calls,root,login,post});}
 finally{await new Promise(resolve=>server.close(resolve));s.close();}
}
test('R4 HTTP: user-scoped Koha loans and exactly-once renewal',async()=>{
 await runFixture(async({root,patron,staff,calls,s,login,post})=>{
  const p=await login(patron.email),admin=await login(staff.email);
  const cfg=await (await fetch(root+'/api/config')).json();assert.equal(cfg.koha.loansEnabled,true);
  const anon=await fetch(root+'/api/integrations/koha/my/loans');assert.equal(anon.status,401);
  const list=await fetch(root+'/api/integrations/koha/my/loans',{headers:{Cookie:p.cookie}});
  assert.equal(list.status,200);assert.equal((await list.json()).loans[0].patron_id,101);
  const forbidden=await post('/api/staff/koha/checkout',p,{userId:patron.id,itemId:82},'http-forbidden-checkout-01');
  assert.equal(forbidden.status,403);assert.equal(calls.issue,0);
  const badCSRF=await fetch(root+'/api/integrations/koha/my/renew',{method:'POST',
    headers:{Origin:root,Cookie:p.cookie,'Content-Type':'application/json'},body:JSON.stringify({checkoutId:501})});
  assert.equal(badCSRF.status,403);
  const key='http-koha-renew-key-01234';
  const first=await post('/api/integrations/koha/my/renew',p,{checkoutId:501,patronId:202},key);
  assert.equal(first.status,200);const receipt=await first.json();assert.equal(receipt.patronId,101);
  const repeated=await post('/api/integrations/koha/my/renew',p,{checkoutId:501,patronId:303},key);
  assert.equal(repeated.status,200);assert.deepEqual(await repeated.json(),receipt);
  assert.equal(calls.renew,1);
  const issue=await post('/api/staff/koha/checkout',admin,{userId:patron.id,itemId:82},'http-staff-issue-key-001');
  assert.equal(issue.status,201);assert.equal((await issue.json()).itemId,82);
  assert.equal(calls.issue,1);
  assert.equal(s.get('SELECT count(*) n FROM loans').n,0);
  assert.equal(s.get('SELECT count(*) n FROM koha_loan_attempts').n,2);
 });
});
test('R4 HTTP: pending receipt access is staff-only',async()=>{
 await runFixture(async({root,patron,staff,login})=>{
  const p=await login(patron.email),admin=await login(staff.email);
  assert.equal((await fetch(root+'/api/staff/koha/loans-pending',{headers:{Cookie:p.cookie}})).status,403);
  const response=await fetch(root+'/api/staff/koha/loans-pending',{headers:{Cookie:admin.cookie}});
  assert.equal(response.status,200);assert.deepEqual(await response.json(),[]);
 });
});
