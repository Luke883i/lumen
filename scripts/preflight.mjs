// Executable local release preflight. Passing checks never implies enterprise certification.
import {DatabaseSync} from 'node:sqlite';
import {existsSync,readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const repo=resolve(fileURLToPath(new URL('../',import.meta.url)));
const prod=process.env.NODE_ENV==='production';
const checks=[];
const record=(name,ok,detail)=>checks.push({name,status:ok?'PASS':'FAIL',detail});
const has=p=>existsSync(resolve(repo,p));
record('node-24',process.versions.node.split('.')[0]==='24','Codespaces and CI pin Node 24');
record('npm-lock',has('package-lock.json'),'Dependency graph is reproducible via npm ci');
record('manifest-and-icons',['public/manifest.webmanifest','public/icons/icon-192.png','public/icons/icon-512.png','public/sw.js'].every(has),'Installable application assets');
record('deploy-blueprint',has('render.yaml'),'Render single-instance persistent disk blueprint');
record('devcontainer',has('.devcontainer/devcontainer.json'),'Codespaces base image and bootstrap');
record('explicit-demo',!prod || process.env.LUMEN_DEMO!=='1','Production cannot enable demo');
if(prod){
  const path=process.env.LUMEN_DB_PATH||'';
  record('persistent-database-path',path.startsWith('/var/data/')||path.startsWith('/mnt/'),'Production SQLite must live on a persistent disk');
  record('admin-first-start',!!process.env.ADMIN_EMAIL&&!!process.env.ADMIN_PASSWORD&&process.env.ADMIN_PASSWORD.length>=12,'First-start administrative credentials are configured');
}
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
    db.close();
    record('database-integrity',integrity==='ok','SQLite PRAGMA quick_check');
    if(prod)record('database-not-demo',!hasDemo,'No demonstration account or demo marker in persistent DB');
    if(process.env.OIDC_ONLY==='1'){
      const ready=!!db.prepare("SELECT 1 FROM oidc_bindings b JOIN users u ON u.id=b.user_id WHERE u.role='librarian' AND u.active=1 LIMIT 1").get();
      record('oidc-admin-mapped',ready,'Avoid SSO-only lockout: at least one active mapped librarian required');
    }
  }catch(e){record('database-readiness',false,'Could not safely verify local database: '+e.code);}
}
const report={product:'LUMEN',gate:'standalone_release_preflight',time:new Date().toISOString(),node:process.version,
  revision:process.env.GIT_SHA||'unbound',
  checks,openEnterpriseGates:['Live institutional IdP signature/conformance and subject lifecycle','Koha live circulation','2k VU on target hardware with writes and soak','HA and recovery drills','independent security review']};
console.log(JSON.stringify(report,null,2));
if(checks.some(x=>x.status==='FAIL'))process.exitCode=1;
