// Validate Web Push VAPID encryption material at ingestion, not only when
// the worker first tries to encrypt a notification.
// p256dh: uncompressed P-256 curve point (65 octets); auth: 16 random octets.
import {ECDH} from 'node:crypto';
const decode=(value,length)=>{
  if(typeof value!=='string'||value.length>120||!(/^[A-Za-z0-9_-]+={0,2}$/.test(value)))return null;
  const bytes=Buffer.from(value,'base64url');
  if(bytes.length!==length||bytes.toString('base64url')!==value.replace(/=+$/,''))return null;
  return bytes;
};
export function validPushKeys(keys){
  const point=decode(keys?.p256dh,65),auth=decode(keys?.auth,16);
  if(!point||!auth||point[0]!==4)return false;
  try {ECDH.convertKey(point,'prime256v1',undefined,undefined,'compressed');return true;}
  catch{return false;}
}
