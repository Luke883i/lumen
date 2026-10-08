import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {openStore,bootstrap} from '../src/store.mjs';
import {createService} from '../src/service.mjs';
import {createKohaCirculation} from '../src/koha-circulation.mjs';
process.env.NODE_ENV='test';process.env.LUMEN_DEMO='1';process.env.LUMEN_DB_PATH=':memory:';
const {buildHandler}=await import('../src/server.mjs');

function serverFixture(){
  const s=openStore(':memory:');bootstrap(s,{NODE_ENV:'test',LUMEN_DEMO:'1'});
  const student=s.get("SELECT id,email FROM users WHERE role='student'");
  const staff=s.get("SELECT id,email FROM users WHERE role='librarian'");
  const writes=[];
  const holds=[];
  const bridge={
    configured:true,
    async patron(id){return {patron_id:id,email:student.email};},
    async patronHolds(id){return holds.filter(h=>h.patron_id===id);},
    async placeHold({patronId,biblioId}){
      const hold={hold_id:995,patron_id:patronId,biblio_id:biblioId,priority:1,cancellation_date:null};
      writes.push(hold);holds.push(hold);return hold;
    },
    async hold(id){return holds.find(h=>h.hold_id===id);}
  };
  const circ=createKohaCirculation(s,bridge,{KOHA_CIRCULATION_ENABLED:'1',KOHA_PICKUP_LIBRARY_ID:'MAIN'});
  const server=createServer(buildHandler({api:createService(s),database:s,kohaApi:bridge,kohaCirculationApi:circ}));
  return {s,student,staff,writes,holds,server};
}
async function withServer(fn){
  const fixture=serverFixture();
  await new Promise(resolve=>fixture.server.listen(0,'127.0.0.1',resolve));
  const root='http://127.0.0.1:'+fixture.server.address().port;
  try{await fn(fixture,root);}
  finally{await new Promise(resolve=>fixture.server.close(resolve));fixture.s.close();}
}
async function login(root,email){
  const response=await fetch(root+'/api/login',{method:'POST',
    headers:{Origin:root,'Content-Type':'application/json'},
    body:JSON.stringify({email,password:'Demo1234!'})});
  assert.equal(response.status,200);
  return {cookie:response.headers.get('set-cookie').split(';')[0],...(await response.json())};
}
const post=(root,path,session,data,key)=>fetch(root+path,{
  method:'POST',headers:{Origin:root,'Content-Type':'application/json',
    Cookie:session.cookie,'X-CSRF-Token':session.csrf,...(key?{'Idempotency-Key':key}:{})},
  body:JSON.stringify(data)
});
test('HTTP vertical slice: staff verified binding -> patron scoped hold -> remote receipt -> replay',async()=>{
  await withServer(async(f,root)=>{
    const staff=await login(root,f.staff.email),student=await login(root,f.student.email);
    const cfg=await (await fetch(root+'/api/config')).json();
    assert.equal(cfg.koha.holdsEnabled,true);
    const unauthorized=await post(root,'/api/staff/koha/bind',student,{userId:f.student.id,patronId:101});
    assert.equal(unauthorized.status,403);
    const bind=await post(root,'/api/staff/koha/bind',staff,{userId:f.student.id,patronId:101});
    assert.equal(bind.status,200);
    assert.equal((await bind.json()).mapped,true);
    const binding=await (await fetch(root+'/api/integrations/koha/my/binding',{headers:{Cookie:student.cookie}})).json();
    assert.equal(binding.patronId,101);
    const invalidCsrf=await fetch(root+'/api/integrations/koha/my/holds',{method:'POST',
      headers:{Origin:root,Cookie:student.cookie,'Content-Type':'application/json'},
      body:JSON.stringify({biblioId:125})});
    assert.equal(invalidCsrf.status,403);
    const key='http-koha-receipt-12345';
    const first=await post(root,'/api/integrations/koha/my/holds',student,{biblioId:125},key);
    assert.equal(first.status,201);
    const receipt=await first.json();
    assert.equal(receipt.holdId,995);
    assert.equal(receipt.status,'confirmed');
    const repeated=await post(root,'/api/integrations/koha/my/holds',student,{biblioId:125},key);
    assert.equal(repeated.status,201);
    assert.deepEqual(await repeated.json(),receipt);
    assert.equal(f.writes.length,1);
    const mine=await (await fetch(root+'/api/integrations/koha/my/holds',{headers:{Cookie:student.cookie}})).json();
    assert.equal(mine.holds.length,1);
    assert.equal(mine.holds[0].patron_id,101);
    assert.equal(f.s.get('SELECT count(*) n FROM holds').n,0);
    assert.equal(f.s.get("SELECT count(*) n FROM koha_hold_attempts WHERE state='succeeded'").n,1);
  });
});
test('anonymous cannot query Koha patron identity; no local fallback',async()=>{
  await withServer(async(f,root)=>{
    assert.equal((await fetch(root+'/api/integrations/koha/my/binding')).status,401);
    assert.equal((await fetch(root+'/api/integrations/koha/my/holds')).status,401);
    assert.equal((await fetch(root+'/api/staff/koha/pending')).status,401);
  });
});
