import {test,expect} from '@playwright/test';
test('guest homepage renders exactly one compact next step and all roles have safe browser projections',async({page})=>{
 await page.goto('/');
 const featured=page.locator('.task-hub .task-link--featured');
 await expect(featured).toHaveCount(1);
 await expect(featured).toHaveAttribute('href','/catalogo');
 await expect(featured).toContainText('Cerca nel catalogo');
 await expect(page.locator('.task-hub .task-hint')).toBeVisible();
 const bounds=await featured.boundingBox();
 expect(bounds.height).toBeGreaterThanOrEqual(44);
 expect(bounds.height).toBeLessThanOrEqual(110);
 // Use the exact module shipped to Chrome. Authenticated role transitions
 // are already covered by the existing browser E2E suite and server RBAC.
 // Repeating the demo logins in this late-running test would collide with
 // the application-wide anti-brute-force threshold.
 const projected=await page.evaluate(async()=>{
   const {nextJourney}=await import('/journey.js');
   return ['student','faculty','librarian','admin'].map(role=>nextJourney({role,authenticated:true}));
 });
 assertPaths(projected);
 const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth);
 expect(overflow).toBeLessThanOrEqual(1);
});
function assertPaths(actual){
 const expected=['/me','/acquisti','/staff','/catalogo'];
 actual.forEach((item,i)=>{
   expect(item.href).toBe(expected[i]);
   expect(item.epistemicStatus).toBe('conditional');
   expect(item.provenance).toBe('lumen.navigation_only');
 });
}
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
