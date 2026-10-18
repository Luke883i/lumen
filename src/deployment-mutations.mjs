// Ten thousand *semantic configuration mutations*, not ten thousand cloud deploys.
// Profiles are deterministic, realistic single-node hosting permutations.
import {createHash} from 'node:crypto';
import {evaluateDeployment} from './deployment-contract.mjs';

const seed=20261018,CASE_COUNT=10000;
function rng(start){let x=start>>>0;return ()=>{x^=x<<13;x^=x>>>17;x^=x<<5;return (x>>>0)/4294967296;};}
const random=rng(seed);
const pick=items=>items[Math.floor(random()*items.length)];
const failed=result=>result.checks.filter(x=>x.status==='FAIL').map(x=>x.name).sort();
const matrix=[
  {name:'render',root:'/var/data'},
  {name:'oci',root:'/data'},
  {name:'railway',root:'/mnt/library'},
  {name:'fly-volume',root:'/data'},
  {name:'vm-systemd',root:'/srv/library'},
  {name:'baremetal',root:'/home/library/records'},
  {name:'k8s-single-pod',root:'/persistent/vol1'},
  {name:'other-node-paas',root:'/opt/app-state'}
];
function makeCase(index){
  const topology=matrix[index%matrix.length];
  const prod=random()<.8, firstRun=random()<.48;
  const nodeMajor=pick(['24','24','24','24','24','24','22','25']);
  const root=topology.root;
  const dbVariant=pick([
    root+'/lumen.sqlite',root+'/db/lumen.sqlite',root+'/nested records/lumen.sqlite',
    root+'/lumen.sqlite','./data/lumen.sqlite',':memory:',undefined,
    '/other/tenant.sqlite','/tmp/unsafe-test.sqlite',root+'/lumen.sqlite\n'
  ]);
  const volumeVariant=pick([undefined,undefined,root,root,root,'/bad-root','',root+'/subdir']);
  const port=pick([undefined,'3000','8080','10000','443','65535','0','65536','-1','x','22.5']);
  const creds=pick([true,true,true,false,false]);
  const env={
    NODE_ENV:prod?'production':'development',
    LUMEN_DEMO:pick(['0','0','0','0','1']),
    PORT:port,
    LUMEN_DB_PATH:dbVariant,
    ...(volumeVariant!==undefined?{LUMEN_STORAGE_ROOT:volumeVariant}:{}),
    ...(creds?{ADMIN_EMAIL:'library-operator@example.edu',ADMIN_PASSWORD:'A secure local secret 2026'}:{})
  };
  // Emulate real platform extras that MUST NOT influence core validity.
  const noise=pick([{RENDER_SERVICE_ID:'svc-test'},{K_SERVICE:'lumen'},
    {RAILWAY_ENVIRONMENT:'production'},{FLY_APP_NAME:'lumen'},{CI:'true'},{}]);
  Object.assign(env,noise);
  return {index,topology:topology.name,firstRun,nodeMajor,env};
}
function expected(c){
  // Independent decision oracle, expressed as explicit mutation predicates.
  const e=c.env,errors=[];
  if(c.nodeMajor!=='24')errors.push('node-runtime');
  const port=e.PORT;
  if(port!==undefined&&port!==''&&(!/^\d{1,5}$/.test(String(port))||
    +port<1||+port>65535))errors.push('port');
  if(e.NODE_ENV==='production'){
    if(e.LUMEN_DEMO==='1')errors.push('explicit-demo');
    const path=e.LUMEN_DB_PATH;
    const absolute=typeof path==='string'&&path[0]==='/'&&
      path.length>1&&!path.endsWith('/')&&!/[\x00-\x1f]/.test(path);
    if(!absolute)errors.push('database-absolute');
    if(e.LUMEN_STORAGE_ROOT!==undefined){
      const mount=e.LUMEN_STORAGE_ROOT;
      if(typeof mount!=='string'||!mount||mount[0]!=='/'||
        /[\x00-\x1f]/.test(mount)||!absolute||
        !(path.startsWith(mount.replace(/\/+$/,'')+'/')))
        errors.push('storage-root');
    }
    if(c.firstRun&&!(typeof e.ADMIN_EMAIL==='string'&&e.ADMIN_EMAIL.includes('@')&&
      typeof e.ADMIN_PASSWORD==='string'&&e.ADMIN_PASSWORD.length>=12))
      errors.push('first-admin');
  }
  return errors.sort();
}
export function runDeploymentMutations(){
  const counts={PASS:0,FAIL:0},topologies={},byGate={};
  const digest=createHash('sha256');
  for(let i=0;i<CASE_COUNT;i++){
    const c=makeCase(i);
    const result=evaluateDeployment(c.env,{nodeMajor:c.nodeMajor,firstRun:c.firstRun});
    const got=failed(result),want=expected(c);
    if(JSON.stringify(got)!==JSON.stringify(want))
      throw Error('ORACLE_MISMATCH scenario='+i+' topology='+c.topology+
        ' expected='+JSON.stringify(want)+' actual='+JSON.stringify(got));
    const verdict=result.valid?'PASS':'FAIL';
    counts[verdict]++;topologies[c.topology]=(topologies[c.topology]||0)+1;
    for(const gate of got)byGate[gate]=(byGate[gate]||0)+1;
    digest.update(JSON.stringify([i,c.topology,c.nodeMajor,c.firstRun,verdict,got])+'\n');
  }
  if(counts.PASS<100||counts.FAIL<1000||Object.keys(byGate).length<5)
    throw Error('INSUFFICIENT_MUTATION_DIVERSITY');
  return {gate:'UNIVERSAL_DEPLOYMENT_MUTATION',seed,cases:CASE_COUNT,
    nature:'deterministic_semantic_configurations_not_actual_deployments',
    counts,topologies,byGate,digest:digest.digest('hex'),status:'PASS'};
}
