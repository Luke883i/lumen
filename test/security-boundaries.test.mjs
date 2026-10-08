import test from 'node:test';
import assert from 'node:assert/strict';
import {openStore,bootstrap,tokenHash} from '../src/store.mjs';
import {createService} from '../src/service.mjs';
import {pushKeys} from './push-fixtures.mjs';
import {trustedOrigin,pruneRevokedPush} from '../src/security.mjs';
function fixture(){
 const s=openStore(':memory:');bootstrap(s,{NODE_ENV:'test',LUMEN_DEMO:'1'});
 const api=createService(s),u=s.get("SELECT * FROM users WHERE role='student'");
 const enroll=(token,name)=>{
  const endpoint='https://fcm.googleapis.com/fcm/send/bime-'+name;
  assert.equal(api.subscribe(u,{endpoint,keys:pushKeys},token).ok,true);return endpoint;
 };
 return {s,api,u,enroll};
}
test('BIME exact Origin/Host production policy denies downgrade, credentials, injection',()=>{
 for(const [o,h,p] of [
 ['https://library.example.edu','library.example.edu',true],
 ['http://127.0.0.1:3000','127.0.0.1:3000',false],
 ['https://library.example.edu:8443','library.example.edu:8443',true]
 ])assert.equal(trustedOrigin(o,h,{production:p}),true,o);
 for(const [o,h,p] of [
 ['http://library.example.edu','library.example.edu',true],
 ['https://other.example.edu','library.example.edu',true],
 ['https://library.example.edu.attacker.net','library.example.edu',true],
 ['https://u:p@library.example.edu','library.example.edu',true],
 ['https://library.example.edu/redirect','library.example.edu',true],
 ['https://library.example.edu?x=1','library.example.edu',true],
 ['https://library.example.edu#x','library.example.edu',true],
 ['https://library.example.edu','library.example.edu@evil.com',true],
 ['not-a-url','library.example.edu',true],['null','library.example.edu',true],
 [null,'library.example.edu',true],
 ['https://library.example.edu','library.example.edu\r\nx-evil',true],
 ['https://library.example.edu','library.example.edu:443',true]
 ])assert.equal(trustedOrigin(o,h,{production:p}),false,String(o));
});
test('password rotation revokes every device subscription, not just sessions',()=>{
 const f=fixture();
 try{
  const one=f.api.login(f.u.email,'Demo1234!').token;
  const two=f.api.login(f.u.email,'Demo1234!').token;
  f.enroll(one,'password-first');f.enroll(two,'password-second');
  assert.equal(f.s.get('SELECT count(*) n FROM subscriptions').n,2);
  const changed=f.api.changePassword(f.api.current(one),'Demo1234!','NewTemporaryPassphrase2026!');
  assert.equal(changed.reauthenticate,true);
  assert.equal(f.api.current(one),null);assert.equal(f.api.current(two),null);
  assert.equal(f.s.get('SELECT count(*) n FROM subscriptions').n,0);
  assert.equal(f.api.login(f.u.email,'NewTemporaryPassphrase2026!').user.role,'student');
 }finally{f.s.close();}
});
test('bounded local login eviction removes old device binding and keeps new session',()=>{
 const f=fixture();
 try{
  const first=f.api.login(f.u.email,'Demo1234!').token;
  const ep=f.enroll(first,'oldest');
  for(let i=0;i<6;i++){
   const token=f.api.login(f.u.email,'Demo1234!').token;
   if(i===5)f.enroll(token,'latest');
  }
  assert.equal(f.api.current(first),null);
  assert.equal(f.s.get('SELECT count(*) n FROM subscriptions WHERE endpoint=?',ep).n,0);
  assert.equal(f.s.get('SELECT count(*) n FROM subscriptions').n,1);
  assert.ok(f.s.get('SELECT count(*) n FROM sessions').n<=5);
 }finally{f.s.close();}
});
test('expired session pruned on login does not retain push device',()=>{
 const f=fixture();
 try{
  const token=f.api.login(f.u.email,'Demo1234!').token;
  f.enroll(token,'expiry');
  f.s.run('UPDATE sessions SET expires_at=? WHERE token_hash=?',
   new Date(Date.now()-5000).toISOString(),tokenHash(token));
  f.api.login(f.u.email,'Demo1234!');
  assert.equal(f.s.get('SELECT count(*) n FROM subscriptions').n,0);
 }finally{f.s.close();}
});
test('orphan pruning is idempotent and leaves an active device intact',()=>{
 const f=fixture();
 try{
  const token=f.api.login(f.u.email,'Demo1234!').token;
  f.enroll(token,'live');
  assert.equal(pruneRevokedPush(f.s),0);
  assert.equal(f.s.get('SELECT count(*) n FROM subscriptions').n,1);
  f.api.logout(token);assert.equal(pruneRevokedPush(f.s),0);
  assert.equal(f.s.get('SELECT count(*) n FROM subscriptions').n,0);
 }finally{f.s.close();}
});
