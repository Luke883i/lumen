import test from 'node:test';
import assert from 'node:assert/strict';
import {openStore,bootstrap} from '../src/store.mjs';
import {createService} from '../src/service.mjs';
import {createOidc,oidcConfiguration} from '../src/oidc.mjs';
const environment={NODE_ENV:'test',OIDC_ISSUER:'https://idp.example.edu',OIDC_CLIENT_ID:'lumen',
  OIDC_CLIENT_SECRET:'fixture-not-real',OIDC_REDIRECT_URI:'http://127.0.0.1:3000/api/auth/oidc/callback'};
const fails=(fn,code)=>assert.rejects(fn,e=>e.code===code);
function setup(overrides={}){
 const s=openStore(':memory:');bootstrap(s,{NODE_ENV:'test',LUMEN_DEMO:'1'});
 const librarian=s.get("SELECT * FROM users WHERE role='librarian'");
 const student=s.get("SELECT * FROM users WHERE role='student'");
 const faculty=s.get("SELECT * FROM users WHERE role='faculty'");
 const calls={code:0,nonce:null,signatureChecks:0},state={subject:'subject-123',email:student.email,verified:true,role:'librarian'};
 const library={
  randomPKCECodeVerifier:()=> 'unique-verifier-code',
  randomNonce:()=> 'fixture-nonce',
  calculatePKCECodeChallenge:async verifier=>'challenge:'+verifier,
  randomState:()=> 'fixture-state',
  async discovery(){return {serverMetadata:()=>({issuer:environment.OIDC_ISSUER})};},
  enableNonRepudiationChecks(){calls.signatureChecks++;},
  buildAuthorizationUrl(config,params){
    const url=new URL('https://idp.example.edu/authorize');
    Object.entries(params).forEach(([key,value])=>url.searchParams.set(key,value));calls.nonce=params.nonce;return url;
  },
  async authorizationCodeGrant(config,url,checks){
    calls.code++;
    assert.equal(checks.pkceCodeVerifier,'unique-verifier-code');
    assert.equal(checks.expectedNonce,calls.nonce);
    assert.equal(checks.expectedState,url.searchParams.get('state'));
    assert.equal(checks.idTokenExpected,true);
    return {claims:()=>({
      iss:environment.OIDC_ISSUER,sub:state.subject,email:state.email,
      email_verified:state.verified,role:state.role
    })};
  }
 };
 return {s,librarian,student,faculty,calls,state,oidc:createOidc(s,{...environment,...overrides},library),library};
}
test('OIDC config is strictly opt-in, issuer HTTPS and callback explicit',()=>{
 assert.equal(oidcConfiguration({}).enabled,false);
 assert.throws(()=>oidcConfiguration({OIDC_ONLY:'1'}),/OIDC_CONFIGURATION/);
 assert.throws(()=>oidcConfiguration({...environment,OIDC_CLIENT_SECRET:''}),/OIDC_CONFIGURATION/);
 assert.throws(()=>oidcConfiguration({...environment,OIDC_ISSUER:'http://idp.example.edu'}),/OIDC_CONFIGURATION/);
 assert.throws(()=>oidcConfiguration({...environment,NODE_ENV:'production'}),/OIDC_CONFIGURATION/);
 assert.equal(oidcConfiguration(environment).enabled,true);
});
test('OIDC uses one-time state, PKCE, nonce and explicit database binding',async()=>{
 const f=setup(),service=createService(f.s);
 await fails(async()=>f.oidc.bind(f.student,f.student.id,'subject-123'),'FORBIDDEN');
 assert.equal(f.oidc.bind(f.librarian,f.student.id,'subject-123').linked,true);
 const start=await f.oidc.start();
 const auth=new URL(start.redirect);
 assert.equal(auth.searchParams.get('code_challenge_method'),'S256');
 assert.equal(auth.searchParams.get('scope'),'openid email');
 assert.ok(auth.searchParams.get('state'));
 assert.equal(f.s.get('SELECT count(*) n FROM oidc_flows').n,1);
 const result=await f.oidc.finish(start.flow,auth.searchParams.get('state'),'state='+encodeURIComponent(auth.searchParams.get('state'))+'&code=test');
 assert.equal(result.user.role,'student'); // never elevated by role claim
 assert.equal(service.current(result.token).role,'student');
 assert.equal(f.calls.code,1);
 assert.equal(f.calls.signatureChecks,1);
 await fails(()=>f.oidc.finish(start.flow,auth.searchParams.get('state'),'state=x&code=test'),'OIDC_STATE_INVALID');
 assert.equal(f.calls.code,1);
 assert.equal(f.s.get("SELECT count(*) n FROM audit_events WHERE operation='oidc_login'").n,1);
 f.s.close();
});
test('issuer subject binding is immutable and cannot be attached to two accounts',()=>{
 const f=setup();
 const first=f.oidc.bind(f.librarian,f.student.id,'subject-123');
 assert.equal(first.userId,f.student.id);
 assert.equal(f.oidc.bind(f.librarian,f.student.id,'subject-123').linked,true);
 assert.equal(f.s.get("SELECT count(*) n FROM audit_events WHERE operation='oidc_bind'").n,1);
 assert.throws(()=>f.oidc.bind(f.librarian,f.faculty.id,'subject-123'),e=>e.code==='OIDC_SUBJECT_IN_USE');
 assert.throws(()=>f.oidc.bind(f.librarian,f.student.id,'another-identity'),e=>e.code==='OIDC_BINDING_EXISTS');
 assert.equal(f.s.get('SELECT count(*) n FROM oidc_bindings').n,1);
 f.s.close();
});
test('unmapped, unverified, email-mismatched and disabled identities fail closed',async()=>{
 for(const scenario of ['unmapped','unverified','wrong-email','disabled']){
  const f=setup();
  if(scenario!=='unmapped')f.oidc.bind(f.librarian,f.student.id,'subject-123');
  if(scenario==='unverified')f.state.verified=false;
  if(scenario==='wrong-email')f.state.email=f.faculty.email;
  if(scenario==='disabled')f.s.run('UPDATE users SET active=0 WHERE id=?',f.student.id);
  const start=await f.oidc.start(),state=new URL(start.redirect).searchParams.get('state');
  const expected={unmapped:'OIDC_UNLINKED',unverified:'OIDC_CLAIMS_INVALID','wrong-email':'OIDC_EMAIL_MISMATCH',disabled:'OIDC_UNLINKED'}[scenario];
  await fails(()=>f.oidc.finish(start.flow,state,'code=x&state='+state),expected);
  assert.equal(f.s.get("SELECT count(*) n FROM audit_events WHERE operation='oidc_login'").n,0);
  f.s.close();
 }
});
test('state mismatch and expired cookie cannot reach IdP callback',async()=>{
 const f=setup();
 f.oidc.bind(f.librarian,f.student.id,'subject-123');
 const a=await f.oidc.start(),b=await f.oidc.start();
 const sa=new URL(a.redirect).searchParams.get('state');
 const sb=new URL(b.redirect).searchParams.get('state');
 await fails(()=>f.oidc.finish(a.flow,sb,'code=x&state='+sb),'OIDC_STATE_INVALID');
 assert.equal(f.calls.code,0);
 f.s.run('UPDATE oidc_flows SET expires_at=?',new Date(Date.now()-1000).toISOString());
 await fails(()=>f.oidc.finish(a.flow,sa,'code=x&state='+sa),'OIDC_STATE_INVALID');
 f.s.close();
});

