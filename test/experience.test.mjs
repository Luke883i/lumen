import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {runInNewContext} from 'node:vm';
import {installExperience,pushExperience,actionConfirmation,libraryCopy} from '../public/experience.js';

test('install state lattice never advertises a native installation without browser event',()=>{
  assert.equal(installExperience({standalone:true,canPrompt:true}).status,'installed');
  assert.equal(installExperience({standalone:true,canPrompt:true}).canInstall,false);
  assert.equal(installExperience({canPrompt:true}).status,'ready');
  assert.equal(installExperience({canPrompt:true}).canInstall,true);
  assert.equal(installExperience({userAgent:'Mozilla/5.0 (Linux; Android 15) Chrome/127'}).status,'manual_android');
  assert.equal(installExperience({userAgent:'Mozilla/5.0 (iPhone) Version/20 Safari'}).status,'manual_ios');
  assert.equal(installExperience({userAgent:'Mozilla/5.0 (Windows NT 10.0) Chrome/129'}).status,'manual_desktop');
  for(const x of ['manual_android','manual_ios','manual_desktop','installed']){
    const states=[
      installExperience({standalone:true}),
      installExperience({userAgent:'Android'}),
      installExperience({userAgent:'iPhone'}),
      installExperience({userAgent:'Windows'})
    ];
    assert.equal(states.find(s=>s.status===x).canInstall,false);
  }
});
test('push policy never shows a consent action if server/HTTPS/browser blocks notifications',()=>{
 for(const args of [
   {serverEnabled:false,secure:true,supported:true,permission:'default'},
   {serverEnabled:true,secure:false,supported:true,permission:'default'},
   {serverEnabled:true,secure:true,supported:false,permission:'default'},
   {serverEnabled:true,secure:true,supported:true,permission:'denied'}
 ]){
   const state=pushExperience(args);
   assert.equal(state.action,null,state.status);
 }
 assert.equal(pushExperience({serverEnabled:true,secure:true,supported:true,permission:'default'}).action,'enable-push');
 assert.equal(pushExperience({serverEnabled:true,secure:true,supported:true,permission:'granted',subscribed:true}).action,'disable-push');
 assert.equal(pushExperience({serverEnabled:true,secure:true,supported:true,permission:'granted',subscribed:false}).status,'granted');
});
test('confirmation microcopy requires deliberate action on destructive operations',()=>{
 for(const action of ['disable','cancel-hold','return']){
   const text=actionConfirmation(action);
   assert.ok(text.title.length>8&&text.detail.length>10&&text.confirm.length>4);
 }
 assert.equal(actionConfirmation('read'),null);
 assert.equal(actionConfirmation('search'),null);
 assert.equal(actionConfirmation('install'),null);
 assert.equal(actionConfirmation('disable').danger,true);
});
test('Italian semantic microcopy describes three roles without invented institutional facts',()=>{
 assert.ok(libraryCopy.title.includes('LUMEN'));
 for(const key of ['student','faculty','librarian'])assert.ok(libraryCopy.roles[key].length>20);
 assert.ok(libraryCopy.context.includes('Sedi, orari'));
});

