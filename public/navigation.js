// UX-S3: pure task-based IA. No backend authority or side effects.
export const STAFF_AREAS=Object.freeze([
  {id:'panoramica',label:'Panoramica',hint:'Volumi, code e priorità del banco.'},
  {id:'circolazione',label:'Circolazione',hint:'Consegne, restituzioni e ritiri pronti.'},
  {id:'catalogo',label:'Catalogo',hint:'Registra titoli e copie LUMEN.'},
  {id:'acquisti',label:'Acquisizioni',hint:'Valuta le proposte inviate dai docenti.'},
  {id:'persone',label:'Persone',hint:'Account e profili autorizzati.'},
  {id:'comunicazioni',label:'Comunicazioni',hint:'Invia avvisi nella casella degli utenti.'},
  {id:'integrazioni',label:'Integrazioni',hint:'Collegamenti e verifiche Koha/SSO.'}
]);
export function staffArea(value){
  return STAFF_AREAS.find(area=>area.id===value)?.id||'panoramica';
}
export function staffAreaFromSearch(search=''){
  return staffArea(new URLSearchParams(String(search).replace(/^\?/, '')).get('area'));
}
export function activeNavigation(path,target){
  if(target==='/')return path==='/';
  if(target==='/me')return path==='/me'||path==='/me/prenotazioni';
  if(target==='/koha')return path==='/koha'||(path.startsWith('/koha/')&&!['/koha/me','/koha/loans'].some(x=>path===x));
  return path===target||path.startsWith(target+'/');
}
export function roleNavigation({role=null,authenticated=false,koha=false,kohaWrite=false,kohaLoans=false}={}){
  const logged=authenticated===true;
  const primary=[
    {path:'/',label:'Home',icon:'home'},
    {path:'/catalogo',label:'Catalogo',icon:'search'},
    ...(logged?[{path:'/me',label:'La mia area',icon:'book'},{path:'/notifiche',label:'Avvisi',icon:'bell'}]:[]),
    ...(logged&&role==='faculty'?[{path:'/acquisti',label:'Proposte',icon:'cap'}]:[]),
    ...(logged&&role==='librarian'?[{path:'/staff',label:'Banco',icon:'settings'}]:[])
  ];
  const secondary=[
    ...(koha?[{path:'/koha',label:'Catalogo Koha'}]:[]),
    ...(logged&&kohaWrite?[{path:'/koha/me',label:'Prenotazioni Koha'}]:[]),
    ...(logged&&kohaLoans?[{path:'/koha/loans',label:'Prestiti Koha'}]:[]),
    ...(logged?[{path:'/impostazioni',label:'Impostazioni'}]:[]),
    {path:'/installazione',label:'Installa LUMEN'}
  ];
  return {primary,secondary};
}
export function taskLinks({role=null,authenticated=false,koha=false,kohaWrite=false,kohaLoans=false}={}){
  if(!authenticated)return [{path:'/catalogo',label:'Cerca nel catalogo',detail:'Titoli, autori e ISBN.'},
    {path:'/accedi',label:'Accedi alla biblioteca',detail:'Gestisci prestiti e prenotazioni.'}];
  const tasks=[
    {path:'/me',label:'La mia area',detail:'Prestiti e prenotazioni LUMEN.'},
    ...(role==='faculty'?[{path:'/acquisti',label:'Proponi un acquisto',detail:'Invia e segui una proposta.'}]:[]),
    ...(role==='librarian'?[{path:'/staff',label:'Apri il banco',detail:'Operazioni e priorità della biblioteca.'}]:[]),
    {path:'/notifiche',label:'Leggi gli avvisi',detail:'Comunicazioni nella tua casella.'},
    ...(koha?[{path:'/koha',label:'Consulta Koha',detail:'Catalogo della biblioteca collegata.'}]:[]),
    ...(kohaWrite?[{path:'/koha/me',label:'Prenotazioni Koha',detail:'Richieste gestite da Koha.'}]:[]),
    ...(kohaLoans?[{path:'/koha/loans',label:'Prestiti Koha',detail:'Prestiti e rinnovi gestiti da Koha.'}]:[])
  ];
  return tasks;
}