test('OIDC authorization flow limit bounds persistent state while allowing expiry recovery',async()=>{
 const f=setup({OIDC_FLOW_LIMIT:'2'});
 await f.oidc.start();await f.oidc.start();
 await fails(()=>f.oidc.start(),'OIDC_FLOW_CAPACITY');
 assert.equal(f.s.get('SELECT count(*) n FROM oidc_flows').n,2);
 f.s.run('UPDATE oidc_flows SET expires_at=? WHERE rowid IN (SELECT rowid FROM oidc_flows LIMIT 1)',
   new Date(Date.now()-60000).toISOString());
 await f.oidc.start();
 assert.equal(f.s.get('SELECT count(*) n FROM oidc_flows').n,2);
 assert.equal(f.s.get("SELECT count(*) n FROM sqlite_master WHERE type='index' AND name='idx_oidc_flows_expiry'").n,1);
 f.s.close();
});
test('OIDC v6 refuses a token helper incompatible with the actual library',async()=>{
 const f=setup();
 f.oidc.bind(f.librarian,f.student.id,'subject-123');
 f.library.authorizationCodeGrant=async()=>({getValidatedIdTokenClaims:()=>({iss:environment.OIDC_ISSUER,sub:'subject-123',email:f.student.email,email_verified:true})});
 const start=await f.oidc.start();
 const state=new URL(start.redirect).searchParams.get('state');
 await fails(()=>f.oidc.finish(start.flow,state,'code=x&state='+state),'OIDC_CLAIMS_INVALID');
 assert.equal(f.s.get("SELECT count(*) n FROM sessions").n,0);
 f.s.close();
});

test('production SSO-only runtime refuses to start before an active librarian is mapped',()=>{
 const f=setup();
 const secure={...environment,NODE_ENV:'production',OIDC_ONLY:'1',
   OIDC_REDIRECT_URI:'https://lumen.example.edu/api/auth/oidc/callback'};
 assert.throws(()=>createOidc(f.s,secure,f.library),/OIDC_PRODUCTION_LOCKOUT/);
 f.oidc.bind(f.librarian,f.librarian.id,'real-librarian-idp-subject');
 assert.equal(createOidc(f.s,secure,f.library).only,true);
 f.s.run('UPDATE users SET active=0 WHERE id=?',f.librarian.id);
 assert.throws(()=>createOidc(f.s,secure,f.library),/OIDC_PRODUCTION_LOCKOUT/);
 f.s.close();
});
