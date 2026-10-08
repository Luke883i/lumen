import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {creditsLinks,creditsProjection} from '../public/credits.js';

const load=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
test('no Koha endorsement or runtime claim in default standalone mode',()=>{
 const independent=creditsProjection({kohaConfigured:false,oidcEnabled:false});
 assert.equal(independent.platform,'Node.js + SQLite');
 assert.equal(independent.kohaStatus,'optional');
 assert.match(independent.koha,/non configurata/i);
 assert.doesNotMatch(independent.koha,/powered by|affiliat|certificat/i);
 const linked=creditsProjection({kohaConfigured:true,oidcEnabled:true});
 assert.equal(linked.kohaStatus,'configured_unverified');
 assert.match(linked.koha,/connettore API configurato/i);
 assert.match(linked.koha,/collaudata/i);
 assert.match(linked.oidc,/collaudo/i);
});
test('copyright, source, Koha license and operator terms links are pinned and HTTPS',()=>{
 for(const [name,url] of Object.entries(creditsLinks)){
  const parsed=new URL(url);
  assert.equal(parsed.protocol,'https:',name);
  assert.equal(parsed.username,'',name);
  assert.equal(parsed.password,'',name);
 }
 assert.ok(creditsLinks.license.endsWith('/LICENSE'));
 assert.ok(creditsLinks.kohaLicense.endsWith('/LICENSE'));
 assert.ok(creditsLinks.usage.includes('USAGE_TERMS.md'));
 assert.ok(creditsLinks.thirdParties.includes('THIRD_PARTY_NOTICES.md'));
});
test('homepage and legal route use actual provenance model and are accessible to guests',()=>{
 const app=load('public/app.js'),css=load('public/style.css'),worker=load('public/sw.js');
 assert.ok(app.includes('creditsProjection({kohaConfigured:state.koha'));
 assert.ok(app.includes('if(path===\'/opensource\')return openSourcePage()'));
 assert.ok(app.includes('creditsBand();'));
 assert.ok(app.includes('aria-label="Tecnologie e licenze"'));
 assert.ok(app.includes("data-nav href=\"/opensource\""));
 assert.ok(app.includes('rel="noopener noreferrer"'));
 assert.ok(css.includes('.credits-band'));
 assert.ok(css.includes('.credits-grid'));
 assert.ok(worker.includes("'/credits.js'"));
 assert.ok(worker.includes("'/navigation.js'"),'older module import must also be offline cached');
});
test('research ILS references are not installed as direct runtime packages',()=>{
 const pkg=JSON.parse(load('package.json')),notice=load('docs/THIRD_PARTY_NOTICES.md');
 assert.deepEqual(Object.keys(pkg.dependencies).sort(),['openid-client','web-push']);
 for(const x of ['Koha','FOLIO','Evergreen','SLiMS','Invenio'])assert.ok(notice.includes(x));
 assert.match(notice,/not 'powered by'/i);
});
