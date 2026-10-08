import {libraryCopy,installExperience,pushExperience,actionConfirmation} from './experience.js';
const root=document.querySelector('#root');
const toast=document.querySelector('#toast');
const dialog=document.querySelector('#lumen-dialog');
const state={user:null,csrf:null,install:null,koha:false,kohaWrite:false,kohaLoans:false,kohaReturns:false,oidcEnabled:false,oidcOnly:false};
const retryKeys=new Map();
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const t=s=>esc(s);
const bookIcon='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 7c-3-3-7-3-10-2v14c3-1 7-1 10 2m0-14c3-3 7-3 10-2v14c-3-1-7-1-10 2M12 7v14"/></svg>';
const ic=name=>{
  const paths={
    home:'<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V10Z"/><path d="M9 21v-7h6v7"/>',
    search:'<circle cx="10.8" cy="10.8" r="7.3"/><path d="m16 16 5 5"/>',
    book:'<path d="M4 4h14a2 2 0 0 1 2 2v15H6a2 2 0 0 1-2-2V4Z"/><path d="M4 17h16"/>',
    bell:'<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>',
    user:'<circle cx="12" cy="8" r="4"/><path d="M4 21c1-8 15-8 16 0"/>',
    spark:'<path d="m12 2 2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5Z"/>',
    clock:'<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>',
    cap:'<path d="m2 9 10-5 10 5-10 5L2 9Zm4 3v6c4 3 8 3 12 0v-6M22 9v7"/>',
    check:'<path d="M4 12 10 18 20 6"/>',
    settings:'<circle cx="12" cy="12" r="3"/><path d="m8 2 1 3h6l1-3m4 6-3 1v6l3 1m-4 6-1-3H9l-1 3m-6-6 3-1V9L2 8"/>'
  };
  return '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+(paths[name]||paths.book)+'</svg>';
};
const badge=(label,kind='')=>'<span class="badge '+kind+'">'+t(label)+'</span>';
const moneyless=items=>!items?.length;
const empty=msg=>'<div class="empty">'+t(msg)+'</div>';
const humanDate=d=>d?new Intl.DateTimeFormat('it-IT',{day:'numeric',month:'short',year:'numeric'}).format(new Date(d)):'—';
const btn=(label,action,id='',extra='')=>'<button type="button" class="btn small '+extra+'" data-click="'+esc(action)+'" data-id="'+esc(id)+'">'+label+'</button>';
const routeLink=(route,label,active)=>{
  return '<a data-nav href="'+esc(route)+'" '+(active?'aria-current="page"':'')+'>'+label+'</a>';
};
async function api(path,method='GET',body) {
  const options={method,credentials:'same-origin',headers:{}};
  const signature=method!=='GET'?JSON.stringify([path,method,body??{}]):null;
  if(method!=='GET'){
    options.headers['Idempotency-Key']=retryKeys.get(signature)||crypto.randomUUID();
    retryKeys.set(signature,options.headers['Idempotency-Key']);
    options.headers['Content-Type']='application/json';
    if(state.csrf) options.headers['X-CSRF-Token']=state.csrf;
    options.body=JSON.stringify(body??{});
  }
  let r;
  try{r=await fetch(path,options);}
  catch{throw new Error('Servizio non raggiungibile. Riprova quando sei online.');}
  const data=await r.json();
  if(signature) retryKeys.delete(signature);
  if(!r.ok) throw new Error(data.error?.message||'Operazione non riuscita');
  return data;
}
function message(text,bad=false) {
  toast.textContent=text;toast.className='toast'+(bad?' error':'');toast.hidden=false;
  toast.setAttribute('role',bad?'alert':'status');
  toast.setAttribute('aria-live',bad?'assertive':'polite');
  clearTimeout(message.timer);message.timer=setTimeout(()=>toast.hidden=true,4700);
}
function navigate(to) {
  history.pushState({},'',to);
  render().then(()=>document.querySelector('#main')?.focus({preventScroll:true}));
  window.scrollTo({top:0,behavior:'instant'});
}
const installModel=()=>installExperience({
  standalone:matchMedia('(display-mode: standalone)').matches||navigator.standalone===true,
  canPrompt:!!state.install,userAgent:navigator.userAgent
});
async function confirmation(action,trigger){
  const cfg=actionConfirmation(action);
  if(!cfg)return true;
  if(!dialog?.showModal)return window.confirm(cfg.title+' '+cfg.detail);
  dialog.querySelector('#dialog-title').textContent=cfg.title;
  dialog.querySelector('#dialog-detail').textContent=cfg.detail;
  const yes=dialog.querySelector('#dialog-confirm');
  yes.textContent=cfg.confirm;yes.classList.toggle('danger-action',!!cfg.danger);
  dialog.returnValue='';
  return await new Promise(resolve=>{
    dialog.addEventListener('close',()=>{const accepted=dialog.returnValue==='confirm';if(trigger?.isConnected)trigger.focus();resolve(accepted);},{once:true});
    dialog.showModal();
  });
}
function isStaff(){return state.user?.role==='librarian';}
function isFaculty(){return state.user?.role==='faculty';}
function sectionTitle(title,intro=''){return '<div class="page-top"><h1>'+t(title)+'</h1><p class="muted">'+t(intro)+'</p></div>';}
function field(label,name,placeholder='',required=true,type='text'){
  return '<label>'+t(label)+'<input type="'+type+'" name="'+name+'" placeholder="'+esc(placeholder)+'" '+(required?'required':'')+'></label>';
}
function formSearch(value='') {return '<form class="searchbar" data-form="search"><label class="sr" for="catalog-search" style="position:absolute;left:-9999px">Ricerca catalogo</label><input id="catalog-search" name="query" value="'+esc(value)+'" placeholder="Titolo, autore, ISBN, materia…" aria-label="Cerca nel catalogo"><button class="btn gold" type="submit">'+ic('search')+' Cerca</button></form>';}
function header(){
  const path=location.pathname;
  const nav=[
    ['/',ic('home')+' Home'],['/catalogo',ic('search')+' Catalogo'],
    ...(state.koha?[['/koha',ic('book')+' Catalogo Koha']]:[]),
    ...(state.kohaWrite&&state.user?[['/koha/me',ic('clock')+' Le mie richieste Koha']]:[]),
    ...(state.kohaLoans&&state.user?[['/koha/loans',ic('book')+' Prestiti Koha']]:[]),
    ...(state.user?[['/me',ic('book')+' Prestiti']]:[]),
    ...(isFaculty()?[['/acquisti',ic('cap')+' Acquisti']]:[]),
    ...(isStaff()?[['/staff',ic('settings')+' Banco']]:[]),
    ...(state.user?[['/notifiche',ic('bell')+' Avvisi']]:[])
  ];
  const current=p=>path===p||(p!=='/'&&path.startsWith(p+'/'));
  const linkNav=nav.map(([p,label])=>routeLink(p,label,current(p))).join('');
  const account=state.user?routeLink('/impostazioni',ic('user')+' '+t(state.user.name.split(' ')[0]),current('/impostazioni')):routeLink('/accedi','Accedi',current('/accedi'));
  const logo='<a class="brand" data-nav href="/"><svg viewBox="0 0 40 40"><rect width="40" height="40" rx="10" fill="#10243a"/><path d="M8 15c6-1 10 1 12 4 2-3 6-5 12-4v15c-6-1-10 1-12 4-2-3-6-5-12-4Z" fill="none" stroke="#f7f5ef" stroke-width="2"/><circle cx="20" cy="10" r="4" fill="#d5a646"/></svg>LUMEN</a>';
  const bottom=nav.filter(([p])=>['/','/catalogo','/me','/notifiche','/staff','/acquisti'].includes(p)).slice(0,5).map(([p,label])=>routeLink(p,label,current(p))).join('');
  return '<header class="site-header shell">'+logo+'<nav class="nav" aria-label="Navigazione principale">'+linkNav+account+'</nav></header><nav class="bottom-nav" aria-label="Navigazione mobile">'+bottom+'</nav>';
}
function footer(){return '<footer class="shell footer"><div class="row"><span><strong>LUMEN</strong> · Il tuo spazio per la conoscenza</span><span>Servizi bibliotecari · <a data-nav href="/installazione">Installa app</a> · <a data-nav href="/impostazioni">Impostazioni</a></span></div></footer>';}
function bookCard(b){
  const availability=b.available>0?badge(b.available+' disponibil'+(b.available===1?'e':'i')):badge('In attesa','warn');
  return '<article class="card book-card"><div class="cover">'+bookIcon+'</div><div style="flex:1;min-width:0"><h3><a data-nav href="/catalogo/'+esc(b.id)+'">'+t(b.title)+'</a></h3><p class="muted" style="margin-bottom:9px">'+t(b.author)+'<br><small>'+t(b.subject)+' · '+t(b.isbn||'ISBN non inserito')+'</small></p><div class="row">'+availability+'<a class="btn small alt" data-nav href="/catalogo/'+esc(b.id)+'">Dettagli →</a></div></div></article>';
}
async function home(){
  const books=await api('/api/books');
  return '<section class="hero"><div><p class="eyebrow">La tua biblioteca, ovunque</p><h1>Ogni libro apre una possibilità.</h1><p>'+t(libraryCopy.services)+'</p>'+formSearch()+'<p class="fine" style="margin-top:16px"><a data-nav href="/installazione" style="color:#f0d68d;text-decoration:underline">Porta LUMEN sul tuo dispositivo →</a></p>'+'</div><div class="hero-art">'+bookIcon+'</div></section>'
  +'<section class="section"><div class="section-head"><h2>Un luogo, tanti servizi</h2></div><div class="grid">'
  +'<article class="card service-card">'+ic('search')+'<h3>Esplora il patrimonio</h3><p class="muted">Cerca per autore, titolo, ISBN o materia e controlla le copie disponibili.</p></article>'
  +'<article class="card service-card">'+ic('clock')+'<h3>Prenota senza attese</h3><p class="muted">Richiedi un volume e segui lo stato della coda dalla tua area personale.</p></article>'
  +'<article class="card service-card">'+ic('cap')+'<h3>Sostieni la ricerca</h3><p class="muted">I docenti possono proporre nuovi acquisti e seguirne l'+'&#39;'+'iter.</p></article></div></section>'
  +'<section class="section"><div class="section-head"><h2>Dal catalogo</h2><a class="btn alt small" data-nav href="/catalogo">Vedi tutti →</a></div><div class="grid">'+(books.length?books.slice(0,3).map(bookCard).join(''):empty('Il catalogo sarà disponibile a breve.'))+'</div></section>'
  +'<section class="section"><div class="card"><h2>La biblioteca e LUMEN</h2><p>'+t(libraryCopy.context)+'</p><p>LUMEN è il punto di accesso digitale ai servizi bibliotecari: non sostituisce i sistemi gestionali della biblioteca e mantiene separati gli esiti delle integrazioni esterne.</p><p class="fine">Sedi, orari, contatti e condizioni di prestito saranno indicati dalla biblioteca prima della pubblicazione ufficiale.</p></div></section>';
}
async function catalog(){
  const q=new URLSearchParams(location.search).get('q')||'';
  const books=await api('/api/books?q='+encodeURIComponent(q));
  return sectionTitle('Catalogo','Trova un volume per titolo, autore, ISBN o soggetto.')
  +formSearch(q)+'<section class="section"><div class="section-head"><h2>'+books.length+' titoli'+(q?' per “'+t(q)+'”':'')+'</h2></div><div class="grid">'+(books.length?books.map(bookCard).join(''):empty('Nessun titolo trovato. Prova una ricerca diversa.'))+'</div>'+(books.length===120?'<p class="fine">Vengono mostrati i primi 120 risultati.</p>':'')+'</section>';
}
async function bookDetail(){
  const id=location.pathname.split('/')[2];
  const b=await api('/api/books/'+encodeURIComponent(id));
  return '<div class="page-top"><a class="fine" data-nav href="/catalogo">← Torna al catalogo</a></div>'
  +'<div class="layout section"><article class="card"><div class="book-card"><div class="cover" style="flex-basis:120px;height:160px">'+bookIcon+'</div><div><p class="eyebrow">Scheda bibliografica</p><h1 style="font-size:2rem">'+t(b.title)+'</h1><p>'+t(b.author)+'</p><p class="muted">'+t(b.subject)+' · ISBN '+t(b.isbn||'non presente')+'</p>'+badge(b.available>0?b.available+' copie disponibili':'Disponibilità in attesa',b.available?'':'warn')+'</div></div><hr class="divider"><p>'+t(b.description||'Descrizione non disponibile.')+'</p></article>'
  +'<aside class="card"><h2>Richiedi il volume</h2><p class="muted">Copie totali: '+b.copies+' · In prestito: '+b.borrowed+' · Prenotate: '+b.reserved+' · In coda: '+b.queue+'</p>'
  +(state.user?'<form data-form="hold"><input type="hidden" name="bookId" value="'+esc(b.id)+'"><button class="btn" type="submit">Richiedi / prenota</button></form>':'<a class="btn" data-nav href="/accedi">Accedi per prenotare</a>')
  +'<p class="fine" style="margin-top:14px">Le assegnazioni rispettano la disponibilità e l'+'&#39;'+'ordine delle richieste. Il ritiro si perfeziona al banco bibliotecario.</p></aside></div>';
}
async function myLibrary(){
  const [holds,loans]=await Promise.all([api('/api/holds'),api('/api/loans')]);
  const active=loans.filter(l=>l.status==='active'),pending=holds.filter(h=>['queued','ready'].includes(h.status));
  return sectionTitle('La mia biblioteca','Prestiti, prenotazioni e scadenze sempre sotto controllo.')
  +'<div class="grid section"><div class="card"><p class="label">Prestiti attivi</p><p class="metric">'+active.length+'</p></div><div class="card"><p class="label">Prenotazioni aperte</p><p class="metric">'+pending.length+'</p></div><div class="card"><p class="label">Prossima scadenza</p><p class="metric" style="font-size:1.35rem">'+(active.length?humanDate(active.map(l=>l.due_at).sort()[0]):'Nessuna')+'</p></div></div>'
  +'<section class="section"><h2>Prestiti</h2><div class="list">'+(loans.length?loans.map(l=>'<article class="card row space"><div><h3>'+t(l.title)+'</h3><p class="fine">Scadenza '+humanDate(l.due_at)+' · '+t(l.barcode)+'</p>'+badge(l.status==='active'?'Attivo':'Restituito',l.status==='active'?'':'gray')+'</div>'+(l.status==='active'&&l.renewal_count<1?btn('Rinnova','renew',l.id,'alt'):'')+'</article>').join(''):empty('Non hai ancora prestiti.'))+'</div></section>'
  +'<section class="section"><h2>Prenotazioni</h2><div class="list">'+(holds.length?holds.map(h=>'<article class="card row space"><div><h3>'+t(h.title)+'</h3><p class="fine">Richiesta '+humanDate(h.created_at)+'</p>'+badge({queued:'In coda',ready:'Pronto al ritiro',fulfilled:'Soddisfatta',cancelled:'Annullata'}[h.status]||h.status,h.status==='queued'?'warn':h.status==='cancelled'?'gray':'')+'</div>'+(['queued','ready'].includes(h.status)?btn('Annulla','cancel-hold',h.id,'ghost'):'')+'</article>').join(''):empty('Nessuna prenotazione.'))+'</div></section>';
}
async function suggestions(){
  if(!isFaculty()) return forbidden();
  const rows=await api('/api/suggestions');
  return sectionTitle('Proposte d’acquisto','Suggerisci un titolo utile per didattica e ricerca.')
  +'<div class="layout section"><div class="card"><h2>Nuova richiesta</h2><form class="form" data-form="suggest">'+field('Titolo','title','Titolo del libro')+field('Autore','author','Autore o curatore')+field('ISBN','isbn','Facoltativo',false)+'<label>Motivazione didattica o di ricerca<textarea name="reason" required maxlength="500" placeholder="Perché la biblioteca dovrebbe acquisirlo?"></textarea></label><button class="btn" type="submit">Invia proposta</button></form></div>'
  +'<div><h2>Le mie proposte</h2><div class="list">'+(rows.length?rows.map(r=>'<article class="card"><h3>'+t(r.title)+'</h3><p class="fine">'+t(r.author)+' · '+humanDate(r.created_at)+'</p>'+badge(r.status,r.status==='rejected'?'warn':'')+'</article>').join(''):empty('Ancora nessuna proposta.'))+'</div></div></div>';
}
async function notifications(){
  const rows=await api('/api/notifications');
  return sectionTitle('Comunicazioni','Aggiornamenti su prestiti, richieste e servizi della biblioteca.')
  +'<div class="list section">'+(rows.length?rows.map(n=>'<article class="card row space"><div><h3>'+t(n.title)+'</h3><p>'+t(n.body)+'</p><p class="fine">'+humanDate(n.created_at)+' · '+(n.read_at?'Letta':'Da leggere')+'</p></div>'+(n.read_at?'':btn('Segna come letta','read',n.id,'alt'))+'</article>').join(''):empty('Non hai notifiche.'))+'</div>';
}
async function staff(){
  if(!isStaff())return forbidden();
  const [data,users,books,suggestions]=await Promise.all([api('/api/staff/stats'),api('/api/staff/users'),api('/api/books'),api('/api/suggestions')]);
  const options=arr=>arr.map(x=>'<option value="'+esc(x.id)+'">'+t(x.name||x.title)+' ('+t(x.email||x.author)+')</option>').join('');
  const oidcMapping=state.oidcEnabled?'<section class="section card"><h2>Collega identità istituzionale</h2><p class="fine">Inserisci il subject OIDC ufficialmente verificato dall’amministratore IdP. Non usare l’indirizzo email come subject. La modifica di una associazione esistente è bloccata.</p><form class="form" data-form="oidc-bind"><label>Account LUMEN<select name="userId" required>'+options(users.filter(x=>x.active))+'</select></label>'+field('OIDC subject (sub)','subject','ID stabile IdP',true)+'<button class="btn small" type="submit">Associa subject</button></form></section>':'';
  const kohaMapping=state.kohaWrite?'<section class="section card"><h2>Collega un account Koha</h2><p class="muted">L’email dell’account deve corrispondere a quella restituita da Koha. Nessun collegamento automatico.</p><form class="form" data-form="koha-bind"><label>Account LUMEN<select name="userId" required>'+options(users.filter(x=>x.active))+'</select></label>'+field('Identificativo patron Koha','patronId','ID numerico',true,'number')+'<button type="submit" class="btn">Verifica e collega patron</button></form><p><a data-nav href="/staff/koha-pending">Verifica operazioni Koha in sospeso →</a></p></section>':'';
  const kohaReturnDesk=state.kohaReturns?'<section class="section card"><h2>Restituzioni Koha</h2><p class="fine">La restituzione si registra nella postazione Koha, non in LUMEN. Qui puoi preparare e verificare il rientro.</p><a class="btn alt small" data-nav href="/staff/koha-returns">Apri verifiche dei rientri →</a></section>':'';
  const kohaLoanDesk=state.kohaLoans?'<section class="section card"><h2>Banco prestiti Koha</h2><p class="muted">Consegna copia soltanto dopo verifica fisica dell’articolo. Nessuna forzatura delle regole di circolazione Koha.</p><form class="form" data-form="koha-checkout"><label>Patron associato a Koha<select name="userId" required>'+options(users.filter(x=>x.active))+'</select></label>'+field('ID copia Koha (item_id)','itemId','Identificativo numerico',true,'number')+'<button class="btn" type="submit">Consegna via Koha</button></form><p><a data-nav href="/staff/koha-loans-pending">Riconcilia prestiti e rinnovi incerti →</a></p></section>':'';
  return sectionTitle('Banco bibliotecario','Una dashboard operativa per circolazione, acquisti e comunicazioni.')+oidcMapping+kohaMapping+kohaLoanDesk+kohaReturnDesk
  +'<div class="grid section">'+[['Titoli',data.books],['Copie',data.copies],['Prestiti attivi',data.loans],['Utenti',data.users],['In coda',data.queued],['Acquisti da valutare',data.pending]].map(([k,v])=>'<div class="card"><p class="label">'+t(k)+'</p><p class="metric">'+v+'</p></div>').join('')+'</div>'
  +'<div class="layout section"><div class="card"><h2>Registra prestito</h2><form class="form" data-form="checkout"><label>Utente<select name="userId" required>'+options(users.filter(x=>x.active))+'</select></label><label>Libro<select name="bookId" required>'+options(books)+'</select></label><button class="btn" type="submit">Consegna volume</button></form></div>'
  +'<div class="card"><h2>Copia e catalogo</h2><form class="form" data-form="book">'+field('Titolo','title')+field('Autore','author')+field('ISBN','isbn','ISBN',false)+field('Materia','subject','Materia',false)+field('Scaffale','shelf','Collocazione',false)+field('Numero copie','copies','1',true,'number')+'<button class="btn" type="submit">Registra titolo e copie</button></form></div></div>'
  +'<section class="section"><h2>Prestiti da gestire</h2><div class="card table-wrap"><table class="table"><thead><tr><th>Titolo</th><th>Utente</th><th>Scadenza</th><th>Operazione</th></tr></thead><tbody>'+data.activeLoans.map(x=>'<tr><td>'+t(x.title)+'</td><td>'+t(x.patron)+'</td><td>'+humanDate(x.due_at)+'</td><td>'+btn('Restituisci','return',x.id,'alt')+'</td></tr>').join('')+'</tbody></table>'+(moneyless(data.activeLoans)?empty('Nessun prestito attivo'):'')+'</div></section>'
  +'<section class="section"><h2>Ritiri pronti</h2><div class="grid">'+(data.readyHolds.length?data.readyHolds.map(x=>'<div class="card"><h3>'+t(x.title)+'</h3><p>'+t(x.patron)+'</p>'+btn('Consegna copia','issue-ready',x.book_id+'|'+x.user_id,'alt')+'</div>').join(''):empty('Nessun ritiro in attesa.'))+'</div></section>'
  +'<section class="section"><h2>Proposte d’acquisto</h2><div class="list">'+(suggestions.length?suggestions.map(x=>'<div class="card row space"><div><h3>'+t(x.title)+'</h3><p class="fine">'+t(x.author)+' · Richiesta da '+t(x.requester)+'</p><p>'+t(x.reason)+'</p>'+badge(x.status)+'</div><div class="row">'+(x.status==='pending'?btn('Approva','approve',x.id,'alt')+btn('Rifiuta','reject',x.id,'ghost'):'')+(x.status==='approved'?btn('Ordinato','ordered',x.id,'alt'):'')+'</div></div>').join(''):empty('Nessuna proposta.'))+'</div></section>'
  +'<section class="section"><h2>Account abilitati</h2><div class="card table-wrap"><table class="table"><thead><tr><th>Nome</th><th>Profilo</th><th>Stato</th><th>Operazione</th></tr></thead><tbody>'+users.map(x=>'<tr><td>'+t(x.name)+'<br><span class="fine">'+t(x.email)+'</span></td><td>'+t(x.role)+'</td><td>'+badge(x.active?'Attivo':'Disattivato',x.active?'':'gray')+'</td><td>'+(x.active&&x.id!==state.user.id?btn('Disattiva','disable',x.id,'ghost'):'')+'</td></tr>').join('')+'</tbody></table></div></section>'
  +'<div class="layout section"><div class="card"><h2>Nuovo utente</h2><form class="form" data-form="user">'+field('Nome e cognome','name')+field('Email istituzionale','email','utente@istituzione.it',true,'email')+'<label>Profilo<select name="role"><option value="student">Studente</option><option value="faculty">Docente</option><option value="librarian">Bibliotecario</option></select></label>'+field('Password temporanea (12+ caratteri)','password','Minimo 12 caratteri',true,'password')+'<button class="btn" type="submit">Crea account</button></form></div>'
  +'<div class="card"><h2>Avviso collettivo</h2><form class="form" data-form="broadcast"><label>Destinatari<select name="role"><option value="all">Tutti</option><option value="student">Studenti</option><option value="faculty">Docenti</option><option value="librarian">Bibliotecari</option></select></label>'+field('Oggetto','title')+'<label>Testo<textarea name="body" required maxlength="600"></textarea></label><button class="btn" type="submit">Invia alla inbox</button></form></div></div>';
}
function forbidden(){return sectionTitle('Accesso non consentito','Il tuo profilo non dispone delle autorizzazioni richieste.')+'<a class="btn" data-nav href="/">Torna alla home</a>';}
function login(){
  if(state.user)return sectionTitle('Sei già connesso','Accedi alle tue funzioni dal menu.')+'<a data-nav class="btn" href="/me">La mia biblioteca</a>';
  return '<div class="layout section"><div class="card"><p class="eyebrow">Accesso riservato</p><h1 style="font-size:2.5rem">Bentornato su LUMEN.</h1><p class="muted">Accedi con l’identità istituzionale o con le credenziali autorizzate dalla biblioteca.</p>'+(state.oidcEnabled?'<a class="btn" href="/api/auth/oidc/start">Accedi con Single Sign-On</a>':'')+(new URLSearchParams(location.search).has('auth_error')?'<p class="alert">Accesso istituzionale non completato. Contatta la biblioteca per verificare l’associazione dell’account.</p>':'')+(state.oidcOnly?'':'<form class="form" data-form="login">'+field('Email','email','nome@universita.it',true,'email')+field('Password','password','La tua password',true,'password')+'<button class="btn" type="submit">Accedi</button></form>')+'</div><div class="card"><h2>Tre profili, una piattaforma</h2><p>'+t(libraryCopy.roles.student)+'</p><p>'+t(libraryCopy.roles.faculty)+'</p><p>'+t(libraryCopy.roles.librarian)+'</p><p class="fine">Nessuna registrazione pubblica: gli utenti vengono abilitati dalla biblioteca.</p></div></div>';
}
function installPage(){
  const x=installModel();
  const button=x.canInstall?'<button class="btn" data-click="install" type="button">Installa LUMEN</button>':'';
  return sectionTitle('LUMEN sul tuo dispositivo','La stessa biblioteca, dal browser o come app sulla schermata Home.')
    +'<section class="section install-panel"><div><p class="eyebrow">PWA · LUMEN</p><h2>'+t(x.title)+'</h2><p>'+t(x.detail)+'</p></div><div class="actions">'+button
    +'<a class="btn ghost" data-nav href="/catalogo">Vai al catalogo</a></div></section>'
    +'<div class="grid two section"><article class="card"><h3>Android · Chrome</h3><p>Apri LUMEN su HTTPS, poi usa il comando Installa app oppure Aggiungi alla schermata Home dal menu Chrome. L’app avrà un’icona nel launcher.</p></article>'
    +'<article class="card"><h3>Windows · Chrome o Edge</h3><p>Apri il menu del browser e seleziona Installa LUMEN, quando disponibile. Si aprirà in una finestra dedicata, senza installare un programma nativo.</p></article></div>'
    +'<p class="fine">L’installazione dipende dalle capacità e dalle condizioni del browser. Non è un file APK o un’app di Play Store. Serve HTTPS per l’installazione sul dispositivo.</p>';
}
async function settings(){
  if(!state.user)return login();
  const cfg=await api('/api/push-config');
  const supported='serviceWorker' in navigator&&'PushManager' in window&&'Notification' in window;
  let subscribed=false,needsReset=false;
  if(cfg.enabled&&supported&&Notification.permission==='granted'){
    try{
      const reg=await navigator.serviceWorker.getRegistration('/');
      const subscription=await reg?.pushManager?.getSubscription();
      if(subscription){
        const status=await api('/api/push-subscription?endpoint='+encodeURIComponent(subscription.endpoint));
        subscribed=status.owned===true;
        needsReset=!subscribed;
      }
    }catch{} // Missing ownership proof must never be displayed as enabled.
  }
  const push=pushExperience({serverEnabled:cfg.enabled,secure:window.isSecureContext,
    supported,permission:supported?Notification.permission:'default',subscribed,needsReset});
  return sectionTitle('Impostazioni','Il tuo account e le preferenze di comunicazione.')
    +'<div class="layout section"><div class="card"><h2>Profilo</h2><p><strong>'+t(state.user.name)+'</strong><br>'+t(state.user.email)+'<br>'+badge({student:'Studente',faculty:'Docente',librarian:'Bibliotecario'}[state.user.role])+'</p>'+btn('Esci','logout','','ghost')+'<hr class="divider"><form class="form" data-form="change-password"><h3>Cambia password</h3>'+field('Password attuale','oldPassword','',true,'password')+field('Nuova password (12+ caratteri)','newPassword','',true,'password')+'<button class="btn small" type="submit">Aggiorna password</button></form></div>'
    +'<div class="card"><h2>Notifiche</h2><div class="pref-status" data-status="'+esc(push.status)+'"><strong>'+t(push.title)+'</strong><p>'+t(push.detail)+'</p></div>'
    +(push.action?btn(push.action==='enable-push'?'Attiva su questo dispositivo':push.action==='reset-push'?'Ripristina questo dispositivo':'Disattiva su questo dispositivo',push.action,'','alt'):'')
    +'<p class="fine">Gli avvisi restano nella <a data-nav href="/notifiche"><u>casella comunicazioni</u></a>, indipendentemente dai permessi del browser.</p>'
    +'<hr class="divider"><h3>Installa LUMEN</h3><p class="muted">'+t(installModel().detail)+'</p><a class="btn alt small" data-nav href="/installazione">Istruzioni di installazione →</a></div></div>';
}

