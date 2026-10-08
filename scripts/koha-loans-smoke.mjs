// R4 non-mutating Koha verification. Never sends checkout/renewal POST requests.
import {makeKoha} from '../src/koha.mjs';
const env=process.env;
const report={suite:'koha_loans_readonly_contract',revision:env.GIT_SHA||'unbound',
  version_target:'25.11',mode:'read_only',created_at:new Date().toISOString(),checks:[]};
const fail=(name,code)=>report.checks.push({name,status:'FAIL',code});
async function check(name,fn){
  try{const value=await fn();report.checks.push({name,status:'PASS',details:value});}
  catch(e){fail(name,e.code||'UNKNOWN');}
}
const variables=['KOHA_BASE_URL','KOHA_CLIENT_ID','KOHA_CLIENT_SECRET','KOHA_TEST_PATRON_ID','KOHA_TEST_CHECKOUT_ID','KOHA_TEST_ITEM_ID'];
const missing=variables.filter(x=>!env[x]);
if(missing.length){
  fail('fixture','MISSING_'+missing.join('_'));
}else{
  try{
    const koha=makeKoha(env);
    const patronId=Number(env.KOHA_TEST_PATRON_ID),checkoutId=Number(env.KOHA_TEST_CHECKOUT_ID),itemId=Number(env.KOHA_TEST_ITEM_ID);
    await check('patron_checkouts',async()=>{
      const loans=await koha.checkoutsForPatron(patronId);
      if(loans.some(x=>x.patron_id!==patronId))throw {code:'WRONG_PATRON'};
      return {count:loans.length,owned:true};
    });
    await check('checkout_id_and_owner',async()=>{
      const row=await koha.checkout(checkoutId);
      if(row.checkout_id!==checkoutId||row.patron_id!==patronId||row.item_id!==itemId)
        throw {code:'CHECKOUT_FIXTURE_MISMATCH'};
      return {matched:true,current_renewals:row.renewals_count,checked_in:!!row.checkin_date};
    });
    await check('renewal_policy',async()=>{
      const policy=await koha.renewalAvailability(checkoutId);
      return {renewal_allowed:policy.allowed,current_renewals:policy.current,max_renewals:policy.max};
    });
    await check('checkout_preflight',async()=>{
      const result=await koha.checkoutAvailability(patronId,itemId);
      return {blocker_count:Object.keys(result.blockers).length,confirmation_count:Object.keys(result.confirms).length,
        warning_count:Object.keys(result.warnings).length};
    });
  }catch(e){fail('setup',e.code||'SETUP_FAILED');}
}
console.log(JSON.stringify(report,null,2));
if(report.checks.some(x=>x.status!=='PASS'))process.exitCode=1;
