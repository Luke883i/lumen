// Browser-format Web Push test keys. No persistent personal or private data.
import {createECDH,randomBytes} from 'node:crypto';
const testKey=createECDH('prime256v1');testKey.generateKeys();
export const pushKeys=Object.freeze({
 p256dh:testKey.getPublicKey().toString('base64url'),
 auth:randomBytes(16).toString('base64url')
});
