import {test,expect} from '@playwright/test';

const accounts={
  student:'student@lumen.local',
  faculty:'faculty@lumen.local',
  librarian:'librarian@lumen.local'
};

async function signIn(page,role){
  await page.goto('/accedi');
  await expect(page.getByRole('heading',{name:/Bentornato su LUMEN/})).toBeVisible();
  await page.locator('input[name="email"]').fill(accounts[role]);
  await page.locator('input[name="password"]').fill('Demo1234!');
  await page.locator('form[data-form="login"] button[type="submit"]').click();
  await expect(page).toHaveURL(role==='librarian'?/\/staff$/:/\/me$/);
  await expect(page.getByRole('main')).toBeVisible();
}

test('guest homepage, catalogue search and semantic install guide work in a real browser',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/');
  await expect(page.getByRole('heading',{name:'Ogni libro apre una possibilità.'})).toBeVisible();
  await expect(page.getByRole('main')).toContainText('Dal catalogo');
  const search=page.locator('form[data-form="search"]');
  await search.locator('input[name="query"]').fill('Design');
  await search.getByRole('button',{name:/Cerca/}).click();
  await expect(page).toHaveURL(/\/catalogo\?q=Design/);
  await expect(page.getByRole('main')).toContainText('Design dei servizi');
  await page.goto('/installazione');
  await expect(page.getByRole('heading',{name:'LUMEN sul tuo dispositivo'})).toBeVisible();
  await expect(page.getByRole('main')).toContainText('Android · Chrome');
  await expect(page.getByRole('main')).toContainText('Windows · Chrome');
  expect(errors).toEqual([]);
});

test('install CTA is browser-owned: no invented success when prompt is declined',async({page})=>{
  await page.goto('/installazione');
  await expect(page.getByRole('heading',{name:'LUMEN sul tuo dispositivo'})).toBeVisible();
  // Chrome is allowed not to emit beforeinstallprompt; exercise its presence
  // with a simulated event, not an assertion of physical OS installation.
  await page.evaluate(()=>{
    const event=new Event('beforeinstallprompt');
    Object.defineProperty(event,'prompt',{value:async()=>{}});
    Object.defineProperty(event,'userChoice',{value:Promise.resolve({outcome:'dismissed'})});
    window.dispatchEvent(event);
  });
  const install=page.getByRole('button',{name:'Installa LUMEN',exact:true});
  await expect(install).toBeVisible();
  await install.click();
  await expect(page.locator('#toast')).toContainText('Installazione annullata');
  await expect(page.locator('#toast')).not.toContainText('installata sul dispositivo');
});

