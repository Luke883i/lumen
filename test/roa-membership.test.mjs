import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const text=readFileSync(new URL('../README.md',import.meta.url),'utf8');
const link=readFileSync(new URL('../docs/ROA_PROGRAMME.md',import.meta.url),'utf8');
const marker='<!-- programme-header:v2 -->';
const references=['https://github.com/Luke883i/academics','https://github.com/Luke883i/ROA','https://github.com/Luke883i/cora'];
const clauses=[
  'Every repository is independently readable',
  'Membership does not imply formal derivation',
  'shared runtime',
  'scientific validation',
  'certification',
  'production readiness',
  'Repository-local code, evidence, and governance remain authoritative'
];
function verifyHeader(source){
  if(!source.startsWith(marker) || source.split(marker).length!==2) return false;
  const header=source.split('\n\n',1)[0];
  return references.every(r=>header.includes(r)) && clauses.every(c=>header.includes(c));
}
test('canonical public v2 header is exact-once, first and cross-referenced',()=>{
  assert.equal(verifyHeader(text),true);
  assert.ok(text.indexOf(marker)<text.indexOf('# LUMEN'));
  assert.equal(text.includes('LIBRARY_SERVICES_VERTICAL'),true);
});
test('programme affiliation does not launder local runtime into scientific or enterprise proof',()=>{
  for(const value of clauses) assert.ok(text.includes(value),value);
  assert.ok(link.includes('APPLIED_SURFACE'));
  assert.ok(link.includes('PROGRAMME.json'));
  assert.ok(link.includes('neither repository needs to clone/import/deploy the other'));
});
test('v2 header adversarial mutants are rejected without weakening local authority',()=>{
  const mutants=[
    text.replace(marker,''),
    text.replace(marker,marker+marker),
    text.replace('Membership does not imply formal derivation','Membership proves formal derivation'),
    text.replace('Repository-local code, evidence, and governance remain authoritative','The programme approves product runtime'),
    ...references.map(r=>text.replace(r,'https://example.invalid/missing'))
  ];
  for(const [i,mutant] of mutants.entries()) assert.equal(verifyHeader(mutant),false,'mutant survived '+i);
});
