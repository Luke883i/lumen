// Executable local release preflight. Passing checks never implies enterprise certification.
import {DatabaseSync} from 'node:sqlite';
import {existsSync,readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {evaluateDeployment} from '../src/deployment-contract.mjs';
const repo=resolve(fileURLToPath(new URL('../',import.meta.url)));
const prod=process.env.NODE_ENV==='production';
const checks=[];
const record=(name,ok,detail)=>checks.push({name,status:ok?'PASS':'FAIL',detail});
const has=p=>existsSync(resolve(repo,p));
// Determine whether credentials are needed from *actual local state*, not
// deployment platform. Existing valid accounts survive credential removal.
const dbPath=process.env.LUMEN_DB_PATH;
let firstRun=true;
if(prod&&dbPath&&existsSync(dbPath)){
  try{
    const existing=new DatabaseSync(dbPath,{readOnly:true});
    try{firstRun=existing.prepare('SELECT count(*) AS n FROM users').get().n===0;}
    finally{existing.close();}
  }catch{firstRun=false;} // the existing DB integrity gate below reports failure
}
const profile=evaluateDeployment(process.env,{
  nodeMajor:process.versions.node.split('.')[0],firstRun
});
for(const check of profile.checks)record(check.name,check.status==='PASS',check.detail);
if(process.env.KOHA_CIRCULATION_ENABLED==='1'){
  record('koha-circulation-configuration',
    !!(process.env.KOHA_BASE_URL&&process.env.KOHA_CLIENT_ID&&process.env.KOHA_CLIENT_SECRET&&
    /^[A-Za-z0-9_-]{1,20}$/.test(process.env.KOHA_PICKUP_LIBRARY_ID||'')),
    'Koha pilot circulation must have server-side URL, credentials and pickup library');
}
if(process.env.KOHA_LOANS_ENABLED==='1'){
  record('koha-loan-feature-dependency',
    process.env.KOHA_CIRCULATION_ENABLED==='1' &&
    !!(process.env.KOHA_BASE_URL&&process.env.KOHA_CLIENT_ID&&process.env.KOHA_CLIENT_SECRET) &&
    /^[A-Za-z0-9_-]{1,20}$/.test(process.env.KOHA_PICKUP_LIBRARY_ID||''),
    'Koha loans require circulation flag, scoped API credentials and library code');
}
if(process.env.KOHA_RETURNS_ENABLED==='1'){
  record('koha-return-feature-dependency',
    process.env.KOHA_CIRCULATION_ENABLED==='1'&&process.env.KOHA_LOANS_ENABLED==='1'&&
    !!(process.env.KOHA_BASE_URL&&process.env.KOHA_CLIENT_ID&&process.env.KOHA_CLIENT_SECRET),
    'Return confirmation requires configured Koha loans and OAuth2 credentials');
}
const oidcKeys=['OIDC_ISSUER','OIDC_CLIENT_ID','OIDC_CLIENT_SECRET','OIDC_REDIRECT_URI'];
const oidcPresent=oidcKeys.filter(k=>!!process.env[k]);
if(oidcPresent.length || process.env.OIDC_ONLY==='1'){
  record('oidc-complete-config',oidcPresent.length===oidcKeys.length,
    'Institutional OIDC requires issuer, client, secret and exact callback simultaneously');
  let valid=false;
  try {
    const issuer=new URL(process.env.OIDC_ISSUER||''), redirect=new URL(process.env.OIDC_REDIRECT_URI||'');
    valid=issuer.protocol==='https:'&&(!prod || redirect.protocol==='https:')&&
      redirect.pathname==='/api/auth/oidc/callback'&&!redirect.username&&!redirect.password&&!redirect.search;
  }catch{}
  record('oidc-urls-valid',valid,'Explicit HTTPS issuer and callback registered with the IdP');
}
const path=process.env.LUMEN_DB_PATH;
if(path&&existsSync(path)){
  try{
    const db=new DatabaseSync(path,{readOnly:true});
    const integrity=db.prepare('PRAGMA quick_check').get().quick_check;
    let hasDemo=false;
    try{
      hasDemo=!!db.prepare("SELECT 1 FROM users WHERE email IN ('student@lumen.local','faculty@lumen.local','librarian@lumen.local') LIMIT 1").get();
      hasDemo ||= db.prepare("SELECT value FROM metadata WHERE key='demo_dataset'").get()?.value==='1';
    }catch(e){if(prod)throw e;}
    record('database-integrity',integrity==='ok','SQLite PRAGMA quick_check');
    if(prod)record('database-not-demo',!hasDemo,'No demonstration account or demo marker in persistent DB');
    if(process.env.OIDC_ONLY==='1'){
      const ready=!!db.prepare("SELECT 1 FROM oidc_bindings b JOIN users u ON u.id=b.user_id WHERE u.role='librarian' AND u.active=1 LIMIT 1").get();
      record('oidc-admin-mapped',ready,'Avoid SSO-only lockout: at least one active mapped librarian required');
    }
    db.close();
  }catch(e){record('database-readiness',false,'Could not safely verify local database: '+e.code);}
}
if(prod&&process.env.OIDC_ONLY==='1'&&(!path||!existsSync(path)))
  record('oidc-admin-mapped',false,'SSO-only must not start without a persisted mapped active librarian');
const report={product:'LUMEN',gate:'standalone_release_preflight',time:new Date().toISOString(),node:process.version,
  revision:process.env.GIT_SHA||'unbound',
  checks,openEnterpriseGates:['Live institutional IdP signature/conformance and subject lifecycle','Koha live circulation','2k VU on target hardware with writes and soak','HA and recovery drills','independent security review']};
console.log(JSON.stringify(report,null,2));
if(checks.some(x=>x.status==='FAIL'))process.exitCode=1;
