import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {openStore,bootstrap} from '../src/store.mjs';
import {createService} from '../src/service.mjs';
import {pushKeys} from './push-fixtures.mjs';
process.env.NODE_ENV='test';
process.env.LUMEN_DEMO='1';
process.env.LUMEN_DB_PATH=':memory:';
const {buildHandler}=await import('../src/server.mjs');
const keys=pushKeys;
const subscription={endpoint:'https://fcm.googleapis.com/fcm/send/lumen-r9b-http-001',keys};
test('R9b HTTP: authenticated device ownership, CSRF, cross-account rejection and logout revocation',async()=>{
 const s=openStore(':memory:');bootstrap(s,{NODE_ENV:'test',LUMEN_DEMO:'1'});
 const api=createService(s),server=createServer(buildHandler({api,database:s}));
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+server.address().port;
 const oldPublic=process.env.VAPID_PUBLIC_KEY,oldPrivate=process.env.VAPID_PRIVATE_KEY;
 const login=async email=>{
  const r=await fetch(base+'/api/login',{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},
   body:JSON.stringify({email,password:'Demo1234!'})});
  assert.equal(r.status,200);
  const body=await r.json();return {cookie:r.headers.get('set-cookie').split(';')[0],csrf:body.csrf};
 };
 const request=async(method,path,user,body,hasCsrf=true)=>fetch(base+path,{method,headers:{
  Origin:base,'Content-Type':'application/json',Cookie:user.cookie,...(hasCsrf?{'X-CSRF-Token':user.csrf}:{})
 },...(body?{body:JSON.stringify(body)}:{})});
 try{
  const student=await login('student@lumen.local'),faculty=await login('faculty@lumen.local');
  delete process.env.VAPID_PUBLIC_KEY;delete process.env.VAPID_PRIVATE_KEY;
  const unavailable=await request('POST','/api/push-subscription',student,subscription);
  assert.equal(unavailable.status,503);
  assert.equal((await unavailable.json()).error.code,'PUSH_UNAVAILABLE');
  process.env.VAPID_PUBLIC_KEY='test-public-placeholder';
  process.env.VAPID_PRIVATE_KEY='test-private-placeholder';
  const noCsrf=await request('POST','/api/push-subscription',student,subscription,false);
  assert.equal(noCsrf.status,403);
  const register=await request('POST','/api/push-subscription',student,subscription);
  assert.equal(register.status,200);
  const endpoint=encodeURIComponent(subscription.endpoint);
  const selfStatus=await fetch(base+'/api/push-subscription?endpoint='+endpoint,{headers:{Cookie:student.cookie}});
  assert.deepEqual(await selfStatus.json(),{owned:true});
  const peerStatus=await fetch(base+'/api/push-subscription?endpoint='+endpoint,{headers:{Cookie:faculty.cookie}});
  assert.deepEqual(await peerStatus.json(),{owned:false});
  const denied=await request('POST','/api/push-subscription',faculty,subscription);
  assert.equal(denied.status,409);
  assert.equal((await denied.json()).error.code,'PUSH_ENDPOINT_IN_USE');
  const stale=await request('DELETE','/api/push-subscription',faculty,{endpoint:subscription.endpoint});
  assert.equal(stale.status,200);
  assert.equal(s.get('SELECT count(*) n FROM subscriptions').n,1);
  const logout=await request('POST','/api/logout',student);
  assert.equal(logout.status,200);
  assert.equal(s.get('SELECT count(*) n FROM subscriptions').n,0);
  const next=await request('POST','/api/push-subscription',faculty,subscription);
  assert.equal(next.status,200);
  assert.equal(s.get('SELECT count(*) n FROM subscriptions WHERE user_id=(SELECT id FROM users WHERE role=?)','faculty').n,1);
 }finally{
  if(oldPublic===undefined)delete process.env.VAPID_PUBLIC_KEY;else process.env.VAPID_PUBLIC_KEY=oldPublic;
  if(oldPrivate===undefined)delete process.env.VAPID_PRIVATE_KEY;else process.env.VAPID_PRIVATE_KEY=oldPrivate;
  await new Promise(resolve=>server.close(resolve));s.close();
 }
});

