// Exercise documented terminal entry points with ephemeral databases and ports.
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(fileURLToPath(new URL('../',import.meta.url)));
const scratch=mkdtempSync(join(tmpdir(),'lumen-boot-'));
const results=[];
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function freePort(){
 const server=createServer();
 await new Promise((ok,bad)=>server.once('error',bad).listen(0,'127.0.0.1',ok));
 const port=server.address().port;
 await new Promise(ok=>server.close(ok));return port;
}
async function ready(origin,child,label,logs){
 for(let i=0;i<140;i++){
  if(child.exitCode!==null)throw Error(label+' exited: '+logs.join('').slice(-4000));
  try{
   const r=await fetch(origin+'/api/health',{signal:AbortSignal.timeout(600)});
   if(r.status===200 && (await r.json()).db===true)return;
  }catch{}
  await sleep(200);
 }
 throw Error(label+' did not become ready: '+logs.join('').slice(-4000));
}
async function stop(child){
 if(child.exitCode!==null)return;
 try{if(process.platform==='win32')child.kill('SIGTERM');else process.kill(-child.pid,'SIGTERM');}catch{}
 await Promise.race([new Promise(ok=>child.once('exit',ok)),sleep(2500)]);
 if(child.exitCode===null)try{if(process.platform==='win32')child.kill('SIGKILL');else process.kill(-child.pid,'SIGKILL');}catch{}
}
async function scenario(label,args,filename){
 const port=await freePort(),origin='http://127.0.0.1:'+port,logs=[];
 const child=spawn('npm',args,{cwd:root,detached:process.platform!=='win32',
  stdio:['ignore','pipe','pipe'],env:{...process.env,NODE_ENV:'test',LUMEN_DEMO:'1',PORT:String(port),LUMEN_DB_PATH:join(scratch,filename)}});
 child.stdout.on('data',chunk=>logs.push(chunk.toString()));
 child.stderr.on('data',chunk=>logs.push(chunk.toString()));
 try{
  await ready(origin,child,label,logs);
  const home=await fetch(origin+'/');
  if(home.status!==200 || !(await home.text()).includes('LUMEN'))throw Error('app shell missing');
  const manifest=await fetch(origin+'/manifest.webmanifest');
  if(manifest.status!==200 || (await manifest.json()).display!=='standalone')throw Error('manifest invalid');
  const version=await fetch(origin+'/api/version');
  if(version.status!==200||(await version.json()).service!=='lumen')throw Error('revision endpoint missing');
  const catalogue=await fetch(origin+'/api/books');
  if(catalogue.status!==200 || (await catalogue.json()).length<1)throw Error('catalogue missing');
  const login=await fetch(origin+'/api/login',{method:'POST',
   headers:{Origin:origin,'Content-Type':'application/json'},
   body:JSON.stringify({email:'student@lumen.local',password:'Demo1234!'})});
  if(login.status!==200)throw Error('demo login failed: '+login.status);
  const account=await login.json();
  if(account.user?.role!=='student')throw Error('role failure');
  const who=await fetch(origin+'/api/me',{headers:{Cookie:login.headers.get('set-cookie').split(';')[0]}});
  if((await who.json()).user?.role!=='student')throw Error('session not persisted');
  const result={entrypoint:label,status:'PASS',health:true,manifest:true,login:true,
   revision:process.env.GIT_SHA||'unbound'};results.push(result);console.log(JSON.stringify(result));
 }catch(e){throw Error(label+': '+e.message+'\n'+logs.join('').slice(-3000));}
 finally{await stop(child);}
}
try{
 await scenario('npm run dev',['run','dev'],'codespaces.sqlite');
 await scenario('npm start',['start'],'standalone.sqlite');
 console.log(JSON.stringify({suite:'lumen_fresh_boot',status:'PASS',scenarios:results.length}));
}catch(e){console.error(e);process.exitCode=1;}
finally{rmSync(scratch,{recursive:true,force:true});}
