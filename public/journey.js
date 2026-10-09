// LUMEN UX closure: one *non-authoritative* next-task projection.
// This module has no I/O, no mutable globals, no permission grants, and no
// knowledge of actual Koha loan state. Backend receipts remain authoritative.
const tasks=Object.freeze({
  guest:Object.freeze({href:'/catalogo',label:'Cerca nel catalogo',
    detail:'Esplora titoli, autori e ISBN. Accedi per richiedere servizi.'}),
  student:Object.freeze({href:'/me',label:'Controlla prestiti e prenotazioni',
    detail:'Apri la tua area per verificare richieste, ritiri e scadenze.'}),
  faculty:Object.freeze({href:'/acquisti',label:'Segui le proposte di acquisto',
    detail:'Invia una proposta o verifica il suo stato; non è un acquisto.'}),
  librarian:Object.freeze({href:'/staff',label:'Apri il banco bibliotecario',
    detail:'Gestisci le attività autorizzate e verifica le richieste in sospeso.'})
});
export function nextJourney({role=null,authenticated=false,source='lumen',
  koha=false,online=true}={}){
  const known=authenticated===true&&Object.hasOwn(tasks,role)&&role!=='guest';
  const key=known?role:'guest';
  const external=source==='koha'&&koha===true&&online===true;
  const offline=online===false;
  const task=external
    ?{href:'/koha',label:'Consulta il catalogo Koha',
      detail:'I record bibliografici non dimostrano la disponibilità al prestito.'}
    :tasks[key];
  return Object.freeze({
    ...task,
    href:offline?null:task.href,
    enabled:!offline,
    provenance:external?'koha.navigation_only':'lumen.navigation_only',
    epistemicStatus:offline?'blocked':'conditional',
    role:key,
    detail:offline?'Per verificare dati e richieste torna online. Nessuna operazione è stata eseguita.':task.detail
  });
}
