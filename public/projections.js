// UX-S2: presentation-only selectors. Imported by browser; no network, storage,
// authorization writes or direct DOM access are permitted in this module.
import {localAvailability,localStatus} from './experience.js';

const roles=new Set(['student','faculty','librarian']);
const freeze=value=>Object.freeze(value);
const view=(domain,source,{label,helper,epistemicStatus='unknown',action=null,status='unknown'}={})=>freeze({
  domain,provenance:source,label,helper,status,epistemicStatus,
  action:action?freeze(action):null
});
const normalized=x=>typeof x==='string'&&x.length<=200?x:'';
const route=(prefix,id)=>normalized(id)?prefix+encodeURIComponent(id):null;
const actorRole=role=>roles.has(role)?role:null;
const attempt=(label,enabled,reason)=>({label,enabled,reason:enabled?null:reason});

// Only catalog stock from standalone SQLite is counted as locally available.
// Koha copy counts are never transformed into Koha loan availability.
export function projectLocalBook(book,{role=null}={}){
 const amount=localAvailability(book?.available);
 const id=normalized(book?.id);
 const capable=!!actorRole(role)&&!!id;
 return view('book','lumen.standalone.catalog',{
  label:amount.label,status:amount.status,epistemicStatus:amount.epistemic,
  helper:amount.status==='available'
    ?'Disponibilità del catalogo LUMEN: la prenotazione non equivale a un prestito.'
    :amount.status==='unavailable'
    ?'Nessuna copia disponibile ora; puoi comunque chiedere di entrare in coda.'
    :'Il dato sulle copie non è verificabile. Consulta la biblioteca.',
  action:freeze({...attempt('Invia prenotazione',capable,
    !id?'Identificativo del titolo non disponibile.':'Accedi per inviare la prenotazione.'),
    href:route('/catalogo/',id),epistemicStatus:capable?'conditional':'blocked'})
 });
}

export function projectKohaBook(book,{configured=false,writeEnabled=false,mapped=false,role=null}={}){
 // Koha bibliographic IDs are namespaced as koha:<numeric biblio_id>.
 // The route must use only the validated numeric part, never the source prefix.
 const id=normalized(book?.id);
 const kohaId=/^koha:([1-9][0-9]*)$/.exec(id)?.[1]||'';
 const authenticated=!!actorRole(role);
 const requestable=!!configured&&!!writeEnabled&&mapped===true&&authenticated&&!!kohaId;
 const reason=!configured?'Koha non configurato.':
   !writeEnabled?'Prenotazioni Koha non attive.':
   !authenticated?'Accedi prima di richiedere una prenotazione.':
   mapped!==true?'Identità Koha da associare o verificare.':
   !kohaId?'Identificativo Koha da verificare.':null;
 return view('book','koha.bibliographic',{
  status:configured?'availability_unknown':'unconfigured',
  epistemicStatus:configured?'unknown':'blocked',
  label:configured?'Disponibilità al prestito da verificare su Koha':'Catalogo Koha non configurato',
  helper:'Le copie catalogate non dimostrano che una copia sia prestabile o disponibile.',
  action:freeze({...attempt('Richiedi prenotazione Koha',requestable,reason),
    href:route('/koha/',kohaId),epistemicStatus:requestable?'conditional':'blocked'})
 });
}

export function projectLocalHold(hold){
 const state=localStatus('hold',hold?.status);
 const cancellable=['ready','queued'].includes(hold?.status);
 return view('hold','lumen.standalone.holds',{
  label:state.label,status:state.epistemic==='supported'?hold.status:'unknown',
  epistemicStatus:state.epistemic,
  helper:hold?.status==='ready'?'Il prestito si perfeziona solo quando la biblioteca registra la consegna.':
    hold?.status==='queued'?'La posizione e i tempi di attesa possono cambiare.':
    state.epistemic==='unknown'?'Verifica la prenotazione prima di ripetere una richiesta.':
    'Consulta la cronologia nella tua area.',
  action:freeze({...attempt('Annulla prenotazione',cancellable,
    'La prenotazione non è più annullabile in questo stato.'),
    epistemicStatus:cancellable?'conditional':'blocked'})
 });
}

