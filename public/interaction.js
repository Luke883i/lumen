// UX-S5: presentation-only concurrency and outcome semantics.
// Does not invent backend authority or retry a library mutation.
export function createRenderEpoch(){
  let revision=0;
  return Object.freeze({
    begin:()=>++revision,
    latest:ticket=>ticket===revision,
    invalidate:()=>++revision
  });
}
export function mutationFailure({method='GET',status=0,transport='network'}={}){
  const write=!['GET','HEAD','OPTIONS'].includes(String(method).toUpperCase());
  // A write may have reached Koha/LUMEN even when its HTTP answer did not.
  const uncertain=write&&(transport==='network'||transport==='invalid_response'||status>=500);
  return Object.freeze(uncertain
    ?{kind:'uncertain',message:'Esito non verificato: la richiesta potrebbe essere stata registrata. Controlla lo stato nella tua area o chiedi alla biblioteca prima di ripetere.'}
    :{kind:'unavailable',message:'Servizio non raggiungibile. Riprova quando la connessione sarà disponibile.'});
}
export function beginAction(control,{label='Invio in corso…'}={}){
  if(!control||control.disabled||control.getAttribute('aria-busy')==='true')return null;
  const original=control.innerHTML;
  control.disabled=true;control.setAttribute('aria-busy','true');
  control.textContent=label;
  let finished=false;
  return ()=>{
    if(finished)return;
    finished=true;control.innerHTML=original;
    control.removeAttribute('aria-busy');control.disabled=false;
  };
}
export const afterAction=Object.freeze({
  hold:Object.freeze({href:'/me',label:'Segui la prenotazione'}),
  suggest:Object.freeze({href:'/acquisti',label:'Consulta le proposte'}),
  broadcast:Object.freeze({href:'/staff?area=comunicazioni',label:'Torna alle comunicazioni'})
});
