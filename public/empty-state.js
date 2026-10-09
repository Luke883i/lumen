// Renders a *confirmed* empty response, not an inferred absence of library data.
// Never called for Koha records, HTTP timeout or an unverified fetch.
const messages=Object.freeze({
  catalog:Object.freeze({message:'Nessun titolo trovato nel catalogo LUMEN.',href:'/catalogo',label:'Azzera la ricerca'}),
  holds:Object.freeze({message:'Non hai prenotazioni nel catalogo LUMEN.',href:'/catalogo',label:'Cerca un titolo'}),
  loans:Object.freeze({message:'Non risultano prestiti nel catalogo LUMEN.',href:'/catalogo',label:'Esplora il catalogo'}),
  inbox:Object.freeze({message:'Nessuna nuova comunicazione nella tua casella.',href:'/me',label:'Torna alla mia area'}),
  proposals:Object.freeze({message:'Non hai ancora inviato proposte di acquisto.',href:null,label:null}),
  featured:Object.freeze({message:'Nessun titolo da mostrare in evidenza.',href:'/catalogo',label:'Apri il catalogo'})
});
export function verifiedEmpty(kind,{confirmed=false,query=false}={}){
  if(confirmed!==true||!Object.hasOwn(messages,kind))
    return Object.freeze({status:'unknown',epistemicStatus:'unknown',
      message:'Impossibile verificare i dati in questo momento.',
      action:null,provenance:'presentation_only'});
  const data=messages[kind];
  const action=kind==='catalog'&&query!==true?null:data.href?Object.freeze({href:data.href,label:data.label}):null;
  return Object.freeze({status:'empty',epistemicStatus:'supported',message:data.message,
    action,provenance:kind==='inbox'?'lumen.inbox':'lumen.standalone'});
}
