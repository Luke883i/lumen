import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {openStore,bootstrap} from '../src/store.mjs';
import {createService} from '../src/service.mjs';
import {createOidc} from '../src/oidc.mjs';
process.env.NODE_ENV='test';
process.env.LUMEN_DB_PATH=':memory:';
process.env.LUMEN_DEMO='1';
const {buildHandler}=await import('../src/server.mjs');

test('HTTP SSO: redirects and cookies remain server-bound, staff mapping CSRF and subject verification enforced',async()=>{
 const store=openStore(':memory:');bootstrap(store,{NODE_ENV:'test',LUMEN_DEMO:'1'});
 const service=createService(store),student=store.get("SELECT * FROM users WHERE role='student'");
 const staff=store.get("SELECT * FROM users WHERE role='librarian'");
 let calls=0;
 const issuer='https://institution.example.edu';
 const oidc=createOidc(store,{NODE_ENV:'test',OIDC_ISSUER:issuer,OIDC_CLIENT_ID:'test',
   OIDC_CLIENT_SECRET:'not-a-real-secret',OIDC_REDIRECT_URI:'http://127.0.0.1:3000/api/auth/oidc/callback',OIDC_ONLY:'1'},{
   randomPKCECodeVerifier:()=> 'verifier',
   calculatePKCECodeChallenge:async()=> 'challenge',
   discovery:async()=>({serverMetadata:()=>({issuer})}),
   enableNonRepudiationChecks:()=>{},
   buildAuthorizationUrl:(cfg,params)=>{const url=new URL(issuer+'/auth');Object.entries(params).forEach(([k,v])=>url.searchParams.set(k,v));return url;},
   authorizationCodeGrant:async(cfg,url,checks)=>{
     calls++;
     assert.equal(checks.expectedState,url.searchParams.get('state'));
     return {claims:()=>({iss:issuer,sub:'institutional-sub-101',email:student.email,email_verified:true,groups:['superadmin']})};
   }
 });
 const server=createServer(buildHandler({database:store,api:service,oidcApi:oidc}));
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+server.address().port;
 try{
  const config=await (await fetch(base+'/api/config')).json();
  assert.equal(config.identity.oidcEnabled,true);assert.equal(config.identity.oidcOnly,true);
  const pwd=await fetch(base+'/api/login',{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},
    body:JSON.stringify({email:student.email,password:'Demo1234!'})});
  assert.equal(pwd.status,403);
  // For the test, staff binding is performed with a valid pre-existing librarian session.
  const existing=service.login(staff.email,'Demo1234!');
  const csrfHeaders={Origin:base,Cookie:'lumen_session='+encodeURIComponent(existing.token),
    'X-CSRF-Token':existing.csrf,'Content-Type':'application/json'};
  const attempt=await fetch(base+'/api/staff/oidc/bind',{method:'POST',headers:{...csrfHeaders,'X-CSRF-Token':'wrong'},
    body:JSON.stringify({userId:student.id,subject:'institutional-sub-101'})});
  assert.equal(attempt.status,403);
  const bind=await fetch(base+'/api/staff/oidc/bind',{method:'POST',headers:csrfHeaders,
    body:JSON.stringify({userId:student.id,subject:'institutional-sub-101'})});
  assert.equal(bind.status,200);
  const start=await fetch(base+'/api/auth/oidc/start',{redirect:'manual'});
  assert.equal(start.status,302);
  const flow=start.headers.get('set-cookie').split(';')[0];
  assert.ok(start.headers.get('location').startsWith(issuer+'/auth'));
  const state=new URL(start.headers.get('location')).searchParams.get('state');
  const bad=await fetch(base+'/api/auth/oidc/callback?code=test&state=WRONG',{redirect:'manual',headers:{Cookie:flow}});
  assert.equal(bad.status,303);assert.equal(bad.headers.get('location'),'/accedi?auth_error=1');
  assert.equal(calls,0);
  const good=await fetch(base+'/api/auth/oidc/callback?code=test&state='+state,{redirect:'manual',headers:{Cookie:flow}});
  assert.equal(good.status,303);
  assert.equal(good.headers.get('location'),'/me');
  const cookies=good.headers.getSetCookie();
  const session=cookies.find(x=>x.startsWith('lumen_session=')).split(';')[0];
  assert.ok(cookies.some(x=>x.startsWith('lumen_oidc_flow=')&&x.includes('Max-Age=0')));
  const me=await (await fetch(base+'/api/me',{headers:{Cookie:session}})).json();
  assert.equal(me.user.role,'student');
  assert.equal(calls,1);
  const replay=await fetch(base+'/api/auth/oidc/callback?code=test&state='+state,{redirect:'manual',headers:{Cookie:flow}});
  assert.equal(replay.headers.get('location'),'/accedi?auth_error=1');
  assert.equal(calls,1);
 }finally{
  await new Promise(resolve=>server.close(resolve));store.close();
 }
});