async function kohaCatalog(){
  const q=new URLSearchParams(location.search).get('q')||'';
  const result=await api('/api/integrations/koha/books?q='+encodeURIComponent(q));
  const items=result.items||[];
  const cards=items.map(b=>'<article class="card book-card"><div class="cover">'+bookIcon+'</div><div><h3><a data-nav href="/koha/'+esc(b.id.slice(5))+'">'+t(b.title)+'</a></h3><p class="fine">'+t(b.author)+' · '+t(b.isbn||'ISBN non presente')+'</p>'+badge(state.kohaWrite?'Koha · prenotazioni pilota':'Catalogo Koha · sola lettura','gray')+'</div></article>').join('');
  return sectionTitle('Catalogo Koha',state.kohaWrite?'Fonte Koha: ricerca e prenotazioni per utenti verificati.':'Fonte Koha in sola lettura.')
    +'<form class="searchbar" data-form="koha-search"><input name="query" placeholder="Titolo, autore o ISBN" value="'+esc(q)+'" aria-label="Cerca su Koha"><button class="btn gold" type="submit">Cerca</button></form>'
    +'<section class="section"><div class="grid">'+(cards||empty('Nessun risultato da Koha.'))+'</div>'+(result.truncated?'<p class="fine">Sono disponibili altri record: la paginazione avanzata sarà introdotta nel gate K2.</p>':'')+'</section>';
}
async function kohaDetail(){
  const id=location.pathname.split('/')[2];
  const b=await api('/api/integrations/koha/books/'+encodeURIComponent(id));
  let action='';
  if(state.kohaWrite){
    if(!state.user)action='<a class="btn" data-nav href="/accedi">Accedi per prenotare</a>';
    else{
      const binding=await api('/api/integrations/koha/my/binding');
      action=binding.mapped?'<form class="form" data-form="koha-hold"><input name="biblioId" value="'+esc(id)+'" type="hidden"><p class="fine">Prenotazione gestita direttamente da Koha. La disponibilità e la posizione in coda sono determinate da Koha.</p><button class="btn" type="submit">Richiedi prenotazione Koha</button></form>'
        :'<p class="alert">Account Koha non associato. Chiedi alla biblioteca di verificare e collegare la tua identità.</p>';
    }
  }
  return '<div class="page-top"><a data-nav href="/koha">← Torna a Koha</a><h1>'+t(b.title)+'</h1><p>'+t(b.author)+'</p><p>'+t(b.isbn)+'</p></div>'
    +'<div class="card"><h2>Copie registrate: '+Number(b.copies)+'</h2><p class="alert">La disponibilità al prestito deve essere verificata su Koha; LUMEN non calcola le copie disponibili di questa collezione.</p>'+action
    +'<div class="list">'+(b.items||[]).map(c=>'<div class="row"><span>'+t(c.barcode||'Copia')+'</span><span class="fine">'+t(c.shelf)+'</span></div>').join('')+'</div></div>';
}
async function kohaMyHolds(){
  if(!state.user)return login();
  const binding=await api('/api/integrations/koha/my/binding');
  if(!binding.mapped)return sectionTitle('Le mie prenotazioni Koha','Identità Koha non collegata.')+'<p class="alert">Contatta il bibliotecario per associare il tuo account.</p>';
  const result=await api('/api/integrations/koha/my/holds');
  return sectionTitle('Le mie prenotazioni Koha','Dati letti direttamente dal gestionale Koha, senza duplicazione locale.')
    +'<div class="list section">'+(result.holds.length?result.holds.map(h=>'<article class="card"><h3>Prenotazione #'+Number(h.hold_id)+'</h3><p>Titolo Koha #'+Number(h.biblio_id)+' · Stato: '+t(h.status||'da Koha')+' · Posizione: '+t(h.priority??'—')+'</p><p class="fine">Le condizioni di ritiro e le modifiche sono governate dalla biblioteca.</p></article>').join(''):empty('Non risultano prenotazioni su Koha.'))+'</div>';
}
async function kohaPending(){
  if(!isStaff())return forbidden();
  const pending=await api('/api/staff/koha/pending');
  return sectionTitle('Operazioni Koha da riconciliare','L’esito remoto può essere stato registrato nonostante un timeout. Nessun retry automatico.')
    +'<div class="list section">'+(pending.length?pending.map(x=>'<article class="card"><h3>Record Koha '+Number(x.biblio_id)+'</h3><p class="fine">Patron #'+Number(x.patron_id)+' · Stato: '+t(x.state)+' · Errore: '+t(x.error_code||'non determinato')+'</p><p>Verifica il record su Koha, poi inserisci il suo identificativo autentico.</p><form class="form" data-form="koha-reconcile"><input type="hidden" name="attemptId" value="'+esc(x.id)+'">'+field('ID prenotazione Koha','holdId','ID confermato',true,'number')+'<button class="btn small" type="submit">Verifica e riconcilia</button></form></article>').join(''):empty('Nessuna operazione incerta.'))+'</div>';
}

