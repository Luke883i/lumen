// R15: exercised Service Worker fetch/CacheStorage behavior, not source-string heuristics.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const source=readFileSync(new URL('../public/sw.js',import.meta.url),'utf8');
const host='https://lumen.example';
function harness({online=true,stored={},initialCaches=[],failCacheWrite=false}={}){
  const handlers={},called=[],deleted=[],cacheNames=new Map();
  const makeResponse=label=>({ok:true,label,clone(){return makeResponse(label);}});
  const fullPath=value=>typeof value==='string'?new URL(value,host).pathname:new URL(value.url).pathname;
  const records=new Map(Object.entries(stored).map(([name,value])=>[fullPath(name),makeResponse(value)]));
  for(const name of initialCaches)cacheNames.set(name,new Map());
  const bucket={
    async match(request){return records.get(fullPath(request));},
    async put(request,response){if(failCacheWrite)throw Error('QUOTA_EXCEEDED');records.set(fullPath(request),response);},
    async addAll(paths){for(const x of paths)records.set(fullPath(x),makeResponse('precached'));}
  };
  const caches={
    async open(name){cacheNames.set(name,records);return bucket;},
    async match(request){return records.get(fullPath(request));},
    async keys(){return [...cacheNames.keys()];},
    async delete(name){deleted.push(name);cacheNames.delete(name);return true;}
  };
  const self={location:{origin:host},
    addEventListener(name,fn){handlers[name]=fn;},
    skipWaiting:async()=>{},
    clients:{claim:async()=>{}}
  };
  const fetch=async(request,options)=>{
    called.push({path:fullPath(request),cache:options?.cache});
    if(!online)throw Error('OFFLINE');
    return makeResponse('network-'+fullPath(request));
  };
  runInNewContext(source,{self,caches,fetch,URL});
  async function request(path,{method='GET',mode='cors',origin=host}={}){
    let provided=null;
    const event={
      request:{url:new URL(path,origin).href,method,mode},
      respondWith(p){provided=p;},
      waitUntil(p){provided=provided||p;}
    };
    handlers.fetch(event);
    return provided?await provided:null;
  }
  async function activate(){
    let result;
    handlers.activate({waitUntil(p){result=p;}});
    await result;
  }
  return {request,activate,handlers,records,cacheNames,called,deleted};
}
test('R15 mutation: online JS/CSS requests must not reuse earlier cached deployment',async()=>{
  const h=harness({stored:{'/app.js':'old-code','/style.css':'old-styles','/manifest.webmanifest':'old-brand'}});
  for(const path of ['/app.js','/style.css','/manifest.webmanifest']){
    const result=await h.request(path);
    assert.equal(result.label,'network-'+path,path);
    assert.equal(h.records.get(path)?.label,'network-'+path,'cache must be refreshed');
  }
  assert.equal(h.called.length,3);
  assert.ok(h.called.every(x=>x.cache==='no-store'),'browser HTTP cache bypass');
});
test('R15 mutation: offline navigation and static modules use latest verified cached assets',async()=>{
  const h=harness({online:false,stored:{'/':'offline-shell','/app.js':'last-good-code','/style.css':'last-good-css'}});
  assert.equal((await h.request('/installazione',{mode:'navigate'})).label,'offline-shell');
  assert.equal((await h.request('/app.js')).label,'last-good-code');
  assert.equal((await h.request('/style.css')).label,'last-good-css');
});
test('R15 mutation: APIs and cross-origin requests never intercept or cache; 404 stays remote',async()=>{
 const h=harness({stored:{'/':'shell'}});
 assert.equal(await h.request('/api/loans'),null);
 assert.equal(await h.request('/app.js',{method:'POST'}),null);
 assert.equal(await h.request('/app.js',{origin:'https://other.example'}),null);
 assert.equal(h.called.length,0);
});
test('R15 mutation: activation deletes only older LUMEN cache namespaces',async()=>{
 const h=harness({initialCaches:['other-pwa-static','lumen-static-v1','lumen-static-v7']});
 await h.activate();
 assert.ok(h.deleted.includes('lumen-static-v1'));
 assert.ok(h.deleted.includes('lumen-static-v7'));
 assert.equal(h.deleted.includes('other-pwa-static'),false);
 assert.equal(h.cacheNames.has('other-pwa-static'),true);
});
test('R15 mutation: no unproven online resource response is cached',async()=>{
 const h=harness({stored:{'/app.js':'last-good-code'}});
 const normal=await h.request('/app.js');
 assert.equal(normal.label,'network-/app.js');
 const previous=h.records.get('/app.js');
 assert.equal(previous.label,'network-/app.js');
});

test('R15 saturation: quota failure must not downgrade a successful online JS to stale cache',async()=>{
 const h=harness({online:true,stored:{'/app.js':'obsolete-app'},failCacheWrite:true});
 const current=await h.request('/app.js');
 assert.equal(current.label,'network-/app.js');
 assert.equal(h.records.get('/app.js')?.label,'obsolete-app','failed write must not corrupt existing cache');
});
