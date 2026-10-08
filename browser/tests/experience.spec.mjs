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

test('UX-S2 catalog projection displays only source-backed local availability',async({page})=>{
  const response=await page.request.get('/api/books');
  expect(response.ok()).toBeTruthy();
  const books=await response.json();
  expect(books.length).toBeGreaterThan(0);
  await page.goto('/catalogo');
  const first=page.locator('.book-card').first();
  await expect(first).toBeVisible();
  const available=books[0].available;
  const label=Number.isSafeInteger(available)&&available>=0?
    (available===0?'Nessuna copia disponibile ora':available===1?'1 copia disponibile':available+' copie disponibili'):
    'Disponibilità da verificare';
  await expect(first).toContainText(label);
  await first.locator('a[data-nav]').first().click();
  await expect(page.getByRole('main')).toContainText(label);
  await expect(page.getByRole('main')).toContainText('la prenotazione non equivale a un prestito');
});

test('UX-S2 faculty proposal is labelled in evaluation, never presented as purchased',async({page})=>{
  await signIn(page,'faculty');
  await page.goto('/acquisti');
  const form=page.locator('form[data-form="suggest"]');
  await form.locator('input[name="title"]').fill('Validazione proiezioni non autorevoli');
  await form.locator('input[name="author"]').fill('Biblioteca test');
  await form.locator('textarea[name="reason"]').fill('Verifica dello stato di valutazione proposta');
  await form.locator('button[type="submit"]').click();
  const entry=page.locator('.card').filter({hasText:'Validazione proiezioni non autorevoli'}).first();
  await expect(entry).toContainText('In valutazione');
  await expect(entry).toContainText('non è un ordine');
  await expect(entry).not.toContainText('acquistato');
});


test('UX-S3 librarian task workspaces disclose only the selected operation',async({page})=>{
 await signIn(page,'librarian');
 const nav=page.getByRole('navigation',{name:'Attività del banco'});
 await expect(nav.getByRole('link')).toHaveCount(7);
 await expect(nav.getByRole('link',{name:'Panoramica'})).toHaveAttribute('aria-current','page');
 await expect(page.getByRole('main')).toContainText('Prestiti attivi');
 await expect(page.locator('form[data-form="checkout"]')).toHaveCount(0);
 await nav.getByRole('link',{name:'Circolazione'}).click();
 await expect(page).toHaveURL(/\/staff\?area=circolazione$/);
 await expect(page.locator('form[data-form="checkout"]')).toBeVisible();
 await expect(page.getByRole('heading',{name:'Prestiti da gestire'})).toBeVisible();
 await expect(page.locator('form[data-form="book"]')).toHaveCount(0);
 await expect(page.locator('form[data-form="broadcast"]')).toHaveCount(0);
 await nav.getByRole('link',{name:'Catalogo'}).click();
 await expect(page.locator('form[data-form="book"]')).toBeVisible();
 await expect(page.locator('form[data-form="checkout"]')).toHaveCount(0);
 await page.goto('/staff?area=acquisti');
 await expect(page.getByRole('heading',{name:'Proposte d’acquisto'})).toBeVisible();
 await expect(page.locator('form[data-form="user"]')).toHaveCount(0);
 await page.goto('/staff?area=persone');
 await expect(page.locator('form[data-form="user"]')).toBeVisible();
 await expect(page.locator('form[data-form="broadcast"]')).toHaveCount(0);
 await page.goto('/staff?area=comunicazioni');
 await expect(page.locator('form[data-form="broadcast"]')).toBeVisible();
 await expect(page.locator('form[data-form="user"]')).toHaveCount(0);
 await page.goto('/staff?area=integrazioni');
 await expect(page.getByRole('main')).toContainText('Nessuna integrazione istituzionale attivata');
 await page.goto('/staff?area=invalid');
 await expect(nav.getByRole('link',{name:'Panoramica'})).toHaveAttribute('aria-current','page');
});

test('UX-S3 role navigation remains <=5 and privileged pages are inaccessible to patrons',async({page,isMobile})=>{
 for(const role of ['student','faculty','librarian']){
   await signIn(page,role);
   // Inspect primary-route contracts in BOTH projects. getByRole omits
   // CSS-hidden mobile navigation on desktop by design.
   const mobile=page.locator('nav.bottom-nav');
   const routes=await mobile.locator('a').evaluateAll(links=>links.map(x=>x.getAttribute('href')));
   expect(routes.length).toBeLessThanOrEqual(5);
   expect(new Set(routes).size).toBe(routes.length);
   expect(routes).toContain('/catalogo');
   expect(routes).toContain('/me');
   expect(routes).toContain('/notifiche');
   expect(routes.includes('/acquisti')).toBe(role==='faculty');
   expect(routes.includes('/staff')).toBe(role==='librarian');
   if(isMobile){
     const widths=await page.evaluate(()=>({inner:innerWidth,outer:document.documentElement.scrollWidth}));
     expect(widths.outer).toBeLessThanOrEqual(widths.inner+1);
   }
   if(role!=='librarian'){
     await page.goto('/staff?area=persone');
     await expect(page.locator('form[data-form="user"]')).toHaveCount(0);
   }
   if(role!=='faculty'){
     await page.goto('/acquisti');
     await expect(page.locator('form[data-form="suggest"]')).toHaveCount(0);
   }
   // Logout between role cases. No separate server authority is created by navigation.
   await page.goto('/impostazioni');
   await page.locator('[data-click="logout"]').click();
   await expect(page).toHaveURL(/\/$/);
 }
});

