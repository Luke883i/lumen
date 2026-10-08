// Post-deploy public smoke. No credentials, mutations, or secret-bearing URLs.
const raw=process.argv[2];
if(!raw){console.error('Usage: npm run verify:remote -- https://your-service.onrender.com');process.exit(2);}
const url=new URL(raw);
const local=['localhost','127.0.0.1'].includes(url.hostname);
if((url.protocol!=='https:'&&!(local&&process.env.NODE_ENV==='test'))||
   url.username||url.password||url.pathname!=='/'||url.search||url.hash)
 throw Error('VERIFY_REMOTE_URL_INVALID: use an HTTPS origin without credentials, path or query');
const result={suite:'render_post_deploy',origin:url.origin,status:'BLOCKED',checks:[],
  expectedSha:process.env.EXPECTED_SHA||null};
async function probe(name,path,verify){
 try{
  const response=await fetch(url.origin+path,{signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw Error('HTTP_'+response.status);
  const outcome=await verify(response);
  if(!outcome)throw Error('UNEXPECTED_RESPONSE');
  result.checks.push({name,status:'PASS'});
 }catch(e){result.checks.push({name,status:'FAIL',reason:String(e.code||e.message||'UNKNOWN').slice(0,90)});}
}
let sha=null;
await probe('health','/api/health',async r=>{
 const j=await r.json();return j.status==='ok'&&j.db===true;
});
await probe('version','/api/version',async r=>{
 const j=await r.json();sha=j.revision;
 return j.service==='lumen'&&j.mode==='production'&&typeof sha==='string'&&/^[a-f0-9]{40}$/i.test(sha) &&
   (!result.expectedSha||sha===result.expectedSha);
});
await probe('pwa','/manifest.webmanifest',async r=>(await r.json()).display==='standalone');
await probe('home','/',async r=>(await r.text()).includes('LUMEN'));
result.actualSha=sha;
result.status=result.checks.every(x=>x.status==='PASS')?'PASS':'FAIL';
console.log(JSON.stringify(result,null,2));
if(result.status!=='PASS')process.exitCode=1;
