// Read-only live Koha contract probe. No checkout, hold, renewal or destructive operation.
// Prints SHA-bound evidence; exits nonzero on any missing or incompatible Koha response.
import {makeKoha} from '../src/koha.mjs';
const env=process.env;
const started=new Date().toISOString();
const report={suite:'koha_read_only_live_contract',revision:env.GIT_SHA||'unbound',
  kohaVersionTarget:'25.11',started,checks:[],mode:'non_mutating'};
const check=async(name,action)=>{
  try{const details=await action();report.checks.push({name,status:'PASS',details});}
  catch(error){report.checks.push({name,status:'FAIL',code:error.code||'UNEXPECTED'});}
};
if(!env.KOHA_BASE_URL || !env.KOHA_CLIENT_ID || !env.KOHA_CLIENT_SECRET){
  console.error('Configure KOHA_BASE_URL, KOHA_CLIENT_ID and KOHA_CLIENT_SECRET via secrets, not command arguments.');
  process.exitCode=2;
}else{
  try{
    const client=makeKoha(env);
    await check('oauth_and_library',async()=>client.status());
    await check('bibliographic_search',async()=>{
      const result=await client.search(env.KOHA_TEST_QUERY||'library');
      return {source:result.source,count:result.items.length,truncated:result.truncated};
    });
    if(env.KOHA_TEST_PATRON_ID){
      await check('patron_identity',async()=>{
        const patron=await client.patron(env.KOHA_TEST_PATRON_ID);
        if(!env.KOHA_TEST_PATRON_EMAIL||patron.email.toLowerCase()!==env.KOHA_TEST_PATRON_EMAIL.toLowerCase())
          throw Object.assign(new Error('Patron email mismatch'),{code:'PATRON_MISMATCH'});
        return {matched:true,patron_id:patron.patron_id};
      });
      await check('patron_holds',async()=>{
        const holds=await client.patronHolds(env.KOHA_TEST_PATRON_ID);
        if(holds.some(x=>x.patron_id!==Number(env.KOHA_TEST_PATRON_ID)))throw Object.assign(new Error('Patron scoping failure'),{code:'PATRON_SCOPE'});
        return {count:holds.length};
      });
    }else{
      report.checks.push({name:'patron_identity_and_holds',status:'SKIPPED',code:'NO_KOHA_TEST_PATRON'});
    }
    if(env.KOHA_TEST_BIBLIO_ID){
      await check('biblio_and_items',async()=>{
        const book=await client.detail(env.KOHA_TEST_BIBLIO_ID);
        return {source:book.source,number_of_items:book.copies,availability:book.availability};
      });
    }
  }catch(e){report.checks.push({name:'setup',status:'FAIL',code:e.code||'CONFIGURATION'});}
  console.log(JSON.stringify(report,null,2));
  if(report.checks.some(x=>x.status==='FAIL')||report.checks.some(x=>x.status==='SKIPPED'))process.exitCode=1;
}