async function kohaMyLoans(){
  if(!state.user)return login();
  const binding=await api('/api/integrations/koha/my/binding');
  if(!binding.mapped)return sectionTitle('Prestiti Koha','Identità non collegata')+'<p class="alert">Chiedi al bibliotecario di collegare il tuo account Koha.</p>';
  const list=await api('/api/integrations/koha/my/loans');
  return sectionTitle('Prestiti Koha','Dati letti direttamente da Koha. Il rinnovo rispetta le regole bibliotecarie.')
    +'<div class="list section">'+(list.loans.length?list.loans.map(x=>'<article class="card row space"><div><h3>Prestito #'+Number(x.checkout_id)+'</h3><p class="fine">Copia #'+Number(x.item_id)+' · Scadenza '+t(x.due_date||'non disponibile')+' · Rinnovi '+Number(x.renewals_count)+'</p>'
    +badge(x.checkin_date?'Restituito':'In prestito',x.checkin_date?'gray':'')+'</div>'+(x.checkin_date?'':'<form data-form="koha-renew"><input type="hidden" name="checkoutId" value="'+Number(x.checkout_id)+'"><button class="btn alt small" type="submit">Chiedi rinnovo Koha</button></form>')+'</article>').join(''):empty('Nessun prestito Koha attivo.'))+'</div>';
}
async function kohaLoanPending(){
  if(!isStaff())return forbidden();
  const pending=await api('/api/staff/koha/loans-pending');
  return sectionTitle('Prestiti Koha da verificare','Non ripetere i POST con esito incerto: verifica prima la ricevuta nel gestionale.')
    +'<div class="list section">'+(pending.length?pending.map(x=>'<article class="card"><h3>'+t(x.kind==='renew'?'Rinnovo':'Prestito')+' per patron #'+Number(x.patron_id)+'</h3><p class="fine">Item #'+t(x.item_id||'da verificare')+' · Stato '+t(x.state)+' · '+t(x.error_code||'nessun codice')+'</p>'
    +'<form data-form="koha-loan-reconcile" class="form"><input type="hidden" name="attemptId" value="'+esc(x.id)+'">'+field('ID prestito Koha accertato','checkoutId','ID verificato su Koha',true,'number')+'<button type="submit" class="btn small">Verifica ricevuta</button></form></article>').join(''):empty('Nessuna operazione da verificare.'))+'</div>';
}

