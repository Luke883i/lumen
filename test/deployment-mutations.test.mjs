import test from 'node:test';
import assert from 'node:assert/strict';
import {runDeploymentMutations} from '../src/deployment-mutations.mjs';
import {evaluateDeployment} from '../src/deployment-contract.mjs';
test('10,000 deterministic pre-seeded deployment mutations agree with independent policy oracle',()=>{
 const report=runDeploymentMutations();
 assert.equal(report.status,'PASS');assert.equal(report.cases,10000);
 assert.equal(Object.values(report.topologies).reduce((a,b)=>a+b,0),10000);
 assert.equal(report.digest.length,64);
});
test('equivalent persistent volume root relocation preserves validity',()=>{
 for(const root of ['/var/data','/data','/srv/library','/opt/tenant/disk']){
  const r=evaluateDeployment({NODE_ENV:'production',LUMEN_DB_PATH:root+'/lumen.sqlite',
   LUMEN_STORAGE_ROOT:root,ADMIN_EMAIL:'ops@example.edu',ADMIN_PASSWORD:'secure password with 12 chars'},
   {nodeMajor:'24',firstRun:true});
  assert.equal(r.valid,true,root);
 }
});
test('restart requires no first-admin secrets but first boot does',()=>{
 const env={NODE_ENV:'production',LUMEN_DB_PATH:'/some/persistent/mount/lumen.sqlite'};
 assert.equal(evaluateDeployment(env,{nodeMajor:'24',firstRun:true}).valid,false);
 assert.equal(evaluateDeployment(env,{nodeMajor:'24',firstRun:false}).valid,true);
});
test('Render/GitHub/CloudRun environment markers do not act as authority',()=>{
 const base={NODE_ENV:'production',LUMEN_DB_PATH:'/disk/lumen.sqlite'};
 const expected=evaluateDeployment(base,{nodeMajor:'24',firstRun:false});
 for(const extra of [{RENDER_SERVICE_ID:'srv'},{K_SERVICE:'lumen'},{GITHUB_ACTIONS:'true'},
  {RAILWAY_PROJECT_ID:'x'},{FLY_APP_NAME:'lumen'}])
  assert.deepEqual(evaluateDeployment({...base,...extra},{nodeMajor:'24',firstRun:false}).checks,expected.checks);
});
