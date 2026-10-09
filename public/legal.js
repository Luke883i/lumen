// Browser-only informational projection. Server operator owns institution
// URLs; this module does not silently turn a placeholder into accepted terms.
export const softwareUsage=Object.freeze({
  title:'Come utilizzare LUMEN',
  summary:'LUMEN è il punto di accesso ai servizi della biblioteca: catalogo, prestiti, prenotazioni e comunicazioni.',
  holds:'Una prenotazione può restare in coda o essere pronta per il ritiro; non equivale a un prestito già effettuato.',
  purchases:'La proposta di acquisto inviata da un docente non costituisce approvazione, ordine o acquisizione del libro.',
  push:'La casella avvisi è il riferimento per le comunicazioni. Le notifiche del browser sono facoltative e non garantiscono la consegna.',
  license:'La licenza del codice LUMEN è distinta dalle condizioni di utilizzo dei servizi bibliotecari e dai diritti sui dati.'
});
export function institutionProjection(config={}){
 const p=config?.policies||{};
 const valid=u=>typeof u==='string'&&/^https:\/\//.test(u);
 const fields=[
  {id:'terms',title:'Regole e condizioni della biblioteca',detail:'Accesso, prenotazioni, durate, ritiri, rinnovi e reclami.'},
  {id:'privacy',title:'Protezione dei dati personali',detail:'Informativa, ruoli privacy, conservazione e diritti degli interessati.'},
  {id:'accessibility',title:'Accessibilità',detail:'Dichiarazione e canale per segnalare difficoltà di accesso.'},
  {id:'support',title:'Assistenza e contatti',detail:'Canale istituzionale per richieste e problemi del servizio.'}
 ];
 return Object.freeze({
  name:typeof config.name==='string'&&config.name.trim()?config.name.trim():null,
  status:config.completeness==='configured'?'configured':'incomplete',
  fields:Object.freeze(fields.map(item=>Object.freeze({...item,url:valid(p[item.id])?p[item.id]:null,
   status:valid(p[item.id])?'linked':'missing'})))
 });
}
