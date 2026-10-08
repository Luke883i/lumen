import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {DatabaseSync} from 'node:sqlite';
import {openStore,bootstrap} from '../src/store.mjs';
import {createService} from '../src/service.mjs';
import {beginPushWorker} from '../src/webpush.mjs';
import {pushKeys} from './push-fixtures.mjs';
import {validPushKeys} from '../src/push-keys.mjs';

const keys=pushKeys;
const endpoint=n=>'https://fcm.googleapis.com/fcm/send/lumen-device-'+n;
const sub=n=>({endpoint:endpoint(n),expirationTime:null,keys});
const failure=(fn,code)=>assert.throws(fn,e=>e.code===code);
function fixture(){
 const s=openStore(':memory:');bootstrap(s,{NODE_ENV:'test',LUMEN_DEMO:'1'});
 const api=createService(s);
 const role=r=>s.get('SELECT * FROM users WHERE role=?',r);
 const student=role('student'),faculty=role('faculty'),staff=role('librarian');
 const login=user=>api.login(user.email,'Demo1234!').token;
 return {s,api,student,faculty,staff,login};
}
test('subscription cannot cross account ownership; idempotent same-account updates preserve owner',()=>{
 const f=fixture(),a=f.login(f.student),b=f.login(f.faculty),device=sub('shared');
 try{
  assert.equal(f.api.subscribe(f.student,device,a).ok,true);
  assert.equal(f.api.subscriptionStatus(f.student,device.endpoint).owned,true);
  assert.equal(f.api.subscriptionStatus(f.faculty,device.endpoint).owned,false);
  const before=f.s.get('SELECT * FROM subscriptions WHERE endpoint=?',device.endpoint);
  failure(()=>f.api.subscribe(f.faculty,device,b),'PUSH_ENDPOINT_IN_USE');
  assert.deepEqual(f.s.get('SELECT * FROM subscriptions WHERE endpoint=?',device.endpoint),before);
  assert.equal(f.api.unsubscribe(f.faculty,device.endpoint).ok,true);
  assert.equal(f.s.get('SELECT user_id FROM subscriptions WHERE endpoint=?',device.endpoint).user_id,f.student.id);
  assert.equal(f.api.subscribe(f.student,device,a).ok,true);
  assert.equal(f.s.get('SELECT count(*) n FROM subscriptions').n,1);
  failure(()=>f.api.subscribe(f.student,device,null),'AUTH_REQUIRED');
  failure(()=>f.api.subscribe(f.student,device,b),'AUTH_REQUIRED');
 }finally{f.s.close();}
});
test('logout revokes only bindings enrolled with that session, not other devices',()=>{
 const f=fixture(),a=f.login(f.student),b=f.login(f.student);
 try{
  f.api.subscribe(f.student,sub('first'),a);
  f.api.subscribe(f.student,sub('second'),b);
  f.api.logout(a);
  assert.equal(f.api.current(a),null);
  assert.equal(f.api.subscriptionStatus(f.student,endpoint('first')).owned,false);
  assert.equal(f.api.subscriptionStatus(f.student,endpoint('second')).owned,true);
  f.api.logout(b);
  assert.equal(f.s.get('SELECT count(*) n FROM subscriptions').n,0);
  failure(()=>f.api.subscribe(f.student,sub('second'),b),'AUTH_REQUIRED');
 }finally{f.s.close();}
});
test('owner can re-enroll after relogin; a stale session cannot revoke new enrollment',()=>{
 const f=fixture(),a=f.login(f.student),b=f.login(f.student);
 try{
  f.api.subscribe(f.student,sub('refresh'),a);
  f.api.subscribe(f.student,sub('refresh'),b);
  f.api.logout(a);
  assert.equal(f.api.subscriptionStatus(f.student,endpoint('refresh')).owned,true);
  f.api.logout(b);
  assert.equal(f.s.get('SELECT count(*) n FROM subscriptions').n,0);
 }finally{f.s.close();}
});
test('deactivation revokes all user devices and prevents re-registration',()=>{
 const f=fixture(),a=f.login(f.student);
 try{
  f.api.subscribe(f.student,sub('disabled'),a);
  f.api.disableUser(f.staff,f.student.id);
  assert.equal(f.s.get('SELECT count(*) n FROM subscriptions WHERE user_id=?',f.student.id).n,0);
  failure(()=>f.api.subscribe(f.student,sub('disabled'),a),'ACCOUNT_DISABLED');
 }finally{f.s.close();}
});
test('malformed endpoint and bogus browser keys cannot be registered',()=>{
 const f=fixture(),a=f.login(f.student);
 try{
  const bad=[
   {endpoint:'https://evil.example/test',keys},
   {endpoint:'https://fcm.googleapis.com:444/test',keys},
   {endpoint:'https://fcm.googleapis.com/test#fragment',keys},
   {endpoint:endpoint('bad'),keys:{p256dh:'AA',auth:'BB'}},
   {endpoint:endpoint('bad'),keys:{p256dh:'!'.repeat(87),auth:keys.auth}}
  ];
  for(const item of bad)assert.throws(()=>f.api.subscribe(f.student,item,a),/./);
  assert.equal(f.s.get('SELECT count(*) n FROM subscriptions').n,0);
 }finally{f.s.close();}
});
test('legacy unowned subscriptions are purged during idempotent R9b migration',()=>{
 const dir=mkdtempSync(join(tmpdir(),'lumen-r9b-'));
 const filename=join(dir,'legacy.sqlite');
 try{
  // Start with an authentic existing LUMEN database, then reconstruct ONLY
  // its pre-R9b subscriptions table. This preserves real users/foreign keys.
  const original=openStore(filename);
  bootstrap(original,{NODE_ENV:'test',LUMEN_DEMO:'1'});
  const previous=original.get("SELECT id FROM users WHERE role='student'").id;
  original.close();
  const old=new DatabaseSync(filename);
  old.exec("DROP TABLE subscriptions");
  old.exec("CREATE TABLE subscriptions (endpoint TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), payload TEXT NOT NULL, created_at TEXT NOT NULL)");
  old.prepare('INSERT INTO subscriptions(endpoint,user_id,payload,created_at) VALUES(?,?,?,?)')
    .run(endpoint('legacy'),previous,JSON.stringify(sub('legacy')),new Date().toISOString());
  old.close();
  const upgraded=openStore(filename);
  assert.equal(upgraded.all('PRAGMA table_info(subscriptions)').filter(x=>x.name==='session_hash').length,1);
  assert.equal(upgraded.get('SELECT count(*) n FROM subscriptions').n,0);
  upgraded.close();
  const reopened=openStore(filename);
  assert.equal(reopened.all('PRAGMA table_info(subscriptions)').filter(x=>x.name==='session_hash').length,1);
  reopened.close();
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('worker delivers only active owner and never retries a revoked/disabled recipient',async()=>{
 const f=fixture(),token=f.login(f.student),sent=[];
 const client={async sendNotification(subscription,payload,options){
  sent.push({endpoint:subscription.endpoint,payload:JSON.parse(payload),options});
 }};
 try{
  f.api.subscribe(f.student,sub('valid'),token);
  f.s.run('INSERT INTO notifications(id,user_id,title,body,kind,created_at) VALUES(?,?,?,?,?,?)',
   'push-confirmed',f.student.id,'Privato','Dati personali','general',new Date().toISOString());
  const worker=await beginPushWorker(f.s,{}, {client,manual:true});
  await worker.tick();
  assert.equal(sent.length,1);
  assert.equal(sent[0].endpoint,endpoint('valid'));
  assert.equal(sent[0].payload.body,undefined);
  assert.equal(sent[0].payload.url,'/notifiche');
  f.api.logout(token);
  f.s.run('INSERT INTO notifications(id,user_id,title,body,kind,created_at) VALUES(?,?,?,?,?,?)',
   'push-after-logout',f.student.id,'Altro','Riservato','general',new Date().toISOString());
  await worker.tick();
  assert.equal(sent.length,1);
  assert.equal(f.s.get("SELECT push_status FROM notifications WHERE id='push-after-logout'").push_status,'skipped');
 }finally{f.s.close();}
});
test('worker rechecks membership between asynchronous device deliveries',async()=>{
 const f=fixture(),token=f.login(f.student),received=[];
 try{
  f.api.subscribe(f.student,sub('a'),token);
  f.api.subscribe(f.student,sub('b'),token);
  f.s.run('INSERT INTO notifications(id,user_id,title,body,kind,created_at) VALUES(?,?,?,?,?,?)',
   'push-mid-revoke',f.student.id,'Titolo','Descrizione','general',new Date().toISOString());
  const client={async sendNotification(subscription){
    received.push(subscription.endpoint);
    if(received.length===1)f.api.logout(token);
  }};
  const worker=await beginPushWorker(f.s,{}, {client,manual:true});
  await worker.tick();
  assert.deepEqual(received,[endpoint('a')]);
  assert.equal(f.s.get("SELECT push_status FROM notifications WHERE id='push-mid-revoke'").push_status,'sent');
 }finally{f.s.close();}
});
test('expired provider endpoints are removed only if their owner and payload still match',async()=>{
 const f=fixture(),a=f.login(f.student),sent=[];
 try{
  f.api.subscribe(f.student,sub('expired'),a);
  f.s.run('INSERT INTO notifications(id,user_id,title,body,kind,created_at) VALUES(?,?,?,?,?,?)',
   'push-expired',f.student.id,'Notice','Generic','general',new Date().toISOString());
  const client={async sendNotification(){sent.push(true);throw {statusCode:410};}};
  const w=await beginPushWorker(f.s,{}, {client,manual:true});
  await w.tick();
  assert.equal(sent.length,1);
  assert.equal(f.s.get('SELECT count(*) n FROM subscriptions').n,0);
 }finally{f.s.close();}
});

test('stale 410 response does not delete a same-account renewed session binding',async()=>{
 const f=fixture(),a=f.login(f.student),b=f.login(f.student);
 try{
  f.api.subscribe(f.student,sub('refresh-race'),a);
  f.s.run('INSERT INTO notifications(id,user_id,title,body,kind,created_at) VALUES(?,?,?,?,?,?)',
    'push-expired-race',f.student.id,'Notice','Generic','general',new Date().toISOString());
  const client={async sendNotification(){
    f.api.subscribe(f.student,sub('refresh-race'),b);
    throw {statusCode:410};
  }};
  const worker=await beginPushWorker(f.s,{}, {client,manual:true});
  await worker.tick();
  assert.equal(f.api.subscriptionStatus(f.student,endpoint('refresh-race')).owned,true);
  f.api.logout(a);
  assert.equal(f.api.subscriptionStatus(f.student,endpoint('refresh-race')).owned,true);
  f.api.logout(b);
  assert.equal(f.s.get('SELECT count(*) n FROM subscriptions').n,0);
 }finally{f.s.close();}
});

test('R9b Web Push key syntax enforces valid P-256 and 16-byte auth before persistence',()=>{
 const f=fixture(),token=f.login(f.student);
 try{
  assert.equal(validPushKeys(keys),true);
  const invalid=[
    {p256dh:'A'.repeat(87),auth:keys.auth}, // correct length but not a valid curve point
    {p256dh:keys.p256dh,auth:'B'.repeat(16)}, // decodes to only 12 octets
    {p256dh:keys.p256dh,auth:keys.auth+'!'},
    {p256dh:keys.p256dh+'===',auth:keys.auth} // padding exceeds Base64url allowance
  ];
  for(const k of invalid){
    assert.equal(validPushKeys(k),false);
    failure(()=>f.api.subscribe(f.student,{endpoint:endpoint('key-invalid'),keys:k},token),'INPUT_INVALID');
  }
  assert.equal(f.s.get('SELECT count(*) n FROM subscriptions').n,0);
 }finally{f.s.close();}
});
