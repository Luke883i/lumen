// LUMEN presentation policy: pure, deterministic states. No browser globals.
export const libraryCopy=Object.freeze({
  title:'LUMEN · La tua biblioteca',
  promise:'Una porta semplice al patrimonio e ai servizi della tua biblioteca.',
  services:'Cerca nel catalogo, invia prenotazioni, consulta prestiti e segui gli avvisi.',
  context:'La biblioteca mette a disposizione catalogo, prestiti, prenotazioni e supporto alla didattica e alla ricerca. Sedi, orari e regole sono comunicati dalla biblioteca.',
  roles:Object.freeze({
    student:'Studente · Ricerca, prenotazioni, prestiti e avvisi.',
    faculty:'Docente · Ricerca, prestiti, avvisi e proposte di acquisto.',
    librarian:'Bibliotecario · Banco, catalogo, richieste e comunicazioni.'
  })
});
export function installExperience({standalone=false,canPrompt=false,userAgent='' }={}){
  if(standalone)return {status:'installed',title:'LUMEN è già installata',detail:'Aprila dalla schermata Home o dal menu delle app.',canInstall:false};
  if(canPrompt)return {status:'ready',title:'Installa LUMEN',detail:'Apri LUMEN come app, senza cambiare la tua esperienza di biblioteca.',canInstall:true};
  const ua=String(userAgent||'');
  if(/iPad|iPhone|iPod/i.test(ua))return {status:'manual_ios',title:'Aggiungi LUMEN alla schermata Home',detail:'In Safari, apri Condividi e scegli “Aggiungi alla schermata Home”.',canInstall:false};
  if(/Android/i.test(ua))return {status:'manual_android',title:'Aggiungi LUMEN su Android',detail:'Nel menu di Chrome, scegli “Installa app” oppure “Aggiungi a schermata Home”, quando disponibile.',canInstall:false};
  return {status:'manual_desktop',title:'Installa LUMEN sul computer',detail:'Nel menu di Chrome o Edge cerca “Installa LUMEN” o “Installa questa pagina come app”, quando disponibile.',canInstall:false};
}
export function pushExperience({serverEnabled=false,secure=false,supported=false,permission='default',subscribed=false,needsReset=false}={}){
  if(!serverEnabled)return {status:'server_unconfigured',title:'Avvisi nell’app',detail:'La tua biblioteca non ha ancora attivato le notifiche di sistema. Gli avvisi restano consultabili nella tua area.',action:null};
  if(!secure||!supported)return {status:'unsupported',title:'Notifiche di sistema non disponibili',detail:'Per gli avvisi di sistema apri LUMEN in un browser compatibile su HTTPS. La tua casella avvisi rimane disponibile.',action:null};
  if(permission==='denied')return {status:'denied',title:'Notifiche bloccate dal browser',detail:'Puoi modificare il permesso nelle impostazioni del sito di Chrome. Continuerai a ricevere gli avvisi nell’app.',action:null};
  if(needsReset)return {status:'device_account_mismatch',title:'Dispositivo associato a un’altra sessione',detail:'Questa sottoscrizione non appartiene al tuo account attuale. Ripristinala sul dispositivo prima di attivare nuovi avvisi. La casella comunicazioni resta disponibile.',action:'reset-push'};
  if(permission==='granted'&&subscribed)return {status:'subscribed',title:'Notifiche attive su questo dispositivo',detail:'Puoi disattivarle qui senza perdere gli avvisi nella tua casella.',action:'disable-push'};
  return {status:permission==='granted'?'granted':'not_requested',title:'Ricevi gli avvisi anche fuori da LUMEN',detail:'Scegli tu se ricevere notifiche di sistema per gli aggiornamenti della biblioteca. Il consenso è facoltativo.',action:'enable-push'};
}
export function actionConfirmation(action){
  const copy={
    disable:{title:'Disabilitare l’account?',detail:'L’accesso verrà revocato. Le sessioni attive non saranno più valide.',confirm:'Disabilita account',danger:true},
    'cancel-hold':{title:'Annullare la prenotazione?',detail:'Per richiedere di nuovo questo titolo sarà necessario inviare una nuova prenotazione.',confirm:'Annulla prenotazione',danger:false},
    return:{title:'Confermare la restituzione?',detail:'Verifica di avere ricevuto fisicamente la copia prima di registrare il rientro.',confirm:'Conferma restituzione',danger:false}
  };
  return copy[action]||null;
}

export function localAvailability(n){
 if(!Number.isSafeInteger(n)||n<0)return {status:'unknown',source:'lumen',epistemic:'unknown',label:'Disponibilità da verificare'};
 if(n===0)return {status:'unavailable',source:'lumen',epistemic:'supported',label:'Nessuna copia disponibile ora'};
 return {status:'available',source:'lumen',epistemic:'supported',label:n===1?'1 copia disponibile':n+' copie disponibili'};
}
export function localHoldResult(receipt){
 if(receipt?.status==='ready')return {status:'ready',epistemic:'supported',message:'Prenotazione pronta per il ritiro. Consulta la tua area.'};
 if(receipt?.status==='queued')return {status:'queued',epistemic:'supported',message:'Prenotazione in coda. Segui gli aggiornamenti nella tua area.'};
 return {status:'unknown',epistemic:'unknown',message:'Esito da verificare. Controlla la tua area prima di riprovare.'};
}

/** Standalone statuses only; unknown statuses are never presented as successful. */
export function localStatus(domain,status){
 const maps={
  loan:{active:'In prestito',returned:'Restituito'},
  hold:{queued:'In coda',ready:'Pronto al ritiro',fulfilled:'Consegnata',cancelled:'Annullata'},
  suggestion:{pending:'In valutazione',approved:'Approvata',rejected:'Non accolta',ordered:'Ordinata'}
 };
 const label=maps[domain]?.[status];
 return Object.freeze(label?{label,epistemic:'supported'}:{label:'Stato da verificare',epistemic:'unknown'});
}
/** Successful local mutation transport is not automatically proof of downstream delivery. */
export function localActionFeedback(action){
 const messages={
  book:'Titolo aggiunto al catalogo LUMEN.',
  user:'Account creato. Comunica le credenziali con un canale sicuro.',
  checkout:'Prestito registrato nel catalogo LUMEN.',
  broadcast:'Comunicazione inserita nella casella avvisi dei destinatari.'
 };
 return messages[action]||null;
}

/** Feedback is displayed only after the matching standalone API succeeds. */
export function localClickFeedback(action){
 const messages={
  'cancel-hold':'Prenotazione annullata.',
  renew:'Prestito rinnovato nel catalogo LUMEN.',
  return:'Restituzione registrata nel catalogo LUMEN.',
  disable:'Account disabilitato. Accessi revocati.',
  'issue-ready':'Prestito registrato nel catalogo LUMEN.',
  approve:'Proposta approvata.',
  reject:'Proposta non accolta.',
  ordered:'Proposta segnata come ordinata.',
  read:'Comunicazione segnata come letta.'
 };
 return messages[action]||null;
}
