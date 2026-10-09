import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {institutionSettings} from '../src/institution.mjs';
import {institutionProjection,softwareUsage} from '../public/legal.js';
const load=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('library policy links default to missing: no invented operator, terms or compliance',()=>{
 const x=institutionSettings({});
 assert.equal(x.name,null);
 assert.equal(x.completeness,'incomplete');
 assert.ok(Object.values(x.policies).every(v=>v===null));
 const y=institutionProjection(x);
 assert.equal(y.status,'incomplete');
 assert.equal(y.fields.length,4);
 assert.ok(y.fields.every(v=>v.status==='missing'));
});
test('public institution metadata only accepts valid HTTPS docs without embedded credentials or fragments',()=>{
 const valid=institutionSettings({
  LUMEN_INSTITUTION_NAME:'Biblioteca di prova',
  LUMEN_SERVICE_TERMS_URL:'https://library.example.edu/regole',
  LUMEN_PRIVACY_URL:'https://library.example.edu/privacy',
  LUMEN_SUPPORT_URL:'https://library.example.edu/contatti',
  LUMEN_ACCESSIBILITY_URL:'https://library.example.edu/accessibilita'
 });
 assert.equal(valid.completeness,'configured');
 assert.equal(institutionProjection(valid).fields.filter(x=>x.status==='linked').length,4);
 for(const bad of [
  'http://library.example.edu/privacy',
  'https://user:password@library.example.edu/privacy',
  'javascript:alert(1)',
  'https://library.example.edu/privacy#private',
  'https://localhost/privacy',
  '//library.example.edu/privacy',
  'garbage'
 ]){
  const result=institutionSettings({
   LUMEN_INSTITUTION_NAME:'Biblioteca',
   LUMEN_PRIVACY_URL:bad
  });
  assert.equal(result.policies.privacy,null,bad);
  assert.equal(result.completeness,'incomplete');
 }
});
test('informational projection distinguishes service policy and MIT software grant',()=>{
 assert.match(softwareUsage.license,/distinta dalle condizioni/);
 assert.match(softwareUsage.holds,/non equivale a un prestito/i);
 assert.match(softwareUsage.push,/facoltative/);
 assert.match(softwareUsage.purchases,/non costituisce approvazione/);
});
test('public routes/footers and service worker expose informational surfaces',()=>{
 const app=load('public/app.js');
 assert.ok(app.includes("if(path==='/informazioni')return informationPage()"));
 assert.ok(app.includes("if(path==='/condizioni')return termsPage()"));
 assert.ok(app.includes('creditsProjection({kohaConfigured:state.koha'));
 assert.ok(app.includes('Non configurato in LUMEN'));
 assert.ok(app.includes('Licenza LUMEN (MIT)'));
 assert.ok(app.includes('Informazioni e condizioni'));
 const sw=load('public/sw.js');
 assert.ok(sw.includes("'/legal.js'"));
 assert.ok(load('public/style.css').includes('.legal-grid'));
});
