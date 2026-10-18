// Universal single-instance LUMEN deployment policy.
// Pure evaluation: no filesystem mutations, no Render assumptions, no secrets in output.
import {isAbsolute,resolve,relative,sep} from 'node:path';

const pass=(checks,name,ok,detail)=>checks.push({name,status:ok?'PASS':'FAIL',detail});
const validPort=v=> v===undefined||v===''||(/^[0-9]{1,5}$/.test(String(v))&&Number(v)>=1&&Number(v)<=65535);
const inside=(path,root)=>{
  const rel=relative(resolve(root),resolve(path));
  return rel!==''&&!rel.startsWith('..'+sep)&&rel!=='..'&&!isAbsolute(rel);
};
export function evaluateDeployment(env={},state={}){
  const checks=[];
  const prod=env.NODE_ENV==='production';
  const nodeMajor=String(state.nodeMajor??process.versions.node.split('.')[0]);
  const path=env.LUMEN_DB_PATH;
  const root=env.LUMEN_STORAGE_ROOT;
  pass(checks,'node-runtime',nodeMajor==='24','LUMEN requires Node.js 24 (SQLite runtime contract)');
  pass(checks,'port',validPort(env.PORT),'PORT must be 1..65535; omitted defaults to 3000');
  if(prod){
    pass(checks,'demo-disabled',env.LUMEN_DEMO!=='1','No demonstration accounts in production');
    pass(checks,'database-absolute',typeof path==='string'&&path.length>0&&
      path!==':memory:'&&isAbsolute(path)&&!path.endsWith(sep),
      'Production requires an absolute on-disk SQLite file path');
    if(root!==undefined){
      pass(checks,'storage-root',typeof root==='string'&&isAbsolute(root)&&
        typeof path==='string'&&isAbsolute(path)&&inside(path,root),
        'SQLite path must be below the optional platform volume root');
    }
    const firstRun=state.firstRun!==false;
    if(firstRun){
      const email=String(env.ADMIN_EMAIL||'');
      pass(checks,'first-admin',/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)&&
        typeof env.ADMIN_PASSWORD==='string'&&env.ADMIN_PASSWORD.length>=12,
        'First-run only: administrator email and password of at least 12 characters');
    }
    if(state.demoDatabase===true)pass(checks,'no-demo-database',false,'Demo database cannot be promoted');
    if(state.integrity===false)pass(checks,'database-integrity',false,'Database consistency not verified');
  }
  return {mode:prod?'production':env.NODE_ENV||'development',
    valid:checks.every(x=>x.status==='PASS'),checks};
}
/** Fail before creating a DB when a direct node src/server.mjs call bypasses npm prestart. */
export function assertServerEnvironment(env=process.env){
  const result=evaluateDeployment(env,{nodeMajor:process.versions.node.split('.')[0],firstRun:false});
  if(!result.valid){
    const e=new Error('LUMEN_DEPLOYMENT_CONFIGURATION_INVALID: '+result.checks.filter(c=>c.status==='FAIL').map(c=>c.name).join(','));
    e.code='LUMEN_DEPLOYMENT_CONFIGURATION_INVALID';throw e;
  }
  return result;
}
