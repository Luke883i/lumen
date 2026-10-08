// R6 institutional OIDC. openid-client owns the protocol, PKCE and ID-token validation.
// LUMEN owns one-time state, explicit subject binding, sessions and RBAC.
// This module is NOT an identity provider or a replacement for institutional lifecycle.
import {randomBytes,createHash} from 'node:crypto';
import {newId,now,tokenHash} from './store.mjs';
import {Failure} from './service.mjs';
const denied=(status,code,message)=>{throw new Failure(status,code,message);};
const random=()=>randomBytes(32).toString('base64url');
const digest=t=>createHash('sha256').update(t).digest('hex');
const isSubject=s=>typeof s==='string'&&s.length>0&&s.length<=255&&!/[\u0000-\u001f]/.test(s);
export function oidcConfiguration(env=process.env){
  const keys=['OIDC_ISSUER','OIDC_CLIENT_ID','OIDC_CLIENT_SECRET','OIDC_REDIRECT_URI'];
  const values=keys.filter(k=>!!env[k]);
  if(!values.length){
    if(env.OIDC_ONLY==='1')throw Error('OIDC_CONFIGURATION: OIDC_ONLY requires a configured provider');
    return {enabled:false};
  }
  if(values.length!==keys.length)throw Error('OIDC_CONFIGURATION: issuer, client id/secret and redirect URI are required together');
  const issuer=new URL(env.OIDC_ISSUER),redirect=new URL(env.OIDC_REDIRECT_URI);
  const loopback=env.NODE_ENV==='test'&&redirect.protocol==='http:'&&['127.0.0.1','localhost'].includes(redirect.hostname);
  if(issuer.protocol!=='https:'||issuer.username||issuer.password||issuer.hash||issuer.search||
      (redirect.protocol!=='https:'&&!loopback)||redirect.username||redirect.password||redirect.search||redirect.hash||
      redirect.pathname!=='/api/auth/oidc/callback')throw Error('OIDC_CONFIGURATION: invalid HTTPS issuer or callback');
  return {enabled:true,issuer:issuer.href,clientId:env.OIDC_CLIENT_ID,
    clientSecret:env.OIDC_CLIENT_SECRET,redirectUri:redirect.href,oidcOnly:env.OIDC_ONLY==='1'};
}
export function createOidc(s,env=process.env,provider=null){
  const settings=oidcConfiguration(env);
  let cached=null,loading=null;
  async function implementation(){
    if(provider)return provider;
    if(!cached)cached=await import('openid-client');
    return cached;
  }
  async function configured(){
    if(!settings.enabled)denied(503,'OIDC_DISABLED','SSO istituzionale non configurato');
    if(loading)return loading;
    loading=(async()=>{
      const lib=await implementation();
      const config=await lib.discovery(new URL(settings.issuer),settings.clientId,settings.clientSecret);
      if(config.serverMetadata().issuer!==settings.issuer.replace(/\/$/,''))throw Error('OIDC_ISSUER_MISMATCH');
      return {lib,config};
    })();
    try{return await loading;}catch(e){loading=null;throw e;}
  }
  const requireStaff=actor=>{
    if(!actor)denied(401,'AUTH_REQUIRED','Autenticazione richiesta');
    const u=s.get('SELECT role,active FROM users WHERE id=?',actor.id);
    if(!u?.active||u.role!=='librarian'||actor.role!=='librarian')
      denied(403,'FORBIDDEN','Solo un bibliotecario attivo può associare identità');
  };
  return {
    enabled:settings.enabled,only:settings.enabled&&settings.oidcOnly,
    async start(){
      const {lib,config}=await configured();
      const state=random(),flow=random(),nonce=random(),verifier=lib.randomPKCECodeVerifier();
      const params={redirect_uri:settings.redirectUri,scope:'openid email',
        response_type:'code',state,nonce,
        code_challenge:await lib.calculatePKCECodeChallenge(verifier),
        code_challenge_method:'S256'};
      const authorization=lib.buildAuthorizationUrl(config,params);
      if(authorization.protocol!=='https:')denied(503,'OIDC_AUTHORIZATION_URL_INVALID','Provider identity non attendibile');
      s.tx(()=>{
        s.run('DELETE FROM oidc_flows WHERE expires_at<?',now());
        s.run('INSERT INTO oidc_flows(flow_hash,state_hash,verifier,nonce,expires_at) VALUES(?,?,?,?,?)',
          digest(flow),digest(state),verifier,nonce,new Date(Date.now()+300000).toISOString());
      });
      return {redirect:authorization.href,flow};
    },
    async finish(flow,state,callbackQuery){
      if(typeof flow!=='string'||!flow||typeof state!=='string'||!state)
        denied(403,'OIDC_STATE_REQUIRED','Flusso SSO non valido');
      // Consume before any network operation: replay and parallel callbacks are blocked.
      const pending=s.tx(()=>{
        const row=s.get('SELECT * FROM oidc_flows WHERE flow_hash=? AND state_hash=? AND expires_at>?',
          digest(flow),digest(state),now());
        if(!row)denied(403,'OIDC_STATE_INVALID','Flusso scaduto, già usato o non corrispondente');
        s.run('DELETE FROM oidc_flows WHERE flow_hash=?',digest(flow));
        return row;
      });
      const {lib,config}=await configured();
      const uri=new URL(settings.redirectUri);
      for(const [key,value] of new URLSearchParams(callbackQuery))uri.searchParams.append(key,value);
      const tokens=await lib.authorizationCodeGrant(config,uri,{
        expectedState:state,expectedNonce:pending.nonce,pkceCodeVerifier:pending.verifier,idTokenExpected:true
      });
      const claims=tokens.getValidatedIdTokenClaims?.();
      if(!claims||claims.iss!==settings.issuer.replace(/\/$/,'')||!isSubject(claims.sub)||
        typeof claims.email!=='string'||claims.email_verified!==true)
        denied(403,'OIDC_CLAIMS_INVALID','Identità istituzionale non verificabile');
      const binding=s.get('SELECT u.* FROM oidc_bindings b JOIN users u ON u.id=b.user_id WHERE b.issuer=? AND b.subject=?',
        claims.iss,claims.sub);
      if(!binding||!binding.active)denied(403,'OIDC_UNLINKED','Chiedi alla biblioteca di abilitare il tuo account istituzionale');
      if(binding.email.toLowerCase()!==claims.email.toLowerCase())
        denied(403,'OIDC_EMAIL_MISMATCH','Email istituzionale non corrispondente alla registrazione');
      // Role is exclusively sourced from the LUMEN database, never from token groups/claims.
      const token=random(),csrf=random(),expiry=new Date(Date.now()+43200000).toISOString();
      s.tx(()=>{
        const fresh=s.get('SELECT active FROM users WHERE id=?',binding.id);
        if(!fresh?.active)denied(403,'ACCOUNT_DISABLED','Account non attivo');
        s.run('DELETE FROM sessions WHERE expires_at<?',now());
        s.run('INSERT INTO sessions(token_hash,user_id,csrf,expires_at) VALUES(?,?,?,?)',tokenHash(token),binding.id,csrf,expiry);
        s.run('DELETE FROM sessions WHERE user_id=? AND token_hash NOT IN (SELECT token_hash FROM sessions WHERE user_id=? ORDER BY rowid DESC LIMIT 5)',binding.id,binding.id);
        s.run('INSERT INTO audit_events(actor_id,operation,request_hash,receipt_hash,idempotency_key,occurred_at) VALUES(?,?,?,?,?,?)',
          binding.id,'oidc_login',digest(JSON.stringify({issuer:claims.iss,subject:claims.sub})),digest(JSON.stringify({userId:binding.id})),null,now());
      });
      return {token,user:{id:binding.id,name:binding.name,email:binding.email,role:binding.role},csrf};
    },
    bind(staff,userId,subject){
      if(!settings.enabled)denied(503,'OIDC_DISABLED','SSO non configurato');
      requireStaff(staff);
      if(!isSubject(subject))denied(400,'OIDC_SUBJECT_INVALID','Identificativo soggetto non valido');
      return s.tx(()=>{
        requireStaff(staff);
        const user=s.get('SELECT id,active,role FROM users WHERE id=?',String(userId||''));
        if(!user?.active)denied(404,'USER_NOT_FOUND','Account non attivo');
        const used=s.get('SELECT user_id FROM oidc_bindings WHERE issuer=? AND subject=?',settings.issuer.replace(/\/$/,''),subject);
        if(used&&used.user_id!==user.id)denied(409,'OIDC_SUBJECT_IN_USE','Identità già associata');
        const previous=s.get('SELECT subject FROM oidc_bindings WHERE user_id=?',user.id);
        if(previous&&previous.subject!==subject)denied(409,'OIDC_BINDING_EXISTS','La sostituzione dell’identità richiede una procedura di recupero dedicata');
        const result=s.run('INSERT OR IGNORE INTO oidc_bindings(user_id,issuer,subject,linked_by,linked_at) VALUES(?,?,?,?,?)',
          user.id,settings.issuer.replace(/\/$/,''),subject,staff.id,now());
        if(result.changes) s.run('INSERT INTO audit_events(actor_id,operation,request_hash,receipt_hash,idempotency_key,occurred_at) VALUES(?,?,?,?,?,?)',
          staff.id,'oidc_bind',digest(JSON.stringify({issuer:settings.issuer,subject})),
          digest(JSON.stringify({userId:user.id})),null,now());
        return {userId:user.id,linked:true};
      });
    }
  };
}
