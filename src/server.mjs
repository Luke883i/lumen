import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, sep, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openStore, bootstrap } from './store.mjs';
import { createService, Failure } from './service.mjs';
import { makeKoha } from './koha.mjs';
import { createKohaCirculation } from './koha-circulation.mjs';
import { createKohaLoans } from './koha-loans.mjs';
import { createKohaReturns } from './koha-returns.mjs';
import { createOidc } from './oidc.mjs';
import {trustedOrigin,registerLoginAttempt} from './security.mjs';

const s=openStore(process.env.LUMEN_DB_PATH || './data/lumen.sqlite');
bootstrap(s);
const service=createService(s);
const koha=makeKoha(process.env);
const kohaCirculation=createKohaCirculation(s,koha,process.env);
const kohaLoans=createKohaLoans(s,koha,process.env);
const kohaReturns=createKohaReturns(s,koha,process.env);
const oidc=createOidc(s,process.env);
const publicDir=resolve(fileURLToPath(new URL('../public/', import.meta.url)));
const port=Number(process.env.PORT || 3000);
const prod=process.env.NODE_ENV==='production';
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.webmanifest':'application/manifest+json','.png':'image/png','.ico':'image/x-icon'};
const json=(res,status,data,headers={})=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...headers});res.end(JSON.stringify(data));};
const respond=(res,data,status=200)=>json(res,status,data);
const cookieToken=req=>{const raw=req.headers.cookie||'';const match=raw.match(/(?:^|;\s*)lumen_session=([^;]+)/);try{return match?decodeURIComponent(match[1]):'';}catch{return '';} };
const cookieAttrs=(maxAge)=>'Path=/; HttpOnly; SameSite=Lax; '+(prod?'Secure; ':'')+'Max-Age='+maxAge;
const flowCookie=(req)=>{const match=(req.headers.cookie||'').match(/(?:^|;\s*)lumen_oidc_flow=([^;]+)/);try{return match?decodeURIComponent(match[1]):'';}catch{return '';} };
const pathId=(path,prefix,suffix='')=>{
  if(!path.startsWith(prefix)||!path.endsWith(suffix))return null;
  try{return decodeURIComponent(path.slice(prefix.length,path.length-suffix.length));}
  catch{throw new Failure(400,'PATH_INVALID','Identificativo URL non valido');}
};
const readJson=async req=>{
  if(!(req.headers['content-type']||'').toLowerCase().startsWith('application/json')) throw new Failure(415,'JSON_REQUIRED','Invia JSON');
  let payload='';
  for await (const chunk of req) {
    payload+=chunk;
    if(payload.length>16384) throw new Failure(413,'TOO_LARGE','Richiesta troppo grande');
  }
  try {const data=JSON.parse(payload);if(!data||typeof data!=='object'||Array.isArray(data)) throw 0;return data;}
  catch {throw new Failure(400,'INVALID_JSON','Corpo JSON non valido');}
};
const loginHits=new Map();
function loginLimit(req,email) {
  const key=String(req.socket.remoteAddress||'unknown')+':'+String(email||'').toLowerCase().slice(0,254);
  const attempts=registerLoginAttempt(loginHits,key,Date.now());
  if(attempts>12)throw new Failure(429,'RATE_LIMIT','Troppi tentativi: riprova più tardi');
}
function requireCsrf(req,user) {
  if(!user) throw new Failure(401,'AUTH_REQUIRED','Effettua l’accesso');
  if(req.headers['x-csrf-token']!==user.csrf) throw new Failure(403,'CSRF','Token di sicurezza non valido');
}
function originGuard(req) {
  const origin=req.headers.origin;
  const host=req.headers.host;
  if(!origin||!host) throw new Failure(403,'ORIGIN_REQUIRED','Origin richiesto');
  if(!trustedOrigin(origin,host,{production:prod}))
    throw new Failure(403,'ORIGIN_MISMATCH','Richiesta cross-origin rifiutata');
}
const getPublic=async(path,res)=>{
  const p=path==='/'?'/index.html':path;
  const target=resolve(publicDir,'.'+p);
  if(target!==publicDir && !target.startsWith(publicDir+sep)) throw new Failure(404,'NOT_FOUND','Risorsa inesistente');
  let file;
  try {file=await readFile(target);} catch {if(!p.includes('.') && !p.startsWith('/api/')) file=await readFile(resolve(publicDir,'index.html'));else throw new Failure(404,'NOT_FOUND','Risorsa inesistente');}
  const ext=extname(target);
  res.writeHead(200,{'Content-Type':mime[ext]||'text/html; charset=utf-8','Cache-Control':ext==='.html'||p==='/sw.js'?'no-cache':'public, max-age=3600','X-Content-Type-Options':'nosniff'});
  res.end(file);
};

