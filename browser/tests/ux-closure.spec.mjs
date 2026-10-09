import {test,expect} from '@playwright/test';
const accounts={student:'student@lumen.local',faculty:'faculty@lumen.local',librarian:'librarian@lumen.local'};
async function authenticate(page,role){
 await page.goto('/accedi');
 await page.locator('input[name="email"]').fill(accounts[role]);
 await page.locator('input[name="password"]').fill('Demo1234!');
 await page.locator('form[data-form="login"] button[type="submit"]').click();
 // Never navigate away while the asynchronous login/cookie write is pending.
 await expect(page).toHaveURL(role==='librarian'?/\/staff$/:/\/me$/);
 await expect(page.getByRole('main')).toBeVisible();
 await page.goto('/');
}
test('home has exactly one compact, non-authoritative next-step for each persona',async({page})=>{
 const cases=[{role:null,href:'/catalogo',label:'Cerca nel catalogo'},
  {role:'student',href:'/me',label:'Controlla prestiti e prenotazioni'},
  {role:'faculty',href:'/acquisti',label:'Segui le proposte di acquisto'},
  {role:'librarian',href:'/staff',label:'Apri il banco bibliotecario'}];
 for(const c of cases){
  await page.context().clearCookies();
  if(c.role)await authenticate(page,c.role);else await page.goto('/');
  const featured=page.locator('.task-hub .task-link--featured');
  await expect(featured).toHaveCount(1);
  await expect(featured).toHaveAttribute('href',c.href);
  await expect(featured).toContainText(c.label);
  await expect(page.locator('.task-hub .task-hint')).toBeVisible();
  const bounds=await featured.boundingBox();
  expect(bounds.height).toBeGreaterThanOrEqual(44);
  expect(bounds.height).toBeLessThanOrEqual(110);
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
 }
});
test('zero search response has one clear recovery action and no invented availability',async({page})=>{
 await page.goto('/catalogo?q=NONEXISTENT-LUMEN-UX-CLOSURE-999');
 await expect(page.locator('.empty-action')).toContainText('Nessun titolo trovato nel catalogo LUMEN');
 const reset=page.locator('.empty-action a[href="/catalogo"]');
 await expect(reset).toHaveCount(1);
 await expect(reset).toHaveText('Azzera la ricerca');
 await reset.click();
 await expect(page).toHaveURL(/\/catalogo$/);
 await expect(page.locator('.book-card').first()).toBeVisible();
});
test('mobile and 200% text sizing preserve compact CTA visibility and reflow',async({page})=>{
 await page.setViewportSize({width:320,height:700});
 await page.goto('/');
 const featured=page.locator('.task-link--featured');
 await expect(featured).toBeVisible();
 await page.evaluate(()=>document.documentElement.style.fontSize='200%');
 try{
  const o=await page.evaluate(()=>({
   delta:document.documentElement.scrollWidth-window.innerWidth,
   cta:document.querySelector('.task-link--featured').getBoundingClientRect().height
  }));
  expect(o.delta).toBeLessThanOrEqual(1);
  expect(o.cta).toBeGreaterThanOrEqual(44);
 }finally{await page.evaluate(()=>document.documentElement.style.fontSize='');}
});
