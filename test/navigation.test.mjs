import test from 'node:test';
import assert from 'node:assert/strict';
import {roleNavigation,activeNavigation,staffArea,staffAreaFromSearch,STAFF_AREAS,taskLinks} from '../public/navigation.js';

const paths=links=>links.map(link=>link.path);
test('each role gets <=5 unique primary destinations; no staff elevation',()=>{
 for(const role of [null,'student','faculty','librarian']){
  const ctx={role,authenticated:!!role,koha:true,kohaWrite:true,kohaLoans:true};
  const {primary,secondary}=roleNavigation(ctx);
  assert.ok(primary.length<=5,role);
  assert.equal(new Set(paths(primary)).size,primary.length,role);
  assert.ok(paths(primary).includes('/'));
  assert.ok(paths(primary).includes('/catalogo'));
  assert.equal(paths(primary).includes('/staff'),role==='librarian');
  assert.equal(paths(primary).includes('/acquisti'),role==='faculty');
  assert.ok(paths(secondary).includes('/koha'));
  assert.ok(paths(secondary).includes('/installazione'));
  if(role)assert.ok(paths(primary).includes('/notifiche'));
 }
 const guest=roleNavigation({role:'librarian',authenticated:false,koha:true,kohaWrite:true,kohaLoans:true});
 assert.deepEqual(paths(guest.primary),['/','/catalogo']);
 assert.equal(paths(guest.secondary).includes('/koha/me'),false);
 assert.equal(paths(guest.secondary).includes('/koha/loans'),false);
});
test('capability gates prevent phantom Koha navigation on unconfigured deployments',()=>{
 const empty=roleNavigation({role:'student',authenticated:true});
 assert.equal(paths(empty.secondary).some(x=>x.startsWith('/koha')),false);
 const koha=roleNavigation({role:'student',authenticated:true,koha:true,kohaWrite:false,kohaLoans:false});
 assert.deepEqual(paths(koha.secondary).filter(x=>x.startsWith('/koha')),['/koha']);
 assert.equal(taskLinks({authenticated:true,role:'student'}).some(x=>x.path==='/staff'),false);
 assert.equal(taskLinks({authenticated:true,role:'faculty'}).some(x=>x.path==='/acquisti'),true);
 assert.equal(taskLinks({authenticated:true,role:'librarian'}).some(x=>x.path==='/staff'),true);
});
test('staff area parser falls back safely, without broadening task capabilities',()=>{
 assert.deepEqual(STAFF_AREAS.map(x=>x.id),[
  'panoramica','circolazione','catalogo','acquisti','persone','comunicazioni','integrazioni'
 ]);
 assert.equal(STAFF_AREAS.length,new Set(STAFF_AREAS.map(x=>x.id)).size);
 for(const item of STAFF_AREAS){
  assert.equal(staffArea(item.id),item.id);
  assert.equal(staffAreaFromSearch('?area='+item.id),item.id);
  assert.ok(item.hint.length>10);
 }
 for(const malformed of ['',null,'unlisted','../../../users','__proto__','constructor']){
  assert.equal(staffArea(malformed),'panoramica');
 }
 assert.equal(staffAreaFromSearch('?area=integrazioni&extra=ignored'),'integrazioni');
});
test('nested route highlighting is exact for singleton Koha and staff paths',()=>{
 assert.equal(activeNavigation('/','/'),true);
 assert.equal(activeNavigation('/catalogo/123','/catalogo'),true);
 assert.equal(activeNavigation('/staff/koha-pending','/staff'),true);
 assert.equal(activeNavigation('/me/prenotazioni','/me'),true);
 assert.equal(activeNavigation('/koha','/koha'),true);
 assert.equal(activeNavigation('/koha/987','/koha'),true);
 assert.equal(activeNavigation('/koha/me','/koha'),false);
 assert.equal(activeNavigation('/koha/loans','/koha'),false);
 assert.equal(activeNavigation('/acquisti','/staff'),false);
 assert.equal(activeNavigation('/catalogo','/'),false);
});
