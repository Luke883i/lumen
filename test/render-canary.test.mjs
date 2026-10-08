import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const sha='a'.repeat(40);
async function fixture(fn){
 const server=createServer((req,res)=>{
  res.setHeader('Content-Type','application/json');
  if(req.url==='/api/health')res.end(JSON.stringify({status:'ok',db:true}));
  else if(req.url==='/api/version')res.end(JSON.stringify({service:'lumen',revision:sha,mode:'production'}));
  else if(req.url==='/manifest.webmanifest')res.end(JSON.stringify({display:'standalone'}));
  else if(req.url==='/'){res.setHeader('Content-Type','text/html');res.end('<h1>LUMEN</h1>');}
  else{res.statusCode=404;res.end('{}');}
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{await fn('http://127.0.0.1:'+server.address().port);}
 finally{await new Promise(resolve=>server.close(resolve));}
}
async function probe(origin,expected){
 const child=spawn(process.execPath,['scripts/verify-remote.mjs',origin],{
  cwd:root,env:{...process.env,NODE_ENV:'test',EXPECTED_SHA:expected},stdio:['ignore','pipe','pipe']
 });
 const output=[],errors=[];
 child.stdout.on('data',x=>output.push(x.toString()));
 child.stderr.on('data',x=>errors.push(x.toString()));
 const exit=await new Promise((resolve,reject)=>{
  child.once('error',reject);child.once('close',resolve);
 });
 return {exit,report:JSON.parse(output.join('')),errors:errors.join('')};
}
test('canary certifies matching Render revision and all public runtime checks',async()=>{
 await fixture(async origin=>{
  const result=await probe(origin,sha);
  assert.equal(result.exit,0,result.errors);
  assert.equal(result.report.actualSha,sha);
  assert.deepEqual(result.report.checks.map(x=>x.status),['PASS','PASS','PASS','PASS']);
 });
});
test('canary rejects a different deployed Git commit',async()=>{
 await fixture(async origin=>{
  const result=await probe(origin,'b'.repeat(40));
  assert.notEqual(result.exit,0);
  assert.equal(result.report.status,'FAIL');
  assert.equal(result.report.checks.find(x=>x.name==='version').status,'FAIL');
 });
});
