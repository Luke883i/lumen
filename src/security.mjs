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
