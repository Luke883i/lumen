import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const text=readFileSync(new URL('../README.md',import.meta.url),'utf8');
const link=readFileSync(new URL('../docs/ROA_PROGRAMME.md',import.meta.url),'utf8');
const marker='<!-- roa-programme-header:v1 hub=Luke883i/academics framework=Luke883i/ROA role=LIBRARY_SERVICES_VERTICAL -->';
test('canonical ROA membership header is once, exact, adjacent to the two programme badges',()=>{
  assert.equal(text.split(marker).length-1,1);
  assert.ok(text.startsWith('[![ROA Research Programme]'));
  assert.match(text,/\[!\[Programme Role\]\(https:\/\/img\.shields\.io\/badge\/role-LIBRARY_SERVICES_VERTICAL-6f42c1\)\]\(https:\/\/github\.com\/Luke883i\/academics#repository-map\)/);
  assert.ok(text.indexOf(marker)<text.indexOf('# LUMEN'));
});
test('programme affiliation does not launder local runtime into scientific or enterprise proof',()=>{
  for(const value of ['repository-local contracts and evidence remain authoritative','does not imply formal derivation','conformance to ROA','empirical validation','production readiness'])
    assert.ok(text.includes(value),value);
  assert.ok(link.includes('APPLIED_SURFACE'));
  assert.ok(link.includes('PROGRAMME.json'));
  assert.ok(link.includes('neither repository needs to clone/import/deploy the other'));
});
