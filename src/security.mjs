// BIME security boundary: pure HTTP origin policy + explicit revocation invariant.
// No external library and no implicit trust in reverse-proxy forwarding headers.
export function trustedOrigin(origin,host,{production=false}={}){
  if(typeof origin!=='string'||typeof host!=='string')return false;
  if(!origin||!host||origin.length>256||host.length>256||
      !/^[a-zA-Z0-9.\-:[\]]+$/.test(host))return false;
  try{
    const url=new URL(origin);
    // Origin header must be a serialized origin, not a navigable URL.
    if(url.origin!==origin||url.host!==host||url.username||url.password||
       url.search||url.hash||url.pathname!=='/')return false;
    if(production)return url.protocol==='https:';
    return url.protocol==='http:'||url.protocol==='https:';
  }catch{return false;}
}
export function pruneRevokedPush(s){
  // Idempotent in an enclosing SQLite write transaction. Push subscriptions
  // remain valid while an unexpired or expired-but-not-deleted session row
  // exists; explicit session revocation always cuts off provider delivery.
  return s.run('DELETE FROM subscriptions WHERE session_hash NOT IN (SELECT token_hash FROM sessions)').changes;
}

/** Bounded per-process throttle state. Never treat this as a distributed WAF. */
export function registerLoginAttempt(hits,key,at,{windowMs=900000,maxEntries=20000}={}){
  if(!(hits instanceof Map)||typeof key!=='string'||!Number.isFinite(at)||
     !Number.isSafeInteger(maxEntries)||maxEntries<1)throw Error('LOGIN_LIMIT_CONFIGURATION');
  const previous=hits.get(key);
  if(previous&&at-previous.from>=0&&at-previous.from<=windowMs){
    previous.n++;
    return previous.n;
  }
  // Reinsert fresh entries so eviction order is deterministic and bounded.
  hits.delete(key);
  if(hits.size>=maxEntries)hits.delete(hits.keys().next().value);
  hits.set(key,{from:at,n:1});
  return 1;
}
