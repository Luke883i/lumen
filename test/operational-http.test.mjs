import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {openStore,bootstrap} from '../src/store.mjs';
import {createService} from '../src/service.mjs';
process.env.NODE_ENV='test';
process.env.LUMEN_DEMO='1';
process.env.LUMEN_DB_PATH=':memory:';
const {buildHandler}=await import('../src/server.mjs');
test('HTTP E2E: patron hold -> librarian queue -> inbox -> checkout; strict RBAC',async()=>{
 const s=openStore(':memory:');bootstrap(s,{NODE_ENV:'test',LUMEN_DEMO:'1'});
 const api=createService(s),server=createServer(buildHandler({api,database:s}));
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+server.address().port;
 async function login(email){
  const r=await fetch(base+'/api/login',{method:'POST',
   headers:{Origin:base,'Content-Type':'application/json'},
   body:JSON.stringify({email,password:'Demo1234!'})});
  assert.equal(r.status,200);
  const body=await r.json();
  return {cookie:r.headers.get('set-cookie').split(';')[0],csrf:body.csrf};
 }
 const get=(path,who)=>fetch(base+path,{headers:who?{Cookie:who.cookie}:{}});
 const post=(path,who,body,key)=>fetch(base+path,{method:'POST',headers:{
  Origin:base,Cookie:who.cookie,'Content-Type':'application/json',
  'X-CSRF-Token':who.csrf,...(key?{'Idempotency-Key':key}:{})
 },body:JSON.stringify(body)});
 try{
  const student=await login('student@lumen.local');
  const faculty=await login('faculty@lumen.local');
  const librarian=await login('librarian@lumen.local');
  assert.equal((await get('/api/staff/holds')).status,401);
  assert.equal((await get('/api/staff/holds',student)).status,403);
  assert.equal((await get('/api/staff/holds',faculty)).status,403);
  const book=api.addBook(s.get("SELECT * FROM users WHERE role='librarian'"),
   {title:'HTTP operator handoff',author:'Fixture',copies:1});
  const keyA='http-hold-semantic-0001',keyB='http-hold-semantic-0002';
  const rA=await post('/api/holds',student,{bookId:book.id},keyA);
  assert.equal(rA.status,201);assert.equal((await rA.json()).status,'ready');
  const rB=await post('/api/holds',faculty,{bookId:book.id},keyB);
  assert.equal(rB.status,201);assert.equal((await rB.json()).status,'queued');
  const page=await get('/api/staff/holds?limit=1&offset=0',librarian);
  assert.equal(page.status,200);
  const listed=await page.json();
  assert.equal(listed.total,2);assert.equal(listed.rows[0].status,'ready');
  const second=await (await get('/api/staff/holds?limit=1&offset=1',librarian)).json();
  assert.equal(second.rows[0].status,'queued');
  const staffInbox=await (await get('/api/notifications',librarian)).json();
  assert.equal(staffInbox.filter(n=>n.kind==='staff_hold').length,2);
  const secondCopy=await (await get('/api/notifications',faculty)).json();
  assert.ok(secondCopy.some(n=>n.kind==='hold_queued'));
  assert.equal((await get('/api/staff/holds?limit=-1',librarian)).status,400);
  const duplicate=await post('/api/holds',student,{bookId:book.id},keyA);
  assert.equal(duplicate.status,201);
  const after=await (await get('/api/notifications',librarian)).json();
  assert.equal(after.filter(n=>n.kind==='staff_hold').length,2);
  const cancelled=await post('/api/holds/'+listed.rows[0].id+'/cancel',student,{});
  assert.equal(cancelled.status,200);
  const newQueue=await (await get('/api/staff/holds',librarian)).json();
  assert.equal(newQueue.total,1);assert.equal(newQueue.rows[0].status,'ready');
 }finally{await new Promise(resolve=>server.close(resolve));s.close();}
});
test('HTTP E2E: staff broadcast persisted per role; VAPID disabled is honest',async()=>{
 const s=openStore(':memory:');bootstrap(s,{NODE_ENV:'test',LUMEN_DEMO:'1'});
 const api=createService(s),server=createServer(buildHandler({api,database:s}));
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+server.address().port;
 const before=[process.env.VAPID_PUBLIC_KEY,process.env.VAPID_PRIVATE_KEY];
 try{
  delete process.env.VAPID_PUBLIC_KEY;delete process.env.VAPID_PRIVATE_KEY;
  const cfg=await (await fetch(base+'/api/push-config')).json();
  assert.equal(cfg.enabled,false);
  const a=api.login('librarian@lumen.local','Demo1234!');
  const sent=await fetch(base+'/api/staff/broadcast',{method:'POST',headers:{
   Origin:base,Cookie:'lumen_session='+a.token,'Content-Type':'application/json','X-CSRF-Token':a.csrf
  },body:JSON.stringify({role:'student',title:'Orario di prova',body:'Controlla la tua casella'})});
  assert.equal(sent.status,200);
  const result=await sent.json();
  assert.equal(result.recipients,1);
  const student=s.get("SELECT * FROM users WHERE role='student'");
  assert.equal(api.notifyList(student).filter(n=>n.title==='Orario di prova').length,1);
  assert.equal(s.get("SELECT count(*) n FROM subscriptions").n,0);
 }finally{
  [process.env.VAPID_PUBLIC_KEY,process.env.VAPID_PRIVATE_KEY]=before;
  if(before[0]===undefined)delete process.env.VAPID_PUBLIC_KEY;
  if(before[1]===undefined)delete process.env.VAPID_PRIVATE_KEY;
  await new Promise(resolve=>server.close(resolve));s.close();
 }
});
