// Koha 25.11 read-only catalogue adapter.
// This adapter NEVER mutates circulation. Koha becomes authoritative only for
// biblios served by this namespace; standalone titles remain separate.
export class KohaError extends Error {
  constructor(code,message,status=503) { super(message);this.code=code;this.status=status; }
}
const no=()=>{throw new KohaError('KOHA_NOT_CONFIGURED','Connessione Koha non configurata');};
const str=(x,max=200)=>typeof x==='string'?x.slice(0,max):'';
export function makeKoha(config=process.env,transport=fetch){
  const configured=!!(config.KOHA_BASE_URL&&config.KOHA_CLIENT_ID&&config.KOHA_CLIENT_SECRET);
  if(!configured)return {configured:false,status:()=>no(),search:()=>no(),detail:()=>no()};
  const url=new URL(config.KOHA_BASE_URL);
  const localTest=config.NODE_ENV==='test'&&url.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(url.hostname);
  if((url.protocol!=='https:'&&!localTest)||url.username||url.password||url.search||url.hash)
    throw new KohaError('KOHA_CONFIGURATION','Koha richiede URL HTTPS e senza credenziali nella URL',500);
  const root=url.toString().replace(/\/+$/,'');
  if(url.pathname!=='/' && url.pathname!=='') throw new KohaError('KOHA_CONFIGURATION','Indica KOHA_BASE_URL senza /api/v1',500);
  let bearer='',expires=0,refresh=null;
  async function request(path,{method='GET',headers={},body}={}){
    let response;
    try {response=await transport(root+path,{method,headers,body,redirect:'error',signal:AbortSignal.timeout(6500)});}
    catch {throw new KohaError('KOHA_NETWORK','Impossibile raggiungere Koha');}
    if(!response.ok) throw new KohaError('KOHA_HTTP_'+response.status,'Servizio Koha indisponibile o permessi API insufficienti',response.status===404?404:503);
    try {return await response.json();}catch{throw new KohaError('KOHA_BAD_JSON','Risposta Koha non conforme');}
  }
  async function token(){
    if(Date.now()<expires&&bearer)return bearer;
    if(refresh)return refresh;
    refresh=(async()=>{
      const credentials=Buffer.from(config.KOHA_CLIENT_ID+':'+config.KOHA_CLIENT_SECRET).toString('base64');
      const r=await request('/api/v1/oauth/token',{
        method:'POST',
        headers:{Authorization:'Basic '+credentials,'Content-Type':'application/x-www-form-urlencoded'},
        body:'grant_type=client_credentials'
      });
      if(!r.access_token||r.token_type?.toLowerCase()!=='bearer')throw new KohaError('KOHA_TOKEN_INVALID','OAuth Koha ha restituito token non valido');
      bearer=r.access_token;
      expires=Date.now()+Math.max(30000,Math.min(3600000,(Number(r.expires_in)||300)*1000-60000));
      return bearer;
    })();
    try{return await refresh;}finally{refresh=null;}
  }
  async function get(path){
    const authorization=await token();
    return request(path,{headers:{Authorization:'Bearer '+authorization,Accept:'application/json'}});
  }
  function normalized(b){
    return {id:'koha:'+String(b.biblio_id),title:str(b.title),author:str(b.author),isbn:str(b.isbn),subject:str(b.subject),description:str(b.abstract),source:'koha',availability:'unknown'};
  }
  return {
    configured:true,
    async status(){const data=await get('/api/v1/libraries?_per_page=1');if(!Array.isArray(data))throw new KohaError('KOHA_SCHEMA','Struttura biblioteche Koha non riconosciuta');return {configured:true,connected:true,mode:'read_only',libraries_sample:data.length};},
    async search(query=''){
      const term=str(query,120).trim();
      const params=new URLSearchParams({_page:'1',_per_page:'50'});
      if(term){
        // Koha q supports JSON query filters; bind user input as a JSON value, never a DSL fragment.
        const like='%'+term.replace(/[%_]/g,'\\$&')+'%';
        params.set('q',JSON.stringify({"-or":[{"title":{"-like":like}},{"author":{"-like":like}},{"isbn":{"-like":like}}]}));
      }
      const data=await get('/api/v1/biblios?'+params.toString());
      if(!Array.isArray(data))throw new KohaError('KOHA_SCHEMA','Struttura catalogo Koha non riconosciuta');
      return {items:data.map(normalized),truncated:data.length===50,source:'koha',read_only:true};
    },
    async detail(id){
      if(!/^[1-9]\d{0,11}$/.test(String(id)))throw new KohaError('KOHA_ID_INVALID','Identificativo Koha non valido',400);
      const [b,items]=await Promise.all([
        get('/api/v1/biblios/'+id),
        get('/api/v1/biblios/'+id+'/items?_per_page=100')
      ]);
      if(!b||!Array.isArray(items))throw new KohaError('KOHA_SCHEMA','Dati Koha non conformi');
      return {...normalized(b),copies:items.length,items:items.map(x=>({id:String(x.item_id),barcode:str(x.external_id),shelf:str(x.location),loanStatus:'unknown'})),read_only:true};
    }
  };
}