export function buildHandler({ api=service, database=s, kohaApi=koha, kohaCirculationApi=kohaCirculation, kohaLoansApi=kohaLoans, kohaReturnsApi=kohaReturns, oidcApi=oidc }={}) {
  return async (req,res)=>{
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');
    res.setHeader('X-Frame-Options','DENY');
    if(prod)res.setHeader('Strict-Transport-Security','max-age=15552000');
    res.setHeader('Permissions-Policy','camera=(), microphone=(), geolocation=()');
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; manifest-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'");
    try {
      const url=new URL(req.url,'http://localhost');
      const path=url.pathname,method=req.method;
      if(path==='/api/health'&&method==='GET') return respond(res,{status:'ok',db:!!database.get('SELECT 1 ok')?.ok});
      if(path==='/api/version'&&method==='GET') return respond(res,{
        service:'lumen',
        revision:process.env.RENDER_GIT_COMMIT||process.env.GIT_SHA||null,
        mode:process.env.NODE_ENV||'development'
      });
      if(method==='GET'&&path==='/api/auth/oidc/start'){
        const start=await oidcApi.start();
        res.writeHead(302,{'Location':start.redirect,'Cache-Control':'no-store',
          'Set-Cookie':'lumen_oidc_flow='+encodeURIComponent(start.flow)+'; '+cookieAttrs(300)});
        return res.end();
      }
      if(method==='GET'&&path==='/api/auth/oidc/callback'){
        // The authorization code is exchanged server-side; URL query is not logged or returned.
        try{
          const session=await oidcApi.finish(flowCookie(req),url.searchParams.get('state'),url.search);
          // Switching identities in the same browser must revoke push bound to
          // the displaced login cookie, even if the user skipped Logout.
          api.logout(cookieToken(req));
          res.writeHead(303,{'Location':'/me','Cache-Control':'no-store',
            'Set-Cookie':['lumen_session='+encodeURIComponent(session.token)+'; '+cookieAttrs(43200),
              'lumen_oidc_flow=; '+cookieAttrs(0)]});
          return res.end();
        }catch(error){
          res.writeHead(303,{'Location':'/accedi?auth_error=1','Cache-Control':'no-store',
            'Set-Cookie':'lumen_oidc_flow=; '+cookieAttrs(0)});
          return res.end();
        }
      }
      if(!path.startsWith('/api/')) {
        if(method!=='GET'&&method!=='HEAD') throw new Failure(405,'METHOD_NOT_ALLOWED','Metodo non consentito');
        return await getPublic(path,res);
      }
      const idempotencyKey=req.headers['idempotency-key']||null;
      const token=cookieToken(req);
      const rawUser=api.current(token);
      // Enabling SSO-only invalidates old password-authenticated sessions
      // without destroying independently authenticated OIDC sessions.
      const user=oidcApi.only&&rawUser?.auth_method!=='oidc'?null:rawUser;
      if(method!=='GET'&&method!=='HEAD') {
        originGuard(req);
        if(path!=='/api/login') requireCsrf(req,user);
      }
      if(method==='GET'&&path==='/api/me') return respond(res,{user:user?{id:user.id,email:user.email,name:user.name,role:user.role}:null,csrf:user?.csrf||null});
      if(method==='POST'&&path==='/api/login') {
        if(oidcApi.only)throw new Failure(403,'OIDC_ONLY','Accesso locale disabilitato: usa SSO');
        const b=await readJson(req);
        loginLimit(req,b.email);
        const result=api.login(b.email,b.password);
        api.logout(token); // Revoke any displaced browser identity's push.
        return json(res,200,{user:result.user,csrf:result.csrf},{'Set-Cookie':'lumen_session='+encodeURIComponent(result.token)+'; '+cookieAttrs(43200)});
      }
      if(method==='POST'&&path==='/api/logout'){api.logout(token);return json(res,200,{ok:true},{'Set-Cookie':'lumen_session=; '+cookieAttrs(0)});}
      if(method==='GET'&&path==='/api/config') return respond(res,{identity:{oidcEnabled:oidcApi.enabled,oidcOnly:oidcApi.only},koha:{configured:kohaApi.configured,mode:kohaLoansApi.enabled?'circulation_pilot':kohaCirculationApi.enabled?'patron_holds_pilot':'read_only',holdsEnabled:kohaCirculationApi.enabled,loansEnabled:kohaLoansApi.enabled,returnsEnabled:kohaReturnsApi.enabled}});
      if(method==='POST'&&path==='/api/staff/oidc/bind'){
        const body=await readJson(req);
        return respond(res,oidcApi.bind(user,body.userId,body.subject));
      }
      if(method==='GET'&&path==='/api/staff/koha/returns') return respond(res,kohaReturnsApi.list(user));
      if(method==='POST'&&path==='/api/staff/koha/returns/prepare'){
        const body=await readJson(req);
        return respond(res,await kohaReturnsApi.prepare(user,body.checkoutId,idempotencyKey),201);
      }
      if(method==='POST'&&path==='/api/staff/koha/returns/verify'){
        const body=await readJson(req);
        return respond(res,await kohaReturnsApi.verify(user,body.ticketId));
      }
      if(method==='GET'&&path==='/api/integrations/koha/my/loans') return respond(res,await kohaLoansApi.mine(user));
      if(method==='POST'&&path==='/api/integrations/koha/my/renew'){
        const body=await readJson(req);
        return respond(res,await kohaLoansApi.renew(user,body.checkoutId,idempotencyKey));
      }
      if(method==='POST'&&path==='/api/staff/koha/checkout'){
        const body=await readJson(req);
        return respond(res,await kohaLoansApi.issue(user,body.userId,body.itemId,idempotencyKey),201);
      }
      if(method==='GET'&&path==='/api/staff/koha/loans-pending') return respond(res,kohaLoansApi.pending(user));
      if(method==='POST'&&path==='/api/staff/koha/loans-reconcile'){
        const body=await readJson(req);
        return respond(res,await kohaLoansApi.reconcile(user,body.attemptId,body.checkoutId));
      }
      if(method==='GET'&&path==='/api/integrations/koha/my/binding') return respond(res,kohaCirculationApi.getBinding(user));
      if(method==='GET'&&path==='/api/integrations/koha/my/holds') return respond(res,await kohaCirculationApi.myHolds(user));
      if(method==='POST'&&path==='/api/integrations/koha/my/holds'){
        const b=await readJson(req);
        return respond(res,await kohaCirculationApi.placeHold(user,b.biblioId,idempotencyKey),201);
      }
      if(method==='POST'&&path==='/api/staff/koha/bind'){
        const b=await readJson(req);
        return respond(res,await kohaCirculationApi.bind(user,b.userId,b.patronId));
      }
      if(method==='GET'&&path==='/api/staff/koha/pending') return respond(res,kohaCirculationApi.pending(user));
      if(method==='POST'&&path==='/api/staff/koha/reconcile'){
        const b=await readJson(req);
        return respond(res,await kohaCirculationApi.reconcile(user,b.attemptId,b.holdId));
      }
      if(method==='GET'&&path==='/api/integrations/koha/status') return respond(res,await kohaApi.status());
      if(method==='GET'&&path==='/api/integrations/koha/books') return respond(res,await kohaApi.search(url.searchParams.get('q')||''));
      if(method==='GET'&&path.startsWith('/api/integrations/koha/books/')) return respond(res,await kohaApi.detail(pathId(path,'/api/integrations/koha/books/')));
      if(method==='GET'&&path==='/api/books') return respond(res,api.books(url.searchParams.get('q')||''));
      if(method==='GET'&&path.startsWith('/api/books/')) return respond(res,api.book(pathId(path,'/api/books/')));
      if(method==='POST'&&path==='/api/change-password'){const b=await readJson(req);return respond(res,api.changePassword(user,b.oldPassword,b.newPassword));}
      if(method==='GET'&&path==='/api/holds') return respond(res,api.holds(user));
      if(method==='POST'&&path==='/api/holds') {const b=await readJson(req);return respond(res,api.requestHold(user,b.bookId,idempotencyKey),201);}
      if(method==='POST'&&path.startsWith('/api/holds/')&&path.endsWith('/cancel')) return respond(res,api.cancelHold(user,pathId(path,'/api/holds/','/cancel'),idempotencyKey));
      if(method==='GET'&&path==='/api/loans') return respond(res,api.loans(user));
      if(method==='POST'&&path.startsWith('/api/loans/')&&path.endsWith('/renew')) return respond(res,api.renew(user,pathId(path,'/api/loans/','/renew'),idempotencyKey));
      if(method==='GET'&&path==='/api/suggestions') return respond(res,api.suggestions(user));
      if(method==='POST'&&path==='/api/suggestions'){const b=await readJson(req);return respond(res,api.suggest(user,b,idempotencyKey),201);}
      if(method==='POST'&&path.startsWith('/api/suggestions/')&&path.endsWith('/review')){const b=await readJson(req);return respond(res,api.reviewSuggestion(user,pathId(path,'/api/suggestions/','/review'),b.status,idempotencyKey));}
      if(method==='GET'&&path==='/api/notifications') return respond(res,api.notifyList(user));
      if(method==='POST'&&path.startsWith('/api/notifications/')&&path.endsWith('/read')) return respond(res,api.readNotification(user,pathId(path,'/api/notifications/','/read')));
      if(method==='GET'&&path==='/api/push-config') return respond(res,{enabled:!!(process.env.VAPID_PUBLIC_KEY&&process.env.VAPID_PRIVATE_KEY),publicKey:process.env.VAPID_PUBLIC_KEY||''});
      if(method==='GET'&&path==='/api/push-subscription') return respond(res,api.subscriptionStatus(user,url.searchParams.get('endpoint')));
      if(method==='POST'&&path==='/api/push-subscription'){
        if(!(process.env.VAPID_PUBLIC_KEY&&process.env.VAPID_PRIVATE_KEY))
          throw new Failure(503,'PUSH_UNAVAILABLE','Notifiche di sistema non configurate');
        const b=await readJson(req);return respond(res,api.subscribe(user,b,token));
      }
      if(method==='DELETE'&&path==='/api/push-subscription'){const b=await readJson(req);return respond(res,api.unsubscribe(user,b.endpoint));}
      if(method==='GET'&&path==='/api/staff/audit') return respond(res,api.audit(user,url.searchParams.get('limit')));
      if(method==='GET'&&path==='/api/staff/stats') return respond(res,api.stats(user));
      if(method==='GET'&&path==='/api/staff/holds') return respond(res,api.staffHolds(user,{
        offset:url.searchParams.get('offset')===null?0:Number(url.searchParams.get('offset')),
        limit:url.searchParams.get('limit')===null?50:Number(url.searchParams.get('limit'))
      }));
      if(method==='GET'&&path==='/api/staff/users') return respond(res,api.users(user));
      if(method==='POST'&&path==='/api/staff/users'){const b=await readJson(req);return respond(res,api.createUser(user,b),201);}
      if(method==='POST'&&path.startsWith('/api/staff/users/')&&path.endsWith('/disable')) return respond(res,api.disableUser(user,pathId(path,'/api/staff/users/','/disable')));
      if(method==='POST'&&path==='/api/staff/books'){const b=await readJson(req);return respond(res,api.addBook(user,b,idempotencyKey),201);}
      if(method==='POST'&&path==='/api/staff/checkout'){const b=await readJson(req);return respond(res,api.checkout(user,b.userId,b.bookId,idempotencyKey),201);}
      if(method==='POST'&&path==='/api/staff/return'){const b=await readJson(req);return respond(res,api.returnLoan(user,b.loanId,idempotencyKey));}
      if(method==='POST'&&path==='/api/staff/broadcast'){const b=await readJson(req);return respond(res,api.broadcast(user,b,idempotencyKey));}
      throw new Failure(404,'NOT_FOUND','Endpoint inesistente');
    } catch(error) {
      const status=error instanceof Failure || error?.code?.startsWith('KOHA_') ? (error.status||503) : 500;
      if(status===500) console.error(JSON.stringify({level:'error',code:'INTERNAL',message:error.message}));
      if(!res.headersSent) json(res,status,{error:{code:error.code||'INTERNAL',message:status===500?'Errore interno del servizio':error.message}});
      else res.end();
    }
  };
}

export async function start() {
  const server=createServer(buildHandler());
  server.listen(port,'0.0.0.0',()=>console.log(JSON.stringify({service:'lumen',port,status:'listening'})));
  if(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    const { beginPushWorker }=await import('./webpush.mjs');
    beginPushWorker(s,process.env);
  }
  return server;
}
if(process.argv[1] && resolve(process.argv[1])===resolve(fileURLToPath(import.meta.url))) start().catch(e=>{console.error(e);process.exitCode=1;});
