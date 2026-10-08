import test from 'node:test';
import assert from 'node:assert/strict';
import {makeKoha} from '../src/koha.mjs';

function fixture(){
  const called=[];
  const mock=async(url,init)=>{
    called.push({url,init});
    const u=new URL(url);
    if(u.pathname==='/api/v1/oauth/token'){
      assert.equal(init.method,'POST');
      assert.match(init.headers.Authorization,/^Basic /);
      return new Response(JSON.stringify({access_token:'fixture-access',token_type:'Bearer',expires_in:3600}),{status:200});
    }
    assert.equal(init.headers.Authorization,'Bearer fixture-access');
    if(u.pathname==='/api/v1/libraries')return Response.json([{library_id:'MAIN'}]);
    if(u.pathname==='/api/v1/biblios'){
      if(u.searchParams.has('q')){
        const q=JSON.parse(u.searchParams.get('q'));
        assert.deepEqual(Object.keys(q),['-or']);
      }
      return Response.json([{biblio_id:125,title:'La vita dei libri',author:'Bibliotecaria',isbn:'978123',abstract:'Un test'}]);
    }
    if(u.pathname==='/api/v1/biblios/125')return Response.json({biblio_id:125,title:'La vita dei libri',author:'Bibliotecaria',isbn:'978123'});
    if(u.pathname==='/api/v1/biblios/125/items')return Response.json([{item_id:34,external_id:'LIB-34',location:'A1'}]);
    return new Response('not found',{status:404});
  };
  const bridge=makeKoha({KOHA_BASE_URL:'http://127.0.0.1:9911',KOHA_CLIENT_ID:'lumen',KOHA_CLIENT_SECRET:'fixture',NODE_ENV:'test'},mock);
  return {bridge,called};
}
test('no unconfigured Koha bridge silently falls back to SQLite',async()=>{
  const b=makeKoha({NODE_ENV:'test'});
  assert.equal(b.configured,false);
  assert.throws(()=>b.search('title'),e=>e.code==='KOHA_NOT_CONFIGURED');
});
test('Koha enforces TLS and origin-scope of configured authority',()=>{
  assert.throws(()=>makeKoha({KOHA_BASE_URL:'http://remote.example',KOHA_CLIENT_ID:'A',KOHA_CLIENT_SECRET:'B'}),e=>e.code==='KOHA_CONFIGURATION');
  assert.throws(()=>makeKoha({KOHA_BASE_URL:'https://user:pass@remote.example',KOHA_CLIENT_ID:'A',KOHA_CLIENT_SECRET:'B'}),e=>e.code==='KOHA_CONFIGURATION');
});
test('Koha OAuth2 token is reused; catalogue and items normalize without false availability',async()=>{
  const {bridge,called}=fixture();
  const status=await bridge.status();
  assert.equal(status.connected,true);
  const result=await bridge.search('Vita');
  assert.equal(result.source,'koha');
  assert.equal(result.items[0].id,'koha:125');
  assert.equal(result.items[0].availability,'unknown');
  const book=await bridge.detail('125');
  assert.equal(book.copies,1);
  assert.equal(book.items[0].barcode,'LIB-34');
  assert.equal(book.items[0].loanStatus,'unknown');
  assert.equal(called.filter(x=>x.url.endsWith('/api/v1/oauth/token')).length,1);
  assert.ok(called.every(x=>x.init.redirect==='error'));
});
test('Koha query encoded as JSON value not concatenated expression',async()=>{
  const {bridge,called}=fixture();
  await bridge.search('foo\"\\bar');
  const url=new URL(called.find(x=>x.url.includes('/biblios?')).url);
  assert.equal(typeof JSON.parse(url.searchParams.get('q'))['-or'][0].title['-like'],'string');
});
test('Koha malformed IDs are rejected locally before network',async()=>{
  const {bridge,called}=fixture();
  await assert.rejects(bridge.detail('../125'),e=>e.code==='KOHA_ID_INVALID');
  assert.equal(called.length,0);
});