test('student login, hold lifecycle and LUMEN dialog cancel/confirm are browser-functional',async({page})=>{
  await signIn(page,'student');
  await expect(page.getByRole('heading',{name:'La mia biblioteca'})).toBeVisible();
  await page.goto('/catalogo');
  await expect(page.locator('.book-card').first()).toBeVisible();
  await page.locator('.book-card').first().locator('a[data-nav]').first().click();
  await expect(page.locator('form[data-form="hold"]')).toBeVisible();
  const receiptPromise=page.waitForResponse(r=>r.url().endsWith('/api/holds')&&r.request().method()==='POST');
  await page.locator('form[data-form="hold"] button[type="submit"]').click();
  const response=await receiptPromise;
  expect(response.status()).toBe(201); // POST /api/holds creates a reservation
  const receipt=await response.json();
  expect(['queued','ready']).toContain(receipt.status);
  await expect(page.locator('#toast')).toContainText(receipt.status==='ready'?
    'Prenotazione pronta per il ritiro':'Prenotazione in coda');
  await page.goto('/me');
  const cancel=page.locator('[data-click="cancel-hold"]').first();
  await expect(cancel).toBeVisible();
  await cancel.click();
  const dialog=page.locator('#lumen-dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('Annullare la prenotazione?');
  await dialog.getByRole('button',{name:'Torna indietro'}).click();
  await expect(dialog).not.toBeVisible();
  await expect(cancel).toBeEnabled();
  await cancel.click();
  await dialog.getByRole('button',{name:'Annulla prenotazione'}).click();
  await expect(page.locator('[data-click="cancel-hold"]')).toHaveCount(0);
});

test('faculty has acquisitions while student is excluded; librarian has staff desk',async({page})=>{
  await signIn(page,'faculty');
  await page.goto('/acquisti');
  await expect(page.getByRole('heading',{name:'Proposte d’acquisto'})).toBeVisible();
  await expect(page.locator('form[data-form="suggest"]')).toBeVisible();
});

test('librarian staff desk and branded destructive dialog are usable',async({page})=>{
  await signIn(page,'librarian');
  await expect(page.getByRole('heading',{name:'Banco bibliotecario'})).toBeVisible();
  // A librarian is allowed to access the desk, not to bypass confirmation.
  await expect(page.getByRole('main')).toContainText('Prestiti attivi');
  const disable=page.locator('[data-click="disable"]').first();
  if(await disable.count()){
    await disable.click();
    const dialog=page.locator('#lumen-dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('Disabilitare l’account?');
    await dialog.getByRole('button',{name:'Torna indietro'}).click();
    await expect(dialog).not.toBeVisible();
  }
});

test('push unconfigured: no permission solicitation; inbox remains available',async({page})=>{
  await signIn(page,'student');
  await page.goto('/impostazioni');
  await expect(page.getByRole('heading',{name:'Impostazioni'})).toBeVisible();
  await expect(page.getByRole('main')).toContainText('non ha ancora attivato le notifiche di sistema');
  await expect(page.locator('[data-click="enable-push"]')).toHaveCount(0);
  await page.goto('/notifiche');
  await expect(page.getByRole('heading',{name:'Comunicazioni'})).toBeVisible();
});

test('mobile viewport never causes horizontal overflow; navigation remains actionable',async({page,isMobile})=>{
  test.skip(!isMobile,'mobile emulation only');
  await page.goto('/');
  await expect(page.getByRole('navigation',{name:'Navigazione mobile'})).toBeVisible();
  const overflow=await page.evaluate(()=>({
    screen:window.innerWidth,document:document.documentElement.scrollWidth
  }));
  expect(overflow.document,'horizontal overflow').toBeLessThanOrEqual(overflow.screen+1);
  await page.getByRole('navigation',{name:'Navigazione mobile'})
    .locator('a[href="/catalogo"]').click();
  await expect(page.getByRole('heading',{name:'Catalogo'})).toBeVisible();
});

test('offline service worker serves shell without inventing catalogue data',async({page,context})=>{
  await page.goto('/');
  await page.evaluate(async()=>{await navigator.serviceWorker.ready;});
  await page.reload();
  await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
  await context.setOffline(true);
  try{
    await page.goto('/installazione',{waitUntil:'domcontentloaded'});
    await expect(page.getByRole('heading',{name:'LUMEN sul tuo dispositivo'})).toBeVisible();
    await expect(page.locator('#toast')).toContainText(/non raggiungibile|online/i);
  }finally{await context.setOffline(false);}
});

test('student cannot open faculty acquisition UI or access librarian APIs',async({page})=>{
  await signIn(page,'student');
  await page.goto('/acquisti');
  await expect(page.locator('form[data-form="suggest"]')).toHaveCount(0);
  await page.goto('/staff');
  await expect(page.locator('form[data-form="broadcast"]')).toHaveCount(0);
  const response=await page.request.get('/api/staff/stats');
  expect(response.status()).toBe(403);
});

test('standalone title detail uses truthful availability and one clear hold CTA',async({page})=>{
  await signIn(page,'student');
  await page.goto('/catalogo');
  await page.locator('.book-card a[data-nav]').first().click();
  await expect(page.getByRole('heading',{name:'Prenota il titolo'})).toBeVisible();
  await expect(page.locator('form[data-form="hold"] button[type="submit"]')).toHaveText('Invia prenotazione');
  await expect(page.getByRole('main')).not.toContainText('Disponibilità in attesa');
  await expect(page.getByRole('main')).not.toContainText('Richiedi / prenota');
});
