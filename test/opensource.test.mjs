import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {licenseGate,auditLockfile} from '../scripts/check-open-source.mjs';

const read=(p)=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const data=()=>({
  rootPackage:JSON.parse(read('package.json')),
  rootLock:JSON.parse(read('package-lock.json')),
  browserPackage:JSON.parse(read('browser/package.json')),
  browserLock:JSON.parse(read('browser/package-lock.json')),
  licenseText:read('LICENSE'),
  notices:read('docs/THIRD_PARTY_NOTICES.md')
});
test('license closure is consistent at exact checked-in npm dependency graph',()=>{
  const report=licenseGate(data());
  assert.equal(report.status,'PASS',JSON.stringify(report));
  assert.equal(report.app.packages,20);
  assert.equal(report.browser.packages,3);
  assert.equal(report.legalReview.startsWith('REQUIRED:'),true);
});
test('unknown or changed SPDX term fails closed',()=>{
  const d=data();
  d.rootLock.packages['node_modules/web-push'].license='GPL-3.0';
  assert.equal(licenseGate(d).status,'FAIL');
  const m=data();
  delete m.rootLock.packages['node_modules/openid-client'].license;
  assert.equal(licenseGate(m).status,'FAIL');
});
test('misleading root license or altered dependency closure fails',()=>{
  const d=data();d.rootPackage.license='UNLICENSED';
  assert.equal(licenseGate(d).status,'FAIL');
  const e=data();e.rootPackage.dependencies['unreviewed-external']='1.0.0';
  assert.equal(licenseGate(e).status,'FAIL');
  const z=data();z.notices=z.notices.replaceAll('Koha','Unidentified-system');
  assert.equal(licenseGate(z).status,'FAIL');
});
test('test packages are isolated from production dependencies',()=>{
  const d=data();const lock=d.rootLock;
  assert.equal(Object.keys(d.rootPackage.dependencies).includes('@playwright/test'),false);
  assert.equal(!!lock.packages['node_modules/@playwright/test'],false);
  assert.equal(auditLockfile(d.browserPackage,d.browserLock,{'@playwright/test':'Apache-2.0'},{production:false}).status,'PASS');
});
