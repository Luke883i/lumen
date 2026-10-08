import test from 'node:test';
import assert from 'node:assert/strict';
import {openStore,bootstrap} from '../src/store.mjs';
import {createKohaReturns} from '../src/koha-returns.mjs';
import {makeKoha} from '../src/koha.mjs';
const reject=(f,code)=>assert.rejects(f,e=>e?.code===code);
function fixture(overrides={}){
  const s=openStore(':memory:');bootstrap(s,{NODE_ENV:'test',LUMEN_DEMO:'1'});
  const person=role=>s.get('SELECT * FROM users WHERE role=?',role);
  const staff=person('librarian'),student=person('student');
  const calls={reads:0,historical:0};
  const koha={configured:true,
    async checkout(id){calls.reads++;return {checkout_id:id,patron_id:101,item_id:81,checkin_date:null};},
    async checkedInCheckout(){calls.historical++;return null;},
    ...overrides
  };
  const flags={KOHA_CIRCULATION_ENABLED:'1',KOHA_LOANS_ENABLED:'1',KOHA_RETURNS_ENABLED:'1'};
  return {s,staff,student,koha,calls,flags,returns:createKohaReturns(s,koha,flags)};
}
test('R5 return verification is disabled without its own flag',()=>{
  const f=fixture();
  const disabled=createKohaReturns(f.s,f.koha,{KOHA_CIRCULATION_ENABLED:'1',KOHA_LOANS_ENABLED:'1'});
  assert.equal(disabled.enabled,false);
  assert.throws(()=>disabled.list(f.staff),e=>e.code==='KOHA_RETURNS_DISABLED');
  f.s.close();
});
test('staff-only ticket requires remote active checkout; does not touch local or Koha circulation',async()=>{
  const f=fixture();
  await reject(()=>f.returns.prepare(f.student,501,'return-ticket-00000001'),'FORBIDDEN');
  const a=await f.returns.prepare(f.staff,501,'return-ticket-00000001');
  assert.equal(a.state,'awaiting_koha');assert.equal(a.checkoutId,501);
  assert.equal(a.patronId,101);assert.equal(a.itemId,81);
  assert.deepEqual(await f.returns.prepare(f.staff,501,'return-ticket-00000001'),a);
  assert.equal(f.calls.reads,1);
  assert.equal(f.s.get('SELECT count(*) n FROM loans').n,0);
  await reject(()=>f.returns.prepare(f.staff,501,'different-return-key-0001'),'KOHA_RETURN_ALREADY_PENDING');
  await reject(()=>f.returns.prepare(f.staff,502,'return-ticket-00000001'),'IDEMPOTENCY_CONFLICT');
  assert.equal(f.returns.list(f.staff).length,1);
  f.s.close();
});
test('return cannot be confirmed without positive Koha history',async()=>{
  const f=fixture();
  const ticket=await f.returns.prepare(f.staff,501,'pending-return-key-00001');
  await reject(()=>f.returns.verify(f.staff,ticket.ticketId),'KOHA_RETURN_NOT_CONFIRMED');
  assert.equal(f.s.get("SELECT state FROM koha_return_tickets").state,'awaiting_koha');
  assert.equal(f.s.get("SELECT count(*) n FROM audit_events WHERE operation='koha_return_verified'").n,0);
  f.s.close();
});
test('wrong checkout owner or item does not certify a check-in',async()=>{
  const f=fixture({async checkedInCheckout(){return {checkout_id:501,patron_id:202,item_id:81,checkin_date:'2026-10-08T12:00:00Z'};}});
  const ticket=await f.returns.prepare(f.staff,501,'mismatched-return-00001');
  await reject(()=>f.returns.verify(f.staff,ticket.ticketId),'KOHA_RETURN_MISMATCH');
  assert.equal(f.returns.list(f.staff).length,1);f.s.close();
});
test('verified checkout history yields one audited receipt and exact repeat',async()=>{
  const f=fixture({async checkedInCheckout(){return {checkout_id:501,patron_id:101,item_id:81,checkin_date:'2026-10-08T12:00:00Z',checkin_library_id:'MAIN'};}});
  const ticket=await f.returns.prepare(f.staff,501,'verified-return-key-001');
  const done=await f.returns.verify(f.staff,ticket.ticketId);
  assert.equal(done.state,'verified');
  assert.equal(done.receipt.status,'verified_return');
  assert.equal(done.receipt.checkinLibraryId,'MAIN');
  assert.deepEqual(await f.returns.verify(f.staff,ticket.ticketId),done);
  assert.deepEqual(await f.returns.prepare(f.staff,501,'verified-return-key-001'),done);
  assert.equal(f.calls.historical,1);
  assert.equal(f.returns.list(f.staff).length,0);
  assert.equal(f.s.get("SELECT count(*) n FROM audit_events WHERE operation='koha_return_verified'").n,1);
  assert.equal(f.s.get('SELECT count(*) n FROM loans').n,0);
  f.s.close();
});
test('stale staff authority is denied after awaiting Koha',async()=>{
  const f=fixture({async checkedInCheckout(){
    f.s.run('UPDATE users SET active=0 WHERE id=?',f.staff.id);
    return {checkout_id:501,patron_id:101,item_id:81,checkin_date:'2026-10-08T12:00:00Z'};
  }});
  const ticket=await f.returns.prepare(f.staff,501,'stale-authority-key-001');
  await reject(()=>f.returns.verify(f.staff,ticket.ticketId),'FORBIDDEN');
  assert.equal(f.s.get('SELECT state FROM koha_return_tickets').state,'awaiting_koha');
  f.s.close();
});
test('Koha completed-checkout lookup supports pagination with exact patron, copy and date evidence',async()=>{
  const calls=[];
  const transport=async(url,opts)=>{
    const u=new URL(url);calls.push(u);
    if(u.pathname==='/api/v1/oauth/token')return Response.json({access_token:'token',token_type:'Bearer',expires_in:600});
    assert.equal(u.pathname,'/api/v1/checkouts');
    assert.equal(u.searchParams.get('checked_in'),'true');
    assert.equal(u.searchParams.get('patron_id'),'101');
    assert.equal(opts.redirect,'error');
    const page=Number(u.searchParams.get('_page'));
    const rows=page===1?Array.from({length:100},(_,j)=>({checkout_id:j+1,patron_id:101,item_id:j+1,checkin_date:'2026-10-01T00:00:00Z'}))
      :[{checkout_id:501,patron_id:101,item_id:81,checkin_date:'2026-10-08T12:00:00Z',checkin_library_id:'MAIN'}];
    return Response.json(rows);
  };
  const k=makeKoha({NODE_ENV:'test',KOHA_BASE_URL:'http://127.0.0.1:9999',KOHA_CLIENT_ID:'x',KOHA_CLIENT_SECRET:'y'},transport);
  const result=await k.checkedInCheckout({patronId:101,checkoutId:501,itemId:81});
  assert.equal(result.checkin_library_id,'MAIN');
  assert.equal(calls.filter(x=>x.pathname==='/api/v1/checkouts').length,2);
});
test('Koha historical 404 or missing checkin date never implies a completed return',async()=>{
  const mock=async(url)=>{
    if(url.includes('/oauth/token'))return Response.json({access_token:'token',token_type:'Bearer',expires_in:300});
    return new Response(JSON.stringify({error:'forbidden or not found'}),{status:404});
  };
  const koha=makeKoha({NODE_ENV:'test',KOHA_BASE_URL:'http://127.0.0.1:9999',KOHA_CLIENT_ID:'x',KOHA_CLIENT_SECRET:'y'},mock);
  await reject(()=>koha.checkedInCheckout({patronId:101,checkoutId:501,itemId:81}),'KOHA_HTTP_404');
});