test('R9b HTTP: switching local accounts without explicit logout revokes old device binding',async()=>{
 const store=openStore(':memory:');bootstrap(store,{NODE_ENV:'test',LUMEN_DEMO:'1'});
 const api=createService(store),server=createServer(buildHandler({api,database:store}));
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+server.address().port;
 const oldPublic=process.env.VAPID_PUBLIC_KEY,oldPrivate=process.env.VAPID_PRIVATE_KEY;
 const signin=async(email,cookie)=>{
   const r=await fetch(base+'/api/login',{method:'POST',
     headers:{Origin:base,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},
     body:JSON.stringify({email,password:'Demo1234!'})});
   assert.equal(r.status,200);
   return {cookie:r.headers.get('set-cookie').split(';')[0],csrf:(await r.json()).csrf};
 };
 try{
   process.env.VAPID_PUBLIC_KEY='fixture-only-public';
   process.env.VAPID_PRIVATE_KEY='fixture-only-private';
   const previous=await signin('student@lumen.local');
   const registered=await fetch(base+'/api/push-subscription',{method:'POST',headers:{
     Origin:base,Cookie:previous.cookie,'Content-Type':'application/json','X-CSRF-Token':previous.csrf
   },body:JSON.stringify(subscription)});
   assert.equal(registered.status,200);
   assert.equal(store.get('SELECT count(*) n FROM subscriptions').n,1);
   const replacement=await signin('faculty@lumen.local',previous.cookie);
   assert.equal(store.get('SELECT count(*) n FROM subscriptions').n,0);
   const previousSession=await (await fetch(base+'/api/me',{headers:{Cookie:previous.cookie}})).json();
   assert.equal(previousSession.user,null);
   const current=await (await fetch(base+'/api/me',{headers:{Cookie:replacement.cookie}})).json();
   assert.equal(current.user.role,'faculty');
 }finally{
   if(oldPublic===undefined)delete process.env.VAPID_PUBLIC_KEY;else process.env.VAPID_PUBLIC_KEY=oldPublic;
   if(oldPrivate===undefined)delete process.env.VAPID_PRIVATE_KEY;else process.env.VAPID_PRIVATE_KEY=oldPrivate;
   await new Promise(resolve=>server.close(resolve));store.close();
 }
});
test('R9b HTTP: an OIDC callback that replaces a browser cookie revokes old push enrollment',async()=>{
 const store=openStore(':memory:');bootstrap(store,{NODE_ENV:'test',LUMEN_DEMO:'1'});
 const api=createService(store),server=createServer(buildHandler({api,database:store,oidcApi:{
   enabled:true,only:false,
   async finish(){return api.login('faculty@lumen.local','Demo1234!');}
 }}));
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+server.address().port;
 const oldPublic=process.env.VAPID_PUBLIC_KEY,oldPrivate=process.env.VAPID_PRIVATE_KEY;
 try{
   process.env.VAPID_PUBLIC_KEY='fixture-only-public';
   process.env.VAPID_PRIVATE_KEY='fixture-only-private';
   const r=await fetch(base+'/api/login',{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},
     body:JSON.stringify({email:'student@lumen.local',password:'Demo1234!'})});
   assert.equal(r.status,200);
   const student={cookie:r.headers.get('set-cookie').split(';')[0],csrf:(await r.json()).csrf};
   const create=await fetch(base+'/api/push-subscription',{method:'POST',headers:{
     Origin:base,Cookie:student.cookie,'Content-Type':'application/json','X-CSRF-Token':student.csrf
   },body:JSON.stringify(subscription)});
   assert.equal(create.status,200);
   assert.equal(store.get('SELECT count(*) n FROM subscriptions').n,1);
   const callback=await fetch(base+'/api/auth/oidc/callback?state=fixture&code=fixture',
     {redirect:'manual',headers:{Cookie:student.cookie+'; lumen_oidc_flow=fixture'}});
   assert.equal(callback.status,303);
   assert.equal(callback.headers.get('location'),'/me');
   assert.equal(store.get('SELECT count(*) n FROM subscriptions').n,0);
   const old=await (await fetch(base+'/api/me',{headers:{Cookie:student.cookie}})).json();
   assert.equal(old.user,null);
 }finally{
   if(oldPublic===undefined)delete process.env.VAPID_PUBLIC_KEY;else process.env.VAPID_PUBLIC_KEY=oldPublic;
   if(oldPrivate===undefined)delete process.env.VAPID_PRIVATE_KEY;else process.env.VAPID_PRIVATE_KEY=oldPrivate;
   await new Promise(resolve=>server.close(resolve));store.close();
 }
});
