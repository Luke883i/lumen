import {test,expect} from '@playwright/test';

const sizes=[{width:1440,height:900,heroMax:240},{width:393,height:851,heroMax:180},{width:320,height:700,heroMax:180}];
const eps=1.5;
async function checkOverflow(page,label){
 const d=await page.evaluate(()=>{
  const viewport=innerWidth,scroll=document.documentElement.scrollWidth;
  const offenders=[...document.querySelectorAll('body *')].map(el=>{
    const r=el.getBoundingClientRect();
    return {tag:el.tagName,cls:String(el.className||'').slice(0,80),
      name:(el.textContent||'').trim().slice(0,45),right:Math.round(r.right),width:Math.round(r.width)};
  }).filter(x=>x.right>viewport+1.5).slice(0,8);
  return {viewport,scroll,offenders};
 });
 expect(d.scroll,label+' horizontal overflow: '+JSON.stringify(d.offenders)).toBeLessThanOrEqual(d.viewport+eps);
}
async function measure(page,selector){
 return page.locator(selector).evaluateAll(nodes=>nodes.map(el=>{
  const r=el.getBoundingClientRect();
  return {width:r.width,height:r.height,scrollHeight:el.scrollHeight,clientHeight:el.clientHeight};
 }));
}
async function login(page,role){
 await page.goto('/accedi');
 await page.locator('input[name="email"]').fill(role+'@lumen.local');
 await page.locator('input[name="password"]').fill('Demo1234!');
 await page.locator('form[data-form="login"] button[type="submit"]').click();
 await expect(page).toHaveURL(role==='librarian'?/\/staff$/:/\/me$/);
}
test('UX-S4 real pixel boxes: hero, covers, search at 1440, 393, 320',async({page},info)=>{
 const evidence=[];
 for(const size of sizes){
  await page.setViewportSize(size);
  await page.goto('/');
  await expect(page.getByRole('heading',{name:'Ogni libro apre una possibilità.'})).toBeVisible();
  await checkOverflow(page,'home '+size.width);
  const hero=(await measure(page,'.hero'))[0];
  expect(hero.height,'hero '+size.width).toBeLessThanOrEqual(size.heroMax+eps);
  expect(await page.locator('.hero-art').count()).toBe(0);
  const homeCovers=await measure(page,'.book-card .cover');
  expect(homeCovers.length).toBeGreaterThan(0);
  for(const c of homeCovers){
   expect(c.width).toBeLessThanOrEqual(64+eps);
   expect(c.height).toBeLessThanOrEqual(88+eps);
  }
  const button=(await measure(page,'.hero form[data-form="search"] button'))[0];
  expect(button.height,'search target '+size.width).toBeGreaterThanOrEqual(44-eps);
  await page.goto('/catalogo');
  await checkOverflow(page,'catalog '+size.width);
  await page.locator('.book-card a[data-nav]').first().click();
  const cover=(await measure(page,'.cover-detail'))[0];
  expect(cover.width).toBeLessThanOrEqual(64+eps);
  expect(cover.height).toBeLessThanOrEqual(88+eps);
  await checkOverflow(page,'detail '+size.width);
  evidence.push({size,hero,homeCovers,detail:cover,search:button});
 }
 await info.attach('ux-s4-catalog-bounding-boxes.json',{body:Buffer.from(JSON.stringify(evidence,null,2)),contentType:'application/json'});
});
test('UX-S4 metric tiles and action targets remain compact but accessible',async({page},info)=>{
 await login(page,'student');const evidence=[];
 for(const size of sizes){
  await page.setViewportSize(size);
  await page.goto('/me');
  await expect(page.getByRole('heading',{name:'La mia biblioteca'})).toBeVisible();
  await checkOverflow(page,'my-area '+size.width);
  const metrics=await measure(page,'.metric-strip > .card');
  expect(metrics.length).toBe(3);
  for(const m of metrics)expect(m.height,'metric '+size.width).toBeLessThanOrEqual(112+eps);
  const buttons=await measure(page,'.btn.small:visible');
  for(const b of buttons)expect(b.height,'button '+size.width).toBeGreaterThanOrEqual(44-eps);
  if(size.width<=600){
   const nav=await measure(page,'.bottom-nav a');
   for(const a of nav)expect(a.height,'mobile nav tap target').toBeGreaterThanOrEqual(44-eps);
  }
  evidence.push({size,metrics,buttons});
 }
 await info.attach('ux-s4-metric-bounding-boxes.json',{body:Buffer.from(JSON.stringify(evidence,null,2)),contentType:'application/json'});
});
test('UX-S4 200% root type size preserves reflow and unclipped hero, catalogue and install',async({page})=>{
 for(const width of [320,393,1440]){
  await page.setViewportSize({width,height:900});
  await page.goto('/');
  await page.evaluate(()=>{document.documentElement.style.fontSize='200%';});
  await checkOverflow(page,'200% home '+width);
  const hero=(await measure(page,'.hero'))[0];
  expect(hero.scrollHeight).toBeLessThanOrEqual(hero.clientHeight+eps);
  await expect(page.locator('.hero form[data-form="search"] button[type="submit"]')).toBeVisible();
  await page.goto('/catalogo');
  await checkOverflow(page,'200% catalogue '+width);
  await page.goto('/installazione');
  await checkOverflow(page,'200% install '+width);
 }
});
test('UX-S4 staff tasks remain reachable without horizontal overflow at 320px',async({page})=>{
 await page.setViewportSize({width:320,height:700});
 await login(page,'librarian');
 for(const area of ['panoramica','circolazione','catalogo','acquisti','persone','comunicazioni']){
  await page.goto('/staff?area='+area);
  await expect(page.locator('.staff-workspaces')).toBeVisible();
  await checkOverflow(page,'staff '+area);
 }
 await page.goto('/staff?area=circolazione');
 await expect(page.getByRole('main')).toContainText('Prenotazioni');
});
