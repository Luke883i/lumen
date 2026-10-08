import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {openStore,bootstrap} from '../src/store.mjs';
import {createService} from '../src/service.mjs';
import {createKohaReturns} from '../src/koha-returns.mjs';

process.env.NODE_ENV='test';
process.env.LUMEN_DEMO='1';
process.env.LUMEN_DB_PATH=':memory:';
const {buildHandler}=await import('../src/server.mjs');

async function fixture(fn){
  const s=openStore(':memory:');bootstrap(s,{NODE_ENV:'test',LUMEN_DEMO:'1'});
  const staff=s.get("SELECT * FROM users WHERE role='librarian'");
  const student=s.get("SELECT * FROM users WHERE role='student'");
  let checked=false,historyCalls=0;
  const koha={configured:true,
    async checkout(id){return {checkout_id:id,patron_id:101,item_id:81,checkin_date:null};},
    async checkedInCheckout(){historyCalls++;return checked?{
      checkout_id:501,patron_id:101,item_id:81,checkin_date:'2026-10-08T11:40:00Z',checkin_library_id:'MAIN'
    }:null;}
  };
  const ret=createKohaReturns(s,koha,{KOHA_CIRCULATION_ENABLED:'1',KOHA_LOANS_ENABLED:'1',KOHA_RETURNS_ENABLED:'1'});
  const server=createServer(buildHandler({api:createService(s),database:s,kohaApi:koha,kohaReturnsApi:ret}));
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base='http://127.0.0.1:'+server.address().port;
  async function login(email){
    const r=await fetch(base+'/api/login',{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify({email,password:'Demo1234!'})});
    assert.equal(r.status,200);
    return {cookie:r.headers.get('set-cookie').split(';')[0],...(await r.json())};
  }
  const send=(path,user,body,key)=>fetch(base+path,{method:'POST',
    headers:{Origin:base,Cookie:user.cookie,'Content-Type':'application/json','X-CSRF-Token':user.csrf,...(key?{'Idempotency-Key':key}:{})},
    body:JSON.stringify(body)});
  try{await fn({s,staff,student,base,login,send,checkin:()=>{checked=true},history:()=>historyCalls});}
  finally{await new Promise(resolve=>server.close(resolve));s.close();}
}
test('R5 HTTP: returns are staff-only and cannot create a Koha checkin themselves',async()=>{
  await fixture(async({s,staff,student,base,login,send,checkin,history})=>{
    const clerk=await login(staff.email),patron=await login(student.email);
    const config=await (await fetch(base+'/api/config')).json();
    assert.equal(config.koha.returnsEnabled,true);
    assert.equal((await fetch(base+'/api/staff/koha/returns')).status,401);
    assert.equal((await fetch(base+'/api/staff/koha/returns',{headers:{Cookie:patron.cookie}})).status,403);
    assert.equal((await send('/api/staff/koha/returns/prepare',patron,{checkoutId:501},'r5-user-forbidden-001')).status,403);
    const missingCsrf=await fetch(base+'/api/staff/koha/returns/prepare',{method:'POST',headers:{Origin:base,Cookie:clerk.cookie,'Content-Type':'application/json'},body:'{"checkoutId":501}'});
    assert.equal(missingCsrf.status,403);
    const started=await send('/api/staff/koha/returns/prepare',clerk,{checkoutId:501},'r5-http-return-key-001');
    assert.equal(started.status,201);
    const ticket=await started.json();
    assert.equal(ticket.state,'awaiting_koha');
    assert.equal(s.get('SELECT count(*) n FROM loans').n,0);
    const unconfirmed=await send('/api/staff/koha/returns/verify',clerk,{ticketId:ticket.ticketId});
    assert.equal(unconfirmed.status,409);
    assert.equal((await unconfirmed.json()).error.code,'KOHA_RETURN_NOT_CONFIRMED');
    checkin();
    const accepted=await send('/api/staff/koha/returns/verify',clerk,{ticketId:ticket.ticketId});
    assert.equal(accepted.status,200);
    assert.equal((await accepted.json()).receipt.status,'verified_return');
    const replay=await send('/api/staff/koha/returns/verify',clerk,{ticketId:ticket.ticketId});
    assert.equal(replay.status,200);
    assert.equal(history(),2);
    assert.equal(s.get("SELECT count(*) n FROM audit_events WHERE operation='koha_return_verified'").n,1);
    assert.equal(s.get('SELECT count(*) n FROM loans').n,0);
  });
});
