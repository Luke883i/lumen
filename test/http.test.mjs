import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';

process.env.LUMEN_DB_PATH=':memory:';
process.env.LUMEN_DEMO='1';
process.env.NODE_ENV='test';
const {buildHandler}=await import('../src/server.mjs');
const server=createServer(buildHandler());
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const host='http://127.0.0.1:'+server.address().port;
test.after(()=>new Promise(resolve=>server.close(resolve)));

test('health, static PWA shell, and PNG icons are served',async()=>{
  const health=await fetch(host+'/api/health');
  assert.deepEqual(await health.json(),{status:'ok',db:true});
  const html=await fetch(host+'/');
  assert.equal(html.status,200);
  assert.ok((await html.text()).includes('LUMEN'));
  const icon=await fetch(host+'/icons/icon-192.png');
  assert.equal(icon.status,200);
  const bytes=new Uint8Array(await icon.arrayBuffer());
  assert.deepEqual(Array.from(bytes.slice(0,8)),[137,80,78,71,13,10,26,10]);
  const manifest=await fetch(host+'/manifest.webmanifest');
  assert.equal((await manifest.json()).display,'standalone');
});
test('HTTP auth, same-origin, CSRF, and patron authorisation',async()=>{
  const badOrigin=await fetch(host+'/api/login',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://evil.example'},body:JSON.stringify({email:'student@lumen.local',password:'Demo1234!'})});
  assert.equal(badOrigin.status,403);
  const login=await fetch(host+'/api/login',{method:'POST',headers:{'Content-Type':'application/json',Origin:host},body:JSON.stringify({email:'student@lumen.local',password:'Demo1234!'})});
  assert.equal(login.status,200);
  const data=await login.json(),cookie=login.headers.get('set-cookie').split(';')[0];
  assert.equal(data.user.role,'student');
  const books=await (await fetch(host+'/api/books')).json(),book=books[0];
  const base={method:'POST',headers:{'Content-Type':'application/json',Origin:host,Cookie:cookie}};
  const badCsrf=await fetch(host+'/api/holds',{...base,body:JSON.stringify({bookId:book.id})});
  assert.equal(badCsrf.status,403);
  const goodHeaders={...base.headers,'X-CSRF-Token':data.csrf};
  const replayHeaders={...goodHeaders,'Idempotency-Key':'hold-receipt-12345678'};
  const hold=await fetch(host+'/api/holds',{...base,headers:replayHeaders,body:JSON.stringify({bookId:book.id})});
  assert.equal(hold.status,201);
  const first=await hold.json();
  const replay=await fetch(host+'/api/holds',{...base,headers:replayHeaders,body:JSON.stringify({bookId:book.id})});
  assert.equal(replay.status,201);
  assert.deepEqual(await replay.json(),first);
  const duplicate=await fetch(host+'/api/holds',{...base,headers:goodHeaders,body:JSON.stringify({bookId:book.id})});
  assert.equal(duplicate.status,409);
  const forbidden=await fetch(host+'/api/suggestions',{...base,headers:goodHeaders,body:JSON.stringify({title:'X',author:'Y',reason:'Z'})});
  assert.equal(forbidden.status,403);
  const mine=await fetch(host+'/api/holds',{headers:{Cookie:cookie}});
  assert.equal((await mine.json()).length,1);
  const logout=await fetch(host+'/api/logout',{...base,headers:goodHeaders,body:'{}'});
  assert.equal(logout.status,200);
  const blocked=await fetch(host+'/api/holds',{headers:{Cookie:cookie}});
  assert.equal(blocked.status,401);
});

test('staff mutation audit is permission-scoped and omits raw data',async()=>{
  const login=async email=>{
    const r=await fetch(host+'/api/login',{method:'POST',headers:{'Content-Type':'application/json',Origin:host},
      body:JSON.stringify({email,password:'Demo1234!'})});
    assert.equal(r.status,200);return {body:await r.json(),cookie:r.headers.get('set-cookie').split(';')[0]};
  };
  const student=await login('student@lumen.local');
  const forbidden=await fetch(host+'/api/staff/audit',{headers:{Cookie:student.cookie}});
  assert.equal(forbidden.status,403);
  const staff=await login('librarian@lumen.local');
  const result=await fetch(host+'/api/staff/audit?limit=10',{headers:{Cookie:staff.cookie}});
  assert.equal(result.status,200);
  const entries=await result.json();
  assert.ok(Array.isArray(entries));
  assert.ok(entries.length>=1);
  assert.ok(entries.some(x=>x.operation==='hold'));
  assert.ok(entries.every(x=>!('payload' in x)&&!('password' in x)));
});

test('R8 PWA experience assets and install route are served with correct types',async()=>{
 const module=await fetch(host+'/experience.js');
 assert.equal(module.status,200);
 assert.match(module.headers.get('content-type'),/javascript/);
 assert.ok((await module.text()).includes('installExperience'));
 const css=await fetch(host+'/style.css');
 assert.equal(css.status,200);
 const stylesheet=await css.text();
 assert.ok(stylesheet.includes('--lumen-ink'));
 assert.ok(stylesheet.includes('.lumen-dialog'));
 const start=await fetch(host+'/installazione');
 assert.equal(start.status,200);
 const html=await start.text();
 assert.ok(html.includes('id="lumen-dialog"'));
 const worker=await fetch(host+'/sw.js');
 assert.equal(worker.status,200);
 const source=await worker.text();
 assert.ok(source.includes("'/experience.js'"));
 const manifest=await (await fetch(host+'/manifest.webmanifest')).json();
 assert.deepEqual(manifest.shortcuts.map(x=>x.url),['/catalogo','/me','/notifiche']);
});

test('institutional information and legal routes are anonymous SPA pages',async()=>{
 for(const route of ['/informazioni','/condizioni','/opensource']){
  const r=await fetch(host+route);
  assert.equal(r.status,200,route);
  const html=await r.text();
  assert.ok(html.includes('LUMEN'),route);
  assert.ok(html.includes('id="main"'),route);
 }
 const r=await fetch(host+'/api/config');
 const payload=await r.json();
 assert.ok(payload.institution,'public institution metadata');
 assert.equal(payload.institution.completeness,'incomplete');
 assert.equal(payload.institution.policies.privacy,null);
 assert.equal(payload.institution.policies.terms,null);
 for(const field of ['VAPID_PRIVATE_KEY','OIDC_CLIENT_SECRET','ADMIN_PASSWORD'])
  assert.equal(JSON.stringify(payload).includes(field),false);
});
