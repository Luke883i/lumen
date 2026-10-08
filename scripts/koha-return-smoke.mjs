// Deliberately read-only live Koha returned-checkout contract gate.
import {makeKoha} from '../src/koha.mjs';
const env=process.env;
const inputs=['KOHA_BASE_URL','KOHA_CLIENT_ID','KOHA_CLIENT_SECRET','KOHA_TEST_PATRON_ID','KOHA_TEST_CHECKOUT_ID','KOHA_TEST_ITEM_ID'];
const absent=inputs.filter(k=>!env[k]);
const report={product:'LUMEN',gate:'koha_return_history_live',mode:'non_mutating',
  revision:env.GIT_SHA||'unbound',time:new Date().toISOString(),status:'BLOCKED'};
if(absent.length){
  report.reason='MISSING_TEST_CONFIG';
  report.missing=absent;
}else{
  try{
    const koha=makeKoha(env);
    const result=await koha.checkedInCheckout({patronId:env.KOHA_TEST_PATRON_ID,
      checkoutId:env.KOHA_TEST_CHECKOUT_ID,itemId:env.KOHA_TEST_ITEM_ID});
    if(!result)report.reason='NO_RETURN_HISTORY_EVIDENCE';
    else{
      report.status='PASS';
      report.checkoutId=result.checkout_id;
      report.itemId=result.item_id;
      report.checkinDate=result.checkin_date;
      report.hasLibrary=!!result.checkin_library_id;
    }
  }catch(error){report.reason=String(error.code||'KOHA_HISTORY_ERROR').slice(0,80);}
}
console.log(JSON.stringify(report,null,2));
if(report.status!=='PASS')process.exitCode=1;
