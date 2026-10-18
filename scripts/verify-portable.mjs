// Exercises real production npm start twice, on the same SQLite file.
// The second start intentionally has NO bootstrap admin secrets.
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {mkdtempSync,rmSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(fileURLToPath(new URL('../',import.meta.url)));
const scratch=mkdtempSync(join(tmpdir(),'lumen-portable-'));
const database=join(scratch,'persistent','library.sqlite');
const email='portable-operator@example.edu', password='A long isolated operator password 2026';
const wait=ms=>new Promise(ok=>setTimeout(ok,ms));
async function allocatePort(){
 const server=createServer();
 await new Promise((ok,bad)=>server.once('error',bad).listen(0,'127.0.0.1',ok));
 const port=server.address().port;
 await new Promise(ok=>server.close(ok));return port;
}
async function shutdown(child){
 if(child.exitCode!==null)return;
 try{if(process.platform==='win32')child.kill();else process.kill(-child.pid,'SIGTERM');}catch{}
 await Promise.race([new Promise(ok=>child.once('exit',ok)),wait(2500)]);
 if(child.exitCode===null)try{if(process.platform==='win32')child.kill('SIGKILL');else process.kill(-child.pid,'SIGKILL');}catch{}
}
async function phase(first){
 const port=await allocatePort(),origin='http://127.0.0.1:'+port;
 const env={...process.env,NODE_ENV:'production',LUMEN_DEMO:'0',PORT:String(port),
   LUMEN_DB_PATH:database,LUMEN_STORAGE_ROOT:scratch};
 // Prevent accidental inherited credentials from weakening the restart proof.
 delete env.ADMIN_EMAIL;delete env.ADMIN_PASSWORD;
 if(first){env.ADMIN_EMAIL=email;env.ADMIN_PASSWORD=password;}
 const stdout=[],stderr=[];
 const child=spawn('npm',['start'],{cwd:root,env,detached:process.platform!=='win32',
   stdio:['ignore','pipe','pipe']});
 child.stdout.on('data',x=>stdout.push(x.toString()));
 child.stderr.on('data',x=>stderr.push(x.toString()));
 try{
  let ready=false;
  for(let i=0;i<130;i++){
   if(child.exitCode!==null)throw Error('PROCESS_EXITED_EARLY '+stderr.join('').slice(-1000));
   try{
    const r=await fetch(origin+'/api/health',{signal:AbortSignal.timeout(500)});
    if(r.status===200&&(await r.json()).db===true){ready=true;break;}
   }catch{}
   await wait(200);
  }
  if(!ready)throw Error('HEALTH_NOT_READY '+stderr.join('').slice(-1000));
  const login=await fetch(origin+'/api/login',{method:'POST',headers:{
   Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({email,password})});
  if(login.status!==200)throw Error('BOOTSTRAP_ADMIN_UNAVAILABLE '+login.status);
  const body=await login.json();
  if(body.user.role!=='librarian')throw Error('STAFF_ROLE_MISSING');
  const session=login.headers.get('set-cookie')?.split(';')[0];
  const who=await (await fetch(origin+'/api/me',{headers:{Cookie:session}})).json();
  if(who.user?.role!=='librarian')throw Error('SESSION_NOT_PERSISTED');
  const manifest=await fetch(origin+'/manifest.webmanifest');
  if(manifest.status!==200||(await manifest.json()).display!=='standalone')
    throw Error('PWA_NOT_SERVED');
  return {phase:first?'bootstrap':'restart_without_secrets',status:'PASS',portBound:true,
   admin:true,session:true,pwa:true};
 }finally{await shutdown(child);}
}
try{
 const first=await phase(true);
 if(!existsSync(database))throw Error('DATABASE_NOT_PERSISTED');
 const second=await phase(false);
 console.log(JSON.stringify({gate:'PORTABLE_PRODUCTION_RESTART',status:'PASS',
  sha:process.env.GIT_SHA||'unbound',evidence:[first,second],
  disclaimer:'Local filesystem persistence does not prove external volume durability'}));
}catch(error){
 console.error(JSON.stringify({gate:'PORTABLE_PRODUCTION_RESTART',status:'FAIL',code:String(error.message).slice(0,160)}));
 process.exitCode=1;
}finally{rmSync(scratch,{recursive:true,force:true});}
