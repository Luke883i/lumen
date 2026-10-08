import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {openStore,bootstrap} from '../src/store.mjs';
import {createService} from '../src/service.mjs';
process.env.NODE_ENV='test';
process.env.LUMEN_DB_PATH=':memory:';
process.env.LUMEN_DEMO='1';
const {buildHandler}=await import('../src/server.mjs');
test('BIME HTTP: malformed Origin, session-cookie and path IDs fail closed',async()=>{
 const db=openStore(':memory:');bootstrap(db,{NODE_ENV:'test',LUMEN_DEMO:'1'});
 const api=createService(db),server=createServer(buildHandler({api,database:db}));
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const origin='http://127.0.0.1:'+server.address().port;
 try{
  const credentials=JSON.stringify({email:'student@lumen.local',password:'Demo1234!'});
  for(const bad of ['null','not-a-url','https://attacker.invalid','https://user@'+origin.slice('http://'.length),'https://%']){
   const r=await fetch(origin+'/api/login',{method:'POST',headers:{Origin:bad,'Content-Type':'application/json'},body:credentials});
   assert.equal(r.status,403,bad);
   assert.equal((await r.json()).error.code,'ORIGIN_MISMATCH');
  }
  const missing=await fetch(origin+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:credentials});
  assert.equal(missing.status,403);
  const corrupted=await fetch(origin+'/api/me',{headers:{Cookie:'lumen_session=%E0%A4%A'}});
  assert.equal(corrupted.status,200);
  assert.equal((await corrupted.json()).user,null);
  const invalidPath=await fetch(origin+'/api/books/%ZZ');
  assert.equal(invalidPath.status,400);
  assert.equal((await invalidPath.json()).error.code,'PATH_INVALID');
  const legit=await fetch(origin+'/api/login',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:credentials});
  assert.equal(legit.status,200);
  assert.equal((await legit.json()).user.role,'student');
 }finally{await new Promise(resolve=>server.close(resolve));db.close();}
});
