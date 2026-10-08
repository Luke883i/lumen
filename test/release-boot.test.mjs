import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
test('production prestart checks reject demo configuration without creating a database',()=>{
 const run=spawnSync(process.execPath,['scripts/preflight.mjs'],{
  cwd:new URL('../',import.meta.url),encoding:'utf8',timeout:6000,
  env:{...process.env,NODE_ENV:'production',LUMEN_DEMO:'1',
    LUMEN_DB_PATH:'/var/data/lumen.sqlite',ADMIN_EMAIL:'admin@example.edu',ADMIN_PASSWORD:'valid-secure-secret-123'}
 });
 assert.notEqual(run.status,0);
 const report=JSON.parse(run.stdout);
 assert.equal(report.checks.find(x=>x.name==='explicit-demo').status,'FAIL');
});
