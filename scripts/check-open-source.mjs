// Lockfile/license consistency gate. No dependency discovery or network activity.
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(fileURLToPath(new URL('../',import.meta.url)));
const read=(p)=>readFileSync(resolve(root,p),'utf8');
const parse=(p)=>JSON.parse(read(p));
const ACCEPTED=new Set(['MIT','ISC','BSD-3-Clause','Apache-2.0','MPL-2.0']);
const DIRECT=Object.freeze({'web-push':'MPL-2.0','openid-client':'MIT'});
const BROWSER=Object.freeze({'@playwright/test':'Apache-2.0'});

export function auditLockfile(manifest,lock,expected,{production=true}={}){
  const checks=[];
  const record=(name,ok)=>checks.push({name,status:ok?'PASS':'FAIL'});
  record('lockfile-v3',lock.lockfileVersion===3);
  record('manifest-name',manifest.name===lock.name&&manifest.version===lock.version);
  record('mit-root-license',production?manifest.license==='MIT'&&lock.packages?.['']?.license==='MIT':true);
  const direct=production?manifest.dependencies:manifest.devDependencies;
  record('declared-direct-dependencies',
    JSON.stringify(Object.keys(direct||{}).sort())===JSON.stringify(Object.keys(expected).sort()));
  for(const [name,license] of Object.entries(expected)){
    const pkg=lock.packages?.['node_modules/'+name];
    record('direct-'+name,!!pkg&&pkg.license===license&&
      typeof pkg.version==='string'&&
      typeof direct?.[name]==='string');
  }
  const modules=Object.entries(lock.packages||{}).filter(([path])=>path.startsWith('node_modules/'));
  record('packages-present',modules.length>0);
  record('all-spdx-identifiers-recognized',
    modules.every(([,pkg])=>typeof pkg.version==='string'&&ACCEPTED.has(pkg.license)));
  return {status:checks.every(x=>x.status==='PASS')?'PASS':'FAIL',checks,
    packages:modules.length};
}
export function licenseGate({rootPackage,rootLock,browserPackage,browserLock,licenseText,notices}){
  const app=auditLockfile(rootPackage,rootLock,DIRECT);
  const browser=auditLockfile(browserPackage,browserLock,BROWSER,{production:false});
  const checks=[
    {name:'canonical-mit-file',status:
      licenseText.startsWith('MIT License\n')&&
      licenseText.includes('Copyright (c) 2026 Luke883i and LUMEN contributors')&&
      licenseText.includes('THE SOFTWARE IS PROVIDED "AS IS"')?'PASS':'FAIL'},
    {name:'third-party-notices',status:
      Object.entries(DIRECT).every(([n])=>notices.includes(n))&&
      Object.keys(BROWSER).every(n=>notices.includes(n))&&
      notices.includes('Koha')&&notices.includes('GPL-3.0')?'PASS':'FAIL'}
  ];
  const status=app.status==='PASS'&&browser.status==='PASS'&&checks.every(c=>c.status==='PASS')?'PASS':'FAIL';
  return {gate:'lumen_open_source_provenance',status,app,browser,checks,
    legalReview:'REQUIRED: verify permission from copyright holders before merging MIT grant'};
}
const invoked=process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(invoked){
  const report=licenseGate({rootPackage:parse('package.json'),rootLock:parse('package-lock.json'),
    browserPackage:parse('browser/package.json'),browserLock:parse('browser/package-lock.json'),
    licenseText:read('LICENSE'),notices:read('docs/THIRD_PARTY_NOTICES.md')});
  console.log(JSON.stringify(report,null,2));
  if(report.status!=='PASS')process.exitCode=1;
}