const root=fileURLToPath(new URL('../',import.meta.url));
const load=path=>readFileSync(new URL(path,new URL('../',import.meta.url)),'utf8');
function serviceWorker(){
 const handlers={};
 const shown=[],opened=[],focused=[],navigated=[];
 const client={url:'https://lumen.example/catalogo',async navigate(url){navigated.push(url);this.url=url;return this;},async focus(){focused.push(this.url);return this;}};
 const self={
  location:{origin:'https://lumen.example'},
  addEventListener(name,handler){handlers[name]=handler;},
  registration:{showNotification:async(title,options)=>{shown.push({title,options});}},
  clients:{matchAll:async()=>[client],openWindow:async url=>{opened.push(url);return null;}}
 };
 runInNewContext(load('public/sw.js'),{self,URL,caches:{}});
 return {handlers,shown,opened,focused,navigated};
}
test('SW never opens off-origin push URLs or exposes personal push payload on lock screen',async()=>{
 const x=serviceWorker();
 let pending=null;
 x.handlers.push({data:{json:()=>({id:'01234567-1234-1234-1234-123456789012',
   title:'Mario prestito sanità',body:'Diagnosi Mario',kind:'hold_ready',url:'https://attacker.invalid/x'})},
   waitUntil(p){pending=p;}});
 await pending;
 assert.equal(x.shown[0].title,'LUMEN · Prenotazioni');
 assert.equal(x.shown[0].options.body.includes('Mario'),false);
 assert.equal(x.shown[0].options.body.includes('Diagnosi'),false);
 assert.equal(x.shown[0].options.data.url,'/notifiche');
 assert.equal(x.shown[0].options.tag,'lumen-01234567-1234-1234-1234-123456789012');
 let clicked=null;
 x.handlers.notificationclick({notification:{data:{url:'//attacker.invalid'},close(){}},waitUntil(p){clicked=p;}});
 await clicked;
 assert.deepEqual(x.navigated,['https://lumen.example/notifiche']);
 assert.equal(x.opened.length,0);
 assert.equal(x.focused.length,1);
});
test('SW rejects malformed push data without throwing and allows only same-origin routes',async()=>{
 const x=serviceWorker();
 for(const data of [{json:()=>null},{json:()=>{throw Error('malformed');}},{json:()=>({url:'/catalogo/123?token=private'})}]){
  let pending=null;
  x.handlers.push({data,waitUntil(p){pending=p;}});
  await pending;
 }
 assert.equal(x.shown.length,3);
 assert.equal(x.shown[0].options.data.url,'/notifiche');
 assert.equal(x.shown[1].options.data.url,'/notifiche');
 assert.equal(x.shown[2].options.data.url,'/catalogo/123');
});
test('manifest identity, service-worker precache and semantic UI routes are coherent',()=>{
 const manifest=JSON.parse(load('public/manifest.webmanifest'));
 assert.equal(manifest.id,'/');
 assert.equal(manifest.display,'standalone');
 assert.equal(manifest.start_url,'/');
 assert.equal(manifest.theme_color,'#10243a');
 for(const size of [192,512])assert.ok(manifest.icons.some(icon=>icon.sizes===size+'x'+size&&icon.type==='image/png'));
 for(const shortcut of manifest.shortcuts)assert.ok(shortcut.url.startsWith('/'));
 const sw=load('public/sw.js'),app=load('public/app.js'),index=load('public/index.html');
 assert.ok(sw.includes("'/experience.js'"),'offline cache includes UX module');
 assert.ok(app.includes("path==='/installazione'"),'public install route');
 assert.ok(index.includes('id="lumen-dialog"'),'native dialog available');
 assert.ok(app.includes("Notification.requestPermission()"),'permission request is explicitly user-triggered');
 assert.ok(app.includes("data-click='install'")||app.includes('data-click="install"'),'install action exists');
 const css=load('public/style.css');
 assert.equal(/var\(--lumen-[^)]+\)[a-z0-9]+/.test(css),false,'no invalid concatenated CSS token');
});

test('availability statuses do not invent a queue or unknown stock',async()=>{
 const {localAvailability}=await import('../public/experience.js');
 for(const v of [null,undefined,NaN,1.5,-1,'0'])
   assert.equal(localAvailability(v).status,'unknown');
 assert.equal(localAvailability(0).label,'Nessuna copia disponibile ora');
 assert.equal(localAvailability(1).label,'1 copia disponibile');
 assert.equal(localAvailability(3).label,'3 copie disponibili');
});
test('hold receipt disambiguates ready vs queued vs unverified',async()=>{
 const {localHoldResult}=await import('../public/experience.js');
 assert.match(localHoldResult({status:'ready'}).message,/pronta per il ritiro/i);
 assert.match(localHoldResult({status:'queued'}).message,/in coda/i);
 for(const v of [null,undefined,{}, {status:'pending'}])
   assert.equal(localHoldResult(v).epistemic,'unknown');
});

test('local statuses never label unsupported backend values as confirmed',async()=>{
 const {localStatus}=await import('../public/experience.js');
 const states={
   hold:{queued:'In coda',ready:'Pronto al ritiro',fulfilled:'Consegnata',cancelled:'Annullata'},
   loan:{active:'In prestito',returned:'Restituito'},
   suggestion:{pending:'In valutazione',approved:'Approvata',rejected:'Non accolta',ordered:'Ordinata'}
 };
 for(const [domain,values] of Object.entries(states)){
   for(const [status,label] of Object.entries(values)){
     const projection=localStatus(domain,status);
     assert.equal(projection.label,label);
     assert.equal(projection.epistemic,'supported');
   }
   for(const value of [null,undefined,'other','','approved-later']){
     assert.equal(localStatus(domain,value).label,'Stato da verificare');
     assert.equal(localStatus(domain,value).epistemic,'unknown');
   }
 }
 assert.equal(localStatus('koha','active').epistemic,'unknown');
});
test('local action text does not imply remote push delivery or an unperformed loan',async()=>{
 const {localActionFeedback}=await import('../public/experience.js');
 assert.match(localActionFeedback('book'),/catalogo LUMEN/);
 assert.match(localActionFeedback('checkout'),/Prestito registrato/);
 assert.match(localActionFeedback('broadcast'),/casella avvisi/i);
 assert.doesNotMatch(localActionFeedback('broadcast'),/notifica consegnata|push ricevuta/i);
 for(const action of ['install','koha-hold','koha-checkout','unknown'])
   assert.equal(localActionFeedback(action),null);
});