async function kohaReturnsDesk(){
  if(!isStaff())return forbidden();
  const tickets=await api('/api/staff/koha/returns');
  return sectionTitle('Verifica restituzioni Koha','LUMEN non registra il rientro al posto di Koha: conferma soltanto una restituzione già contabilizzata dal gestionale.')
    +'<section class="section card"><h2>Prepara verifica</h2><p>Identifica il prestito Koha e verifica la restituzione fisica della copia. Usa la procedura ufficiale Koha per registrare il rientro.</p>'
    +'<form data-form="koha-return-prepare" class="form">'+field('ID prestito Koha','checkoutId','Identificativo numerico',true,'number')
    +'<button class="btn" type="submit">Prepara verifica rientro</button></form></section>'
    +'<section class="section"><h2>Rientri in attesa di verifica</h2><div class="list">'
    +(tickets.length?tickets.map(x=>'<article class="card"><h3>Prestito #'+Number(x.checkoutId)+'</h3>'
    +'<p class="fine">Patron #'+Number(x.patronId)+' · Copia #'+Number(x.itemId)+' · Avviata il '+t(x.createdAt)+'</p>'
    +'<p>1. Registra fisicamente il check-in in Koha. 2. Premi Verifica per leggere una prova positiva dallo storico ufficiale.</p>'
    +'<form data-form="koha-return-verify"><input type="hidden" name="ticketId" value="'+esc(x.ticketId)+'">'
    +'<button class="btn small" type="submit">Verifica restituzione su Koha</button></form></article>').join('')
    :empty('Nessun rientro aperto.'))+'</div></section>';
}
async function view(){
  const path=location.pathname;
  if(path==='/')return home();
  if(path==='/installazione')return installPage();
  if(path==='/catalogo')return catalog();
  if(path==='/koha'&&state.koha)return kohaCatalog();
  if(path==='/koha/me'&&state.kohaWrite)return kohaMyHolds();
  if(path==='/koha/loans'&&state.kohaLoans)return kohaMyLoans();
  if(path==='/staff/koha-loans-pending'&&state.kohaLoans)return kohaLoanPending();
  if(path==='/staff/koha-returns'&&state.kohaReturns)return kohaReturnsDesk();
  if(path==='/staff/koha-pending'&&state.kohaWrite)return kohaPending();
  if(path.startsWith('/koha/')&&state.koha)return kohaDetail();
  if(path.startsWith('/catalogo/'))return bookDetail();
  if(path==='/accedi')return login();
  if(!state.user)return login();
  if(path==='/me'||path==='/me/prenotazioni')return myLibrary();
  if(path==='/acquisti')return suggestions();
  if(path==='/notifiche')return notifications();
  if(path==='/staff'||path.startsWith('/staff/'))return staff();
  if(path==='/impostazioni')return settings();
  return sectionTitle('Pagina non trovata','Controlla il percorso o torna al catalogo.');
}
async function render(){
  root.innerHTML=header()+'<main id="main" class="shell" tabindex="-1"><div class="empty">Caricamento…</div></main>'+footer();
  try{
    const markup=await view();
    root.innerHTML=header()+'<main id="main" class="shell" tabindex="-1">'+markup+'</main>'+footer();
    // Install buttons are state-derived, never shown when Chrome has no prompt.
    document.title='LUMEN · '+(location.pathname==='/'?'La tua biblioteca':location.pathname.split('/')[1]);
  }catch(e){
    root.innerHTML=header()+'<main id="main" class="shell" tabindex="-1">'+sectionTitle('Servizio temporaneamente non disponibile',e.message)+'<a data-nav class="btn" href="/">Torna alla home</a></main>'+footer();
  }
}
document.addEventListener('click',async event=>{
  const a=event.target.closest('a[data-nav]');
  if(a&&event.button===0&&!event.ctrlKey&&!event.metaKey&&!event.shiftKey){event.preventDefault();navigate(a.getAttribute('href'));return;}
  const b=event.target.closest('[data-click]');
  if(!b)return;
  const action=b.dataset.click,id=b.dataset.id;
  b.disabled=true;
  try{
    if(action==='logout'){
      // Server logout first revokes every push binding of this session.
      // Browser SW cleanup is only best effort and cannot block logout.
      await api('/api/logout','POST');state.user=null;state.csrf=null;
      try{await clearLocalPush();}catch{}
      navigate('/');message('Sessione terminata');return;
    }
    if(['cancel-hold','return','disable'].includes(action)){
      if(!await confirmation(action,b)){b.disabled=false;return;}
    }
    if(action==='cancel-hold')await api('/api/holds/'+encodeURIComponent(id)+'/cancel','POST');
    if(action==='renew')await api('/api/loans/'+encodeURIComponent(id)+'/renew','POST');
    if(action==='return')await api('/api/staff/return','POST',{loanId:id});
    if(action==='disable')await api('/api/staff/users/'+encodeURIComponent(id)+'/disable','POST');
    if(action==='issue-ready'){const [bookId,userId]=id.split('|');await api('/api/staff/checkout','POST',{bookId,userId});}
    if(['approve','reject','ordered'].includes(action))await api('/api/suggestions/'+encodeURIComponent(id)+'/review','POST',{status:{approve:'approved',reject:'rejected',ordered:'ordered'}[action]});
    if(action==='read')await api('/api/notifications/'+encodeURIComponent(id)+'/read','POST');
    if(action==='install'){
      if(state.install){
        const prompt=state.install;state.install=null;
        await prompt.prompt();
        const result=await prompt.userChoice;
        if(result?.outcome==='accepted')message('Installazione richiesta al browser');
        else message('Installazione annullata. Puoi usare il menu del browser.');
        await render();return;
      }
      navigate('/installazione');return;
    }
    if(action==='enable-push'){await enablePush();message('Notifiche attive su questo dispositivo');await render();return;}
    if(action==='disable-push'){await disablePush();message('Notifiche disattivate su questo dispositivo');await render();return;}
    if(action==='reset-push'){await clearLocalPush();message('Dispositivo ripristinato. Puoi attivare le notifiche per questo account.');await render();return;}
    message('Operazione completata');await render();
  }catch(e){message(e.message,true);b.disabled=false;}
});
document.addEventListener('submit',async event=>{
  const form=event.target.closest('[data-form]');if(!form)return;
  event.preventDefault();const action=form.dataset.form;
  const data=Object.fromEntries(new FormData(form));
  const submit=form.querySelector('button[type="submit"]');if(submit)submit.disabled=true;
  try{
    if(action==='search'){navigate('/catalogo?q='+encodeURIComponent(data.query||''));return;}
    if(action==='koha-search'){navigate('/koha?q='+encodeURIComponent(data.query||''));return;}
    if(action==='koha-return-prepare'){
      const ticket=await api('/api/staff/koha/returns/prepare','POST',data);
      message('Verifica predisposta per il prestito #'+ticket.checkoutId+'. Registra il rientro nel sistema Koha.');
      await render();return;
    }
    if(action==='koha-return-verify'){
      const ticket=await api('/api/staff/koha/returns/verify','POST',data);
      message('Rientro #'+ticket.checkoutId+' verificato con evidenza Koha.');
      await render();return;
    }
    if(action==='koha-renew'){
      const receipt=await api('/api/integrations/koha/my/renew','POST',data);
      message('Koha ha confermato il rinnovo #'+receipt.checkoutId);
      await render();return;
    }
    if(action==='koha-checkout'){
      const receipt=await api('/api/staff/koha/checkout','POST',data);
      message('Koha ha confermato il prestito #'+receipt.checkoutId);
      await render();return;
    }
    if(action==='koha-loan-reconcile'){
      const receipt=await api('/api/staff/koha/loans-reconcile','POST',data);
      message('Ricevuta prestito #'+receipt.checkoutId+' riconciliata');
      await render();return;
    }
    if(action==='koha-hold'){
      const receipt=await api('/api/integrations/koha/my/holds','POST',data);
      message('Koha ha confermato la prenotazione #'+receipt.holdId);
      navigate('/koha/me');
      return;
    }
    if(action==='koha-reconcile'){
      const receipt=await api('/api/staff/koha/reconcile','POST',data);
      message('Ricevuta Koha #'+receipt.holdId+' riconciliata');
      await render();return;
    }
    if(action==='oidc-bind'){
      await api('/api/staff/oidc/bind','POST',data);
      message('Subject istituzionale associato all’account');
      await render();return;
    }
    if(action==='koha-bind'){
      await api('/api/staff/koha/bind','POST',data);
      message('Identità Koha verificata e associata');
      await render();return;
    }
    if(action==='change-password'){await api('/api/change-password','POST',data);state.user=null;state.csrf=null;navigate('/accedi');message('Password aggiornata. Effettua nuovamente l’accesso.');return;}
    if(action==='login'){const r=await api('/api/login','POST',data);state.user=r.user;state.csrf=r.csrf;navigate(r.user.role==='librarian'?'/staff':'/me');message('Accesso effettuato');return;}
    if(action==='hold')await api('/api/holds','POST',data);
    if(action==='suggest')await api('/api/suggestions','POST',data);
    if(action==='book'){data.copies=Number(data.copies);await api('/api/staff/books','POST',data);}
    if(action==='user')await api('/api/staff/users','POST',data);
    if(action==='checkout')await api('/api/staff/checkout','POST',data);
    if(action==='broadcast')await api('/api/staff/broadcast','POST',data);
    message('Operazione registrata');await render();
  }catch(e){message(e.message,true);if(submit)submit.disabled=false;}
});
async function enablePush(){
  if(!window.isSecureContext||!('serviceWorker' in navigator)||!('PushManager' in window)||!('Notification' in window))
    throw new Error('Apri LUMEN in Chrome su HTTPS per abilitare le notifiche.');
  // The permission request MUST be made from the actual click gesture before
  // asynchronous network work, especially on mobile Chrome.
  const permission=Notification.permission==='granted'?'granted':await Notification.requestPermission();
  if(permission!=='granted')throw new Error('Permesso negato. Puoi cambiarlo nelle impostazioni del sito.');
  const config=await api('/api/push-config');
  if(!config.enabled)throw new Error('La biblioteca non ha ancora configurato gli avvisi di sistema.');
  const reg=await navigator.serviceWorker.ready;
  const base64=config.publicKey.replace(/-/g,'+').replace(/_/g,'/');
  const raw=atob(base64.padEnd(Math.ceil(base64.length/4)*4,'='));
  const key=Uint8Array.from(raw,c=>c.charCodeAt(0));
  const current=await reg.pushManager.getSubscription();
  const subscription=current||await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:key});
  await api('/api/push-subscription','POST',subscription.toJSON());
}
async function clearLocalPush(){
  if(!('serviceWorker' in navigator)||!('PushManager' in window))return;
  const reg=await navigator.serviceWorker.getRegistration('/');
  const subscription=await reg?.pushManager?.getSubscription();
  if(subscription&&!await subscription.unsubscribe())
    throw new Error('Il browser non ha potuto rimuovere la sottoscrizione. Riprova dalle impostazioni del sito.');
}
async function disablePush(){
  if(!('serviceWorker' in navigator)||!('PushManager' in window))return;
  const reg=await navigator.serviceWorker.getRegistration('/');
  const subscription=await reg?.pushManager?.getSubscription();
  if(!subscription)return;
  // Revoke authenticated delivery on server before resetting OS channel.
  await api('/api/push-subscription','DELETE',{endpoint:subscription.endpoint});
  await clearLocalPush();
}
window.addEventListener('popstate',render);
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();state.install=e;if(location.pathname==='/installazione')render();});
window.addEventListener('appinstalled',()=>{state.install=null;if(location.pathname==='/installazione')render();message('LUMEN installata sul dispositivo');});
if('serviceWorker' in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('/sw.js').catch(()=>{}));
(async()=>{try{const [m,c]=await Promise.all([api('/api/me'),api('/api/config')]);state.user=m.user;state.csrf=m.csrf;state.koha=!!c.koha?.configured;state.kohaWrite=!!c.koha?.holdsEnabled;state.kohaLoans=!!c.koha?.loansEnabled;state.kohaReturns=!!c.koha?.returnsEnabled;state.oidcEnabled=!!c.identity?.oidcEnabled;state.oidcOnly=!!c.identity?.oidcOnly;}catch(e){message(e.message,true);}await render();})();