export function projectLocalLoan(loan){
 const state=localStatus('loan',loan?.status);
 const eligible=loan?.status==='active'&&loan?.renewal_count===0;
 return view('loan','lumen.standalone.loans',{
  label:state.label,status:state.epistemic==='supported'?loan.status:'unknown',
  epistemicStatus:state.epistemic,
  helper:eligible?'Il rinnovo dipende dalle regole della biblioteca e dall’assenza di utenti in coda.':
    loan?.status==='active'?'Il rinnovo automatico non è disponibile per questo prestito.':
    state.epistemic==='unknown'?'Stato del prestito da verificare.':
    'Questo prestito risulta restituito.',
  action:freeze({...attempt('Chiedi rinnovo',eligible,
    'Rinnovo non disponibile in questa fase.'),
    epistemicStatus:eligible?'conditional':'blocked'})
 });
}

export function projectAcquisition(proposal){
 const state=localStatus('suggestion',proposal?.status);
 const helper={
   pending:'La proposta è in valutazione, non è un ordine.',
   approved:'La biblioteca ha approvato la proposta, non ne risulta ancora l’acquisto.',
   rejected:'La proposta non è stata accolta.',
   ordered:'Il titolo risulta ordinato, non necessariamente ricevuto o disponibile.'
 };
 return view('acquisition','lumen.standalone.acquisitions',{
  label:state.label,status:state.epistemic==='supported'?proposal.status:'unknown',
  epistemicStatus:state.epistemic,helper:helper[proposal?.status]||'Esito della proposta da verificare.'
 });
}

export function projectNotification(notification){
 const record=notification&&typeof notification==='object'?notification:null;
 const hasRecord=!!record&&typeof record.id==='string'&&record.id.length>0;
 const hasReadField=hasRecord&&Object.hasOwn(record,'read_at');
 const unread=hasReadField&&record.read_at===null;
 const read=hasReadField&&typeof record.read_at==='string'&&
   /^\d{4}-\d{2}-\d{2}T/.test(record.read_at)&&Number.isFinite(Date.parse(record.read_at));
 const known=unread||read;
 return view('notification','lumen.inbox',{
  label:known?(unread?'Da leggere':'Letta'):'Comunicazione da verificare',
  status:known?(unread?'unread':'read'):'unknown',epistemicStatus:known?'supported':'unknown',
  helper:'La casella avvisi è distinta dalla consegna delle notifiche di sistema.',
  action:freeze({...attempt('Segna come letta',unread,
    'Questa comunicazione non richiede una conferma di lettura.'),
    epistemicStatus:unread?'conditional':'blocked'})
 });
}

export function projectPatron(user){
 const role=actorRole(user?.role);
 // Session UI is advisory, but an explicitly inactive identity must never
 // acquire visible staff/faculty affordances.
 const known=!!role&&typeof user?.id==='string'&&user.id.length>0&&user.active!==false;
 const label=role==='faculty'?'Docente':role==='student'?'Studente':
   role==='librarian'?'Bibliotecario':'Ospite';
 const capabilities=freeze({
   search:true,
   holds:known,
   loans:known,
   acquisitions:known&&role==='faculty',
   staff:known&&role==='librarian',
   inbox:known
 });
 return freeze({domain:'patron',provenance:'lumen.session',label,
   status:known?'authenticated':'guest_or_unknown',epistemicStatus:known?'conditional':'unknown',
   helper:'Le funzioni mostrate non sostituiscono i permessi verificati dal server.',
   capabilities});
}

// Operational proof is separate from a human-readable transport status.
// No network success is inferred from a client-side pending/timeout state.
export function projectKohaOperation(operation){
 const state=normalized(operation?.state);
 const proven=!!operation?.proofVerified && ['verified','reconciled'].includes(state);
 const pending=['pending','prepared','submitted'].includes(state);
 const blocked=['failed','rejected'].includes(state);
 return view('operation','koha.receipt',{
  status:proven?'verified':pending?'pending':blocked?'blocked':'uncertain',
  epistemicStatus:proven?'supported':blocked?'blocked':pending?'conditional':'unknown',
  label:proven?'Esito verificato su Koha':pending?'Verifica Koha in corso':
    blocked?'Operazione non completata':'Esito Koha da riconciliare',
  helper:proven?'Ricevuta verificata dal backend Koha.':
    blocked?'Consulta il motivo del rifiuto prima di inviare un’altra richiesta.':
    'Non ripetere automaticamente l’operazione: verifica la ricevuta nel gestionale.',
  action:freeze({...attempt('Verifica su Koha',!proven&&!blocked,
    proven?'Operazione già verificata.':'Operazione non ripetibile automaticamente.'),
    epistemicStatus:'conditional'})
 });
}