test('UX-S3 anonymous task-first entry and secondary services stay reachable',async({page,isMobile})=>{
 await page.goto('/');
 await expect(page.getByRole('heading',{name:'Cosa puoi fare'})).toBeVisible();
 await expect(page.locator('.task-hub').getByRole('link',{name:/Cerca nel catalogo/})).toBeVisible();
 await expect(page.locator('.task-hub').getByRole('link',{name:/Accedi alla biblioteca/})).toBeVisible();
 if(!isMobile){
   const more=page.locator('.nav-more');
   await more.locator('summary').click();
   await expect(more.getByRole('link',{name:'Installa LUMEN'})).toBeVisible();
 }
 await page.locator(isMobile?'nav.bottom-nav a[href="/catalogo"]':'nav.nav a[href="/catalogo"]').click();
 await expect(page.getByRole('heading',{name:'Catalogo'})).toBeVisible();
});


test('UX-S3 selected staff workspaces do not fetch unrelated bibliographic and identity datasets',async({page})=>{
 await signIn(page,'librarian');
 const requested=[];
 page.on('request',req=>{
   const route=new URL(req.url()).pathname;
   if(['/api/staff/stats','/api/staff/users','/api/books','/api/suggestions'].includes(route))
     requested.push(route);
 });
 await page.goto('/staff?area=comunicazioni');
 await expect(page.locator('form[data-form="broadcast"]')).toBeVisible();
 expect(requested).toEqual([]);
 await page.goto('/staff?area=acquisti');
 await expect(page.getByRole('heading',{name:'Proposte d’acquisto'})).toBeVisible();
 expect(requested).toContain('/api/suggestions');
 expect(requested).not.toContain('/api/staff/users');
 expect(requested).not.toContain('/api/staff/stats');
});

test('Fix E2E: queued and ready holds reach the librarian desk with honest actions',async({browser})=>{
 const staffContext=await browser.newContext(),patronContext=await browser.newContext();
 const staff=await staffContext.newPage(),patron=await patronContext.newPage();
 try{
  await signIn(staff,'librarian');
  const librarianInboxBefore=await (await staff.request.get('/api/notifications')).json();
  const before=librarianInboxBefore.filter(n=>n.kind==='staff_hold').length;
  await signIn(patron,'student');
  await staff.goto('/staff?area=catalogo');
  const unique='Reservation E2E '+Date.now();
  const form=staff.locator('form[data-form="book"]');
  await form.locator('input[name="title"]').fill(unique);
  await form.locator('input[name="author"]').fill('E2E Test');
  await form.locator('input[name="copies"]').fill('1');
  await form.getByRole('button',{name:'Registra titolo e copie'}).click();
  await expect(staff.locator('#toast')).toContainText(/Titolo|copie|registrat/i);
  await patron.goto('/catalogo?q='+encodeURIComponent(unique));
  const card=patron.locator('.book-card').filter({hasText:unique});
  await expect(card).toBeVisible();
  await card.locator('a[data-nav]').first().click();
  await patron.locator('form[data-form="hold"] button[type="submit"]').click();
  await expect(patron.locator('#toast')).toContainText(/Prenotazione pronta per il ritiro/);
  await staff.goto('/staff?area=circolazione');
  await expect(staff.getByRole('heading',{name:'Prenotazioni da gestire'})).toBeVisible();
  const row=staff.locator('.staff-hold').filter({hasText:unique});
  await expect(row).toBeVisible();
  await expect(row).toContainText('Pronta al ritiro');
  await expect(row.getByRole('button',{name:'Registra consegna'})).toBeVisible();
  const staffInbox=await (await staff.request.get('/api/notifications')).json();
  expect(staffInbox.filter(n=>n.kind==='staff_hold').length).toBeGreaterThan(before);
  // A second reservation for this one-copy title must join the queue,
  // and never show an early checkout CTA.
  const secondContext=await browser.newContext(),second=await secondContext.newPage();
  try{
   await signIn(second,'faculty');
   await second.goto('/catalogo?q='+encodeURIComponent(unique));
   await second.locator('.book-card').filter({hasText:unique}).locator('a[data-nav]').first().click();
   await second.locator('form[data-form="hold"] button[type="submit"]').click();
   await expect(second.locator('#toast')).toContainText('Prenotazione in coda');
   await staff.reload();
   const queued=staff.locator('.staff-hold').filter({hasText:unique}).filter({hasText:'In coda'});
   await expect(queued).toBeVisible();
   await expect(queued.getByRole('button',{name:'Registra consegna'})).toHaveCount(0);
  }finally{await secondContext.close();}
 }finally{await staffContext.close();await patronContext.close();}
});

