import {test,expect} from '@playwright/test';

async function student(page){
  await page.goto('/accedi');
  await page.locator('input[name="email"]').fill('student@lumen.local');
  await page.locator('input[name="password"]').fill('Demo1234!');
  await page.locator('form[data-form="login"] button').click();
  await expect(page).toHaveURL(/\/me$/);
}
async function openBook(page){
  await page.goto('/catalogo');
  await page.locator('.book-card a[data-nav]').first().click();
  await expect(page.locator('form[data-form="hold"]')).toBeVisible();
}

test('UX-S5 stale GET result cannot overwrite the new route or keyboard focus',async({page})=>{
  await page.goto('/');
  await expect(page.getByRole('heading',{name:'Ogni libro apre una possibilità.'})).toBeVisible();
  let release,blocked;
  const gate=new Promise(ok=>release=ok);
  const arrived=new Promise(ok=>blocked=ok);
  await page.route(/\/api\/books(?:\?|$)/,async route=>{
    if(new URL(route.request().url()).pathname!=='/api/books')return route.continue();
    blocked();
    await gate;await route.continue();
  });
  await page.locator('a[data-nav][href="/catalogo"]:visible').first().click();
  await arrived;
  await expect(page.locator('#main')).toContainText('Caricamento');
  // Navigate via the exact popstate route used by Back/Forward while the
  // catalogue request is blocked. The late /api/books cannot revive it.
  await page.evaluate(()=>{
    history.pushState({},'','/installazione');
    dispatchEvent(new PopStateEvent('popstate'));
  });
  await expect(page).toHaveURL(/\/installazione$/);
  await expect(page.getByRole('heading',{name:'LUMEN sul tuo dispositivo'})).toBeVisible();
  release();
  await page.waitForTimeout(150);
  await expect(page.getByRole('heading',{name:'LUMEN sul tuo dispositivo'})).toBeVisible();
  await expect(page.locator('#main')).toBeFocused();
});
test('UX-S5 pending hold has one request, busy CTA, and persistent next-step receipt',async({page})=>{
  await student(page);await openBook(page);
  let release,arrived;
  const gate=new Promise(ok=>release=ok), pending=new Promise(ok=>arrived=ok);
  let count=0;
  await page.route('**/api/holds',async route=>{
    if(route.request().method()!=='POST')return route.continue();
    count++;arrived();await gate;await route.continue();
  });
  const submit=page.locator('form[data-form="hold"] button[type="submit"]');
  await submit.click();await pending;
  await expect(submit).toBeDisabled();
  await expect(submit).toHaveAttribute('aria-busy','true');
  await submit.evaluate(node=>node.click()); // disabled button cannot re-submit
  expect(count).toBe(1);
  release();
  await expect(page.locator('.action-outcome')).toBeVisible();
  await expect(page.locator('.action-outcome a[href="/me"]')).toContainText('Segui la prenotazione');
  await page.locator('.action-outcome a[href="/me"]').click();
  await expect(page).toHaveURL(/\/me$/);
});
test('UX-S5 network-ambiguous hold shows verify-before-repeat, never retry or success',async({page})=>{
  await student(page);await openBook(page);
  await page.route('**/api/holds',route=>route.abort('failed'));
  await page.locator('form[data-form="hold"] button[type="submit"]').click();
  await expect(page.locator('#toast')).toContainText('Esito non verificato');
  await expect(page.locator('#toast')).toContainText('prima di ripetere');
  await expect(page.locator('#toast')).not.toContainText('Prenotazione pronta');
  await expect(page.locator('form[data-form="hold"] button[type="submit"]')).toBeEnabled();
});
test('UX-S5 native confirmation cancel retains button semantics and returns focus',async({page})=>{
  await student(page);
  await openBook(page);
  await page.locator('form[data-form="hold"] button').click();
  await page.goto('/me');
  const cancel=page.locator('[data-click="cancel-hold"]').first();
  await expect(cancel).toBeVisible();
  await cancel.focus();
  await page.keyboard.press('Enter');
  const dialog=page.locator('#lumen-dialog');
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(cancel).toBeFocused();
  await expect(cancel).toBeEnabled();
});
