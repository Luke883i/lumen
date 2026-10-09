import {test,expect} from '@playwright/test';
import {writeFileSync,mkdirSync} from 'node:fs';
import {join} from 'node:path';

// Real Chromium screenshots of the *running* LUMEN server, never mockup renders.
// Captures are bound to Git SHA and test project, and are safe DEMO-only data.
const version=process.env.GITHUB_SHA||process.env.GIT_SHA||'local-unknown';
async function signIn(page,role){
 await page.goto('/accedi');
 await page.locator('input[name="email"]').fill(role+'@lumen.local');
 await page.locator('input[name="password"]').fill('Demo1234!');
 await page.locator('form[data-form="login"] button[type="submit"]').click();
 await expect(page).toHaveURL(role==='librarian'?/\/staff(?:\?.*)?$/:/\/me$/);
}
async function capture(page,info,{id,route,role,meaning,authority}){
 await page.goto(route);
 const main=page.locator('main#main');
 await expect(main).toBeVisible();
 await expect(main.locator('h1')).toHaveCount(1);
 const data=await page.evaluate(()=>{
  const main=document.querySelector('#main'),viewport=innerWidth;
  const rect=el=>{const r=el.getBoundingClientRect();return {x:Math.round(r.x),y:Math.round(r.y),width:Math.round(r.width),height:Math.round(r.height)};};
  const visible=el=>{const r=el.getBoundingClientRect();return r.width>0&&r.height>0&&getComputedStyle(el).visibility!=='hidden';};
  const actions=[...main.querySelectorAll('a.btn,button.btn,button[type="submit"],main a.policy-link')]
    .filter(visible).map(el=>({label:(el.innerText||el.textContent||'').trim().replace(/\s+/g,' ').slice(0,85),
      tag:el.tagName,box:rect(el),primary:el.classList.contains('btn')&&!el.classList.contains('alt')&&!el.classList.contains('ghost'),
      targetHeight:Math.round(el.getBoundingClientRect().height)}));
  const badges=[...main.querySelectorAll('.badge,.policy-missing,[role="alert"]')].filter(visible)
    .map(x=>(x.textContent||'').trim().slice(0,100));
  const sections=[...main.querySelectorAll('h1,h2,h3')].filter(visible).map(x=>({level:x.tagName,text:x.textContent.trim().slice(0,110)}));
  const cards=[...main.querySelectorAll('.card')].filter(visible).map(rect);
  const hero=main.querySelector('.hero');
  const side=[...document.querySelectorAll('body *')].filter(visible).map(el=>{
    const r=el.getBoundingClientRect();
    return {tag:el.tagName,cls:String(el.className||'').slice(0,70),r:Math.round(r.right)};
  }).filter(x=>x.r>viewport+1.5).slice(0,8);
  return {title:document.title,mainHeading:main.querySelector('h1')?.textContent.trim(),
    headings:sections,actions,badges,viewport:{width:innerWidth,height:innerHeight,documentWidth:document.documentElement.scrollWidth},
    layout:{hero:hero?rect(hero):null,largestCardHeight:cards.length?Math.max(...cards.map(c=>c.height)):null,
      firstFoldMainArea:Math.round(main.getBoundingClientRect().top),mainChildCount:main.children.length},
    offscreen:side,
    legalLinks:{terms:!!document.querySelector('a[href="/condizioni"]'),
      information:!!document.querySelector('a[href="/informazioni"]'),
      openSource:!!document.querySelector('a[href="/opensource"]')},
    screenshotProfile:'test-only demo data'};
 });
 const issues=[];
 if(data.viewport.documentWidth>data.viewport.width+1)issues.push('HORIZONTAL_OVERFLOW');
 if(data.headings.filter(x=>x.level==='H1').length!==1)issues.push('HEADING_HIERARCHY');
 if(!data.legalLinks.terms||!data.legalLinks.information||!data.legalLinks.openSource)
   issues.push('INFO_DISCOVERABILITY');
 if(data.actions.some(x=>x.label.length===0))issues.push('UNNAMED_CTA');
 if(data.actions.some(x=>x.targetHeight<24))issues.push('SMALL_ACTION_TARGET');
 if(data.layout.hero?.height>240&&data.viewport.width>=850)issues.push('OVERSIZED_HERO');
 if(data.layout.hero?.height>180&&data.viewport.width<600)issues.push('OVERSIZED_MOBILE_HERO');
 const record={commit:version,project:info.project.name,id,route,role,meaning,authority,
  ...data,issues,epistemic:{screenshots:'actual_headless_chromium',external:authority==='Koha'?'not_qualified':'local_test_fixture'}};
 const imagePath=info.outputPath(id+'.png');
 await page.screenshot({path:imagePath,fullPage:true,animations:'disabled'});
 const previewPath=info.outputPath(id+'-preview.jpg');
 await page.screenshot({path:previewPath,type:'jpeg',quality:38,fullPage:false,animations:'disabled'});
 record.screenshot=id+'.png';record.preview=id+'-preview.jpg';
 expect(issues,'semantic issues on '+id+': '+JSON.stringify(record)).toEqual([]);
 return record;
}
test('SHA-bound, role-specific real screenshots + semantic audit at desktop and mobile',async({page},info)=>{
 mkdirSync(info.outputDir,{recursive:true});
 const records=[],errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 const plans=[
  {id:'00-guest-home',route:'/',role:'guest',meaning:'Find and understand the library',authority:'local LUMEN demo'},
  {id:'01-guest-catalogue',route:'/catalogo',role:'guest',meaning:'Discover bibliography and availability',authority:'local LUMEN demo'},
  {id:'02-guest-information',route:'/informazioni',role:'guest',meaning:'Identify operator, policies and support',authority:'operator-configurable, incomplete in demo'},
  {id:'03-guest-terms',route:'/condizioni',role:'guest',meaning:'Understand request effects and distinguish software from institution',authority:'informational only'},
  {id:'04-guest-open-source',route:'/opensource',role:'guest',meaning:'Identify software and libraries/license boundary',authority:'repository notices'}
 ];
 for(const plan of plans)records.push(await capture(page,info,plan));
 await signIn(page,'student');
 for(const plan of [
  {id:'05-student-my-area',route:'/me',role:'student',meaning:'Know current loans and holds, find next action',authority:'LUMEN local receipt'},
  {id:'06-student-notifications',route:'/notifiche',role:'student',meaning:'Read authoritative inbox',authority:'LUMEN inbox'}
 ])records.push(await capture(page,info,plan));
 await page.goto('/');await page.locator('[data-click="logout"]').first().click();
 await signIn(page,'faculty');
 records.push(await capture(page,info,{id:'07-faculty-proposals',route:'/acquisti',role:'faculty',meaning:'Submit and track acquisitions',authority:'LUMEN proposal state'}));
 await page.goto('/');await page.locator('[data-click="logout"]').first().click();
 await signIn(page,'librarian');
 for(const plan of [
  {id:'08-librarian-overview',route:'/staff?area=panoramica',role:'librarian',meaning:'Orient priorities at the desk',authority:'LUMEN staff stats'},
  {id:'09-librarian-circulation',route:'/staff?area=circolazione',role:'librarian',meaning:'Check holds, checkouts and returns',authority:'LUMEN local circulation'},
  {id:'10-librarian-acquisitions',route:'/staff?area=acquisti',role:'librarian',meaning:'Decide on proposals',authority:'LUMEN proposal review'},
  {id:'11-librarian-communications',route:'/staff?area=comunicazioni',role:'librarian',meaning:'Send categories of inbox notices',authority:'LUMEN notification inbox'}
 ])records.push(await capture(page,info,plan));
 writeFileSync(info.outputPath('role-audit.json'),JSON.stringify({commit:version,project:info.project.name,
  screenshots:records,uncertainties:['Physical device acceptance untested','Real Koha and institutional policies not configured','Render production and 2,000-user load untested']},null,2));
 expect(errors,'browser exceptions').toEqual([]);
});