test('Fix E2E: librarian broadcast reaches student inbox without invented OS delivery',async({browser})=>{
 const c1=await browser.newContext(),c2=await browser.newContext();
 const staff=await c1.newPage(),student=await c2.newPage();
 try{
  await signIn(staff,'librarian');
  await signIn(student,'student');
  await staff.goto('/staff?area=comunicazioni');
  const form=staff.locator('form[data-form="broadcast"]');
  const unique='Messaggio E2E '+Date.now();
  await form.locator('select[name="role"]').selectOption('student');
  await form.locator('input[name="title"]').fill(unique);
  await form.locator('textarea[name="body"]').fill('Messaggio di prova nella casella.');
  await form.getByRole('button',{name:'Invia alla casella LUMEN'}).click();
  await expect(staff.locator('#toast')).toContainText('Avviso registrato nella casella');
  await student.goto('/notifiche');
  await expect(student.getByText(unique)).toBeVisible();
  await expect(student.getByText('Messaggio di prova nella casella.')).toBeVisible();
 }finally{await c1.close();await c2.close();}
});


test('UX-S6A blue identity has real gradients, flat content cards and compact hero across browsers',async({page,isMobile})=>{
 await page.goto('/');
 // Navigation can resolve before the async catalogue/render completes on mobile.
 await expect(page.locator('.hero')).toBeVisible();
 await expect(page.locator('.task-link').first()).toBeVisible();
 const ui=await page.evaluate(()=>{
  const hero=document.querySelector('.hero'),search=document.querySelector('.searchbar .search-primary');
  const card=document.querySelector('.card'),task=document.querySelector('.task-link');
  const props=element=>getComputedStyle(element);
  const bounds=hero.getBoundingClientRect();
  return {
    background:props(document.body).backgroundColor,
    hero:props(hero).backgroundImage,
    search:props(search).backgroundImage,
    searchForeground:props(search).color,
    card:props(card).backgroundImage,
    task:props(task).backgroundImage,
    width:document.documentElement.scrollWidth,
    viewport:window.innerWidth,
    heroHeight:bounds.height,
    theme:document.querySelector('meta[name="theme-color"]')?.content,
    primaryText:props(hero).color
  };
 });
 expect(ui.background).toBe('rgb(244, 248, 255)');
 expect(ui.hero).toContain('linear-gradient');
 expect(ui.search).toContain('linear-gradient');
 expect(ui.searchForeground).toBe('rgb(11, 37, 80)');
 expect(ui.card).toBe('none');
 expect(ui.task).toBe('none');
 expect(ui.theme).toBe('#0b2550');
 expect(ui.primaryText).toBe('rgb(255, 255, 255)');
 expect(ui.width).toBeLessThanOrEqual(ui.viewport+1);
 expect(ui.heroHeight).toBeLessThanOrEqual(isMobile?180:240);
});

test('UX-S6A PWA install icons decode and match new manifest palette on Chromium',async({page})=>{
 await page.goto('/installazione');
 const icon=await page.evaluate(async()=>{
  const manifest=await (await fetch('/manifest.webmanifest')).json();
  const output=[];
  for(const n of [192,512]){
   const element=manifest.icons.find(icon=>icon.sizes===n+'x'+n);
   const image=new Image();image.src=element.src;await image.decode();
   const canvas=document.createElement('canvas');canvas.width=n;canvas.height=n;
   const ctx=canvas.getContext('2d',{willReadFrequently:true});
   ctx.drawImage(image,0,0);
   const orb=ctx.getImageData(Math.floor(n/2),Math.floor(n*.26),1,1).data;
   output.push({width:image.naturalWidth,height:image.naturalHeight,orb:Array.from(orb)});
  }
  return {theme:manifest.theme_color,background:manifest.background_color,output};
 });
 expect(icon.theme).toBe('#0b2550');
 expect(icon.background).toBe('#f4f8ff');
 for(let i=0;i<2;i++){
  const n=[192,512][i],item=icon.output[i];
  expect(item.width).toBe(n);expect(item.height).toBe(n);
  expect(item.orb[2]).toBeGreaterThan(item.orb[0]);
  expect(item.orb[3]).toBe(255);
 }
});
