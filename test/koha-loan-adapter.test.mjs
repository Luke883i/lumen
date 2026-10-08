import test from 'node:test';
import assert from 'node:assert/strict';
import {makeKoha} from '../src/koha.mjs';
function fixture(){
 const calls=[];
 const checkout={checkout_id:501,patron_id:101,item_id:81,renewals_count:0,checkin_date:null,due_date:'2026-12-01'};
 const transport=async(url,opts)=>{
  const path=new URL(url).pathname;
  calls.push({path,method:opts.method||'GET',opts,url});
  assert.equal(opts.redirect,'error');
  if(path==='/api/v1/oauth/token'){
    assert.equal(opts.method,'POST');
    return Response.json({access_token:'test-token',token_type:'Bearer',expires_in:600});
  }
  assert.equal(opts.headers.Authorization,'Bearer test-token');
  if(path==='/api/v1/checkouts'&&opts.method==='GET')return Response.json([checkout]);
  if(path==='/api/v1/checkouts/501'&&opts.method==='GET')return Response.json(checkout);
  if(path==='/api/v1/checkouts/501/allows_renewal')return Response.json({allows_renewal:true,current_renewals:0,max_renewals:2});
  if(path==='/api/v1/checkouts/501/renewals'&&opts.method==='POST')
    return Response.json({...checkout,renewals_count:1,due_date:'2026-12-15'},{status:201});
  if(path==='/api/v1/checkouts/availability')return Response.json({blockers:{},confirms:{},warnings:{}});
  if(path==='/api/v1/checkouts'&&opts.method==='POST')
    return Response.json({...checkout,checkout_id:701,item_id:82,library_id:'MAIN'},{status:201});
  return Response.json({error:'unexpected path'},{status:404});
 };
 const bridge=makeKoha({NODE_ENV:'test',KOHA_BASE_URL:'http://127.0.0.1:9999',KOHA_CLIENT_ID:'id',KOHA_CLIENT_SECRET:'secret'},transport);
 return {calls,bridge};
}
test('Koha 25.11 checkout/renew adapter uses exactly documented paths and JSON body',async()=>{
 const {bridge,calls}=fixture();
 const mine=await bridge.checkoutsForPatron(101);
 assert.equal(mine.length,1);assert.equal(mine[0].patron_id,101);
 assert.equal((await bridge.checkout(501)).checkout_id,501);
 assert.equal((await bridge.renewalAvailability(501)).allowed,true);
 assert.equal((await bridge.renewCheckout(501)).renewals_count,1);
 const availability=await bridge.checkoutAvailability(101,82);
 assert.equal(Object.keys(availability.blockers).length,0);
 const issue=await bridge.issueCheckout({patronId:101,itemId:82,libraryId:'MAIN'});
 assert.equal(issue.item_id,82);
 const paths=calls.map(x=>x.path);
 for(const p of ['/api/v1/checkouts','/api/v1/checkouts/501','/api/v1/checkouts/501/allows_renewal',
  '/api/v1/checkouts/501/renewals','/api/v1/checkouts/availability']) assert.ok(paths.includes(p),p);
 const post=calls.find(x=>x.path==='/api/v1/checkouts'&&x.method==='POST');
 assert.deepEqual(JSON.parse(post.opts.body),{patron_id:101,item_id:82,library_id:'MAIN'});
 assert.equal(calls.filter(x=>x.path==='/api/v1/oauth/token').length,1);
});
test('Koha patron lookup refuses cross-patron rows before returning anything',async()=>{
 const {bridge}=fixture();
 await assert.rejects(bridge.checkoutsForPatron('bad-id'),e=>e.code==='KOHA_ID_INVALID');
});
test('Koha renewal cannot invent a valid checkout receipt from missing IDs',async()=>{
 const transport=async(url,opts)=>{
  if(url.endsWith('/oauth/token'))return Response.json({access_token:'test',token_type:'Bearer',expires_in:300});
  return Response.json({success:true,patron_id:101});
 };
 const bridge=makeKoha({NODE_ENV:'test',KOHA_BASE_URL:'http://127.0.0.1:9999',KOHA_CLIENT_ID:'x',KOHA_CLIENT_SECRET:'y'},transport);
 await assert.rejects(bridge.renewCheckout(501),e=>e.code==='KOHA_CHECKOUT_SCHEMA');
});
